import type { SshClient } from '../ssh/client.js';
import type {
  RuntimeConfig,
  RuntimeSetupResult,
} from './types.js';
import { DockerInstaller } from './docker-installer.js';
import { ComposeGenerator } from './compose-generator.js';
import { StateManager } from '../state/state-manager.js';

/**
 * Orquestador del setup del runtime de Docker Compose.
 * Implementa AC-4 del SPEC-0003 y AC-11 (Idempotencia).
 * Framework-agnostic: coordina instalación y configuración sin conocer el framework.
 */
export class RuntimeManager {
  private dockerInstaller: DockerInstaller;
  private composeGenerator: ComposeGenerator;
  private stateManager: StateManager;

  constructor(private sshClient: SshClient) {
    this.dockerInstaller = new DockerInstaller(sshClient);
    this.composeGenerator = new ComposeGenerator();
    this.stateManager = new StateManager(sshClient);
  }

  /**
   * Ejecuta el setup completo del runtime:
   * 1. Instala Docker CE y plugin Compose (si no está instalado)
   * 2. Genera docker-compose.yml según el target
   * 3. Verifica que los contenedores estén listos para arrancar
   * 
   * Implementa AC-11: chequea el estado antes de ejecutar y es idempotente.
   */
  async setup(config: RuntimeConfig): Promise<RuntimeSetupResult> {
    try {
      // Generar hash de configuración para detectar cambios
      const configHash = StateManager.generateConfigHash(config);

      // Verificar si el runtime ya fue instalado con esta configuración
      const shouldRerun = await this.stateManager.shouldRerunStep('runtime', configHash);

      if (!shouldRerun) {
        // El runtime ya está instalado y no cambió la configuración.
        // Igual aseguramos grupo docker + .env: un VPS provisionado antes
        // de estos pasos los necesita en el redeploy (FRA-73).
        const groupResult = await this.dockerInstaller.ensureCurrentUserInDockerGroup();
        if (!groupResult.success) {
          return {
            success: false,
            dockerInstall: {
              success: false,
              steps: ['Runtime ya instalado (idempotencia)'],
              error: 'No se pudo agregar el usuario al grupo docker',
            },
            error: 'No se pudo agregar el usuario al grupo docker',
          };
        }
        const envResult = await this.ensureDbPasswordEnv(config);
        if (!envResult.success) {
          return {
            success: false,
            dockerInstall: {
              success: true,
              steps: ['Runtime ya instalado (idempotencia)'],
            },
            error: envResult.error,
          };
        }

        const dockerResult: RuntimeSetupResult['dockerInstall'] = {
          success: true,
          steps: ['Runtime ya instalado (idempotencia)'],
        };

        return {
          success: true,
          dockerInstall: dockerResult,
        };
      }

      // Marcar como en progreso
      await this.stateManager.markStep('runtime', 'pending', configHash);

      // 1. Instalar Docker
      const dockerResult = await this.dockerInstaller.install(
        config.dockerInstall || {}
      );

      if (!dockerResult.success) {
        await this.stateManager.markStep(
          'runtime',
          'failed',
          configHash,
          'Falló la instalación de Docker'
        );
        return {
          success: false,
          dockerInstall: dockerResult,
          error: 'Falló la instalación de Docker',
        };
      }

      // 2. Validar configuración de Compose
      const validation = this.composeGenerator.validateConfig(config.compose);
      if (!validation.valid) {
        await this.stateManager.markStep(
          'runtime',
          'failed',
          configHash,
          validation.error
        );
        return {
          success: false,
          dockerInstall: dockerResult,
          error: validation.error,
        };
      }

      // 3. Generar docker-compose.yml
      const composeResult = this.composeGenerator.generate(config.compose);

      if (!composeResult.success) {
        await this.stateManager.markStep(
          'runtime',
          'failed',
          configHash,
          'Falló la generación de docker-compose.yml'
        );
        return {
          success: false,
          dockerInstall: dockerResult,
          composeGeneration: composeResult,
          error: 'Falló la generación de docker-compose.yml',
        };
      }

      // 4. Escribir el archivo en el servidor
      const writeResult = await this.writeComposeFile(config.compose);

      if (!writeResult.success) {
        await this.stateManager.markStep(
          'runtime',
          'failed',
          configHash,
          writeResult.error
        );
        return {
          success: false,
          dockerInstall: dockerResult,
          composeGeneration: composeResult,
          error: 'No se pudo escribir docker-compose.yml en el servidor',
        };
      }

      // 5. El compose interpola ${DB_PASSWORD} para el servicio db. Sin un
      //    /home/deploy/.env (o env del host), docker compose lo deja vacío y
      //    la imagen de Postgres aborta. Se genera en el servidor, una sola
      //    vez (SPEC-0003: el .env de producción no viaja por el repo).
      const envResult = await this.ensureDbPasswordEnv(config);
      if (!envResult.success) {
        await this.stateManager.markStep(
          'runtime',
          'failed',
          configHash,
          envResult.error
        );
        return {
          success: false,
          dockerInstall: dockerResult,
          composeGeneration: composeResult,
          error: envResult.error,
        };
      }

      // Marcar como completado
      await this.stateManager.markStep('runtime', 'completed', configHash);

      return {
        success: true,
        dockerInstall: dockerResult,
        composeGeneration: composeResult,
      };
    } catch (error) {
      const configHash = StateManager.generateConfigHash(config);
      await this.stateManager.markStep(
        'runtime',
        'failed',
        configHash,
        error instanceof Error ? error.message : 'Error desconocido'
      );
      return {
        success: false,
        dockerInstall: { success: false, steps: [], error: 'No se ejecutó' },
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * Escribe el archivo docker-compose.yml en el servidor remoto.
   */
  private async writeComposeFile(
    config: RuntimeConfig['compose']
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Generar el contenido del compose
      const generator = new ComposeGenerator();
      const generationResult = generator.generate(config);
      
      if (!generationResult.success || !generationResult.content) {
        return {
          success: false,
          error: generationResult.error || 'Error desconocido al generar compose',
        };
      }
      
      const content = generationResult.content;

      // Escribir archivo.
      //
      // El delimitador del heredoc va ENTRECOMILLADO (`<< 'FRACTAL_EOF'`), por lo
      // que el shell trata el cuerpo como literal: no expande variables ni
      // procesa comillas. Por eso el contenido se escribe tal cual, SIN escapar
      // las comillas simples: escaparlas (p.ej. `'` -> `'\''`) insertaría esas
      // secuencias de forma literal en el archivo y rompería el YAML en la
      // primera línea con comillas (`version: '3.8'`), que docker compose
      // rechaza con `did not find expected key`.
      const result = await this.sshClient.executeCommand(
        `cat > ${config.outputPath} << 'FRACTAL_EOF'\n${content}\nFRACTAL_EOF`
      );

      return {
        success: result.success,
        error: result.success ? undefined : result.stderr,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * Asegura que exista `DB_PASSWORD` en el `.env` junto al compose, para
   * que docker compose pueda interpolar `${DB_PASSWORD}` del servicio db.
   * Idempotente: si la clave ya está, no la toca (un redeploy no debe
   * rotar la contraseña de una base ya inicializada).
   *
   * La contraseña se genera EN el servidor (`openssl rand -hex 24`), no
   * viaja por el CLI. Agnóstico de framework: solo conoce la variable
   * que el compose interpola, no su semántica en la app.
   */
  private async ensureDbPasswordEnv(
    config: RuntimeConfig
  ): Promise<{ success: boolean; error?: string }> {
    if (!config.compose.runtime.services.includes('db')) {
      return { success: true };
    }

    const composePath = config.compose.outputPath;
    const lastSlash = composePath.lastIndexOf('/');
    const envDir = lastSlash === -1 ? '.' : composePath.slice(0, lastSlash);
    const envPath = `${envDir}/.env`;

    // Heredoc entrecomillado: el cuerpo es literal (misma lección que
    // writeComposeFile). openssl corre en el servidor; el password nunca
    // pasa por el comando SSH como valor interpolado.
    const result = await this.sshClient.executeCommand(
      `ENV_FILE='${envPath}' && ` +
        `touch "$ENV_FILE" && chmod 600 "$ENV_FILE" && ` +
        `if grep -q '^DB_PASSWORD=' "$ENV_FILE"; then echo already_set; ` +
        `else printf 'DB_PASSWORD=%s\\n' "$(openssl rand -hex 24)" >> "$ENV_FILE"; fi`
    );

    return {
      success: result.success,
      error: result.success
        ? undefined
        : result.stderr || result.error || 'No se pudo escribir DB_PASSWORD en .env',
    };
  }

  /**
   * Verifica que Docker y Compose estén listos para usar.
   */
  async verifyRuntime(): Promise<{ ready: boolean; error?: string }> {
    const dockerCheck = await this.sshClient.executeCommand(
      'docker --version && docker compose version'
    );

    if (!dockerCheck.success) {
      return {
        ready: false,
        error: 'Docker o Compose no están disponibles',
      };
    }

    const serviceCheck = await this.sshClient.executeCommand(
      'sudo systemctl is-active docker'
    );

    if (!serviceCheck.success || serviceCheck.stdout.trim() !== 'active') {
      return {
        ready: false,
        error: 'El servicio Docker no está activo',
      };
    }

    return { ready: true };
  }
}
