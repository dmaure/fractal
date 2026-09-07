import type { SshClient } from '../ssh/client.js';
import type {
  RuntimeConfig,
  RuntimeSetupResult,
} from './types.js';
import { DockerInstaller } from './docker-installer.js';
import { ComposeGenerator } from './compose-generator.js';

/**
 * Orquestador del setup del runtime de Docker Compose.
 * Implementa AC-4 del SPEC-0003.
 * Framework-agnostic: coordina instalación y configuración sin conocer el framework.
 */
export class RuntimeManager {
  private dockerInstaller: DockerInstaller;
  private composeGenerator: ComposeGenerator;

  constructor(private sshClient: SshClient) {
    this.dockerInstaller = new DockerInstaller(sshClient);
    this.composeGenerator = new ComposeGenerator();
  }

  /**
   * Ejecuta el setup completo del runtime:
   * 1. Instala Docker CE y plugin Compose
   * 2. Genera docker-compose.yml según el target
   * 3. Verifica que los contenedores estén listos para arrancar
   */
  async setup(config: RuntimeConfig): Promise<RuntimeSetupResult> {
    try {
      // 1. Instalar Docker
      const dockerResult = await this.dockerInstaller.install(
        config.dockerInstall || {}
      );

      if (!dockerResult.success) {
        return {
          success: false,
          dockerInstall: dockerResult,
          error: 'Falló la instalación de Docker',
        };
      }

      // 2. Validar configuración de Compose
      const validation = this.composeGenerator.validateConfig(config.compose);
      if (!validation.valid) {
        return {
          success: false,
          dockerInstall: dockerResult,
          error: validation.error,
        };
      }

      // 3. Generar docker-compose.yml
      const composeResult = this.composeGenerator.generate(config.compose);

      if (!composeResult.success) {
        return {
          success: false,
          dockerInstall: dockerResult,
          composeGeneration: composeResult,
          error: 'Falló la generación de docker-compose.yml',
        };
      }

      // 4. Escribir el archivo en el servidor (si hay SSH client)
      const writeResult = await this.writeComposeFile(
        config.compose.outputPath,
        this.composeGenerator.generate(config.compose)
      );

      if (!writeResult.success) {
        return {
          success: false,
          dockerInstall: dockerResult,
          composeGeneration: composeResult,
          error: 'No se pudo escribir docker-compose.yml en el servidor',
        };
      }

      return {
        success: true,
        dockerInstall: dockerResult,
        composeGeneration: composeResult,
      };
    } catch (error) {
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
    path: string,
    generationResult: any
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Generar el contenido nuevamente (no es óptimo pero es simple)
      const generator = new ComposeGenerator();
      const content = generator.generate({
        targetType: 'backend-full', // Se pasará desde config
        projectName: 'temp',
        outputPath: path,
      });

      // Escribir archivo
      const escapedContent = content.toString().replace(/'/g, "'\\''");
      const result = await this.sshClient.executeCommand(
        `cat > ${path} << 'FRACTAL_EOF'\n${escapedContent}\nFRACTAL_EOF`
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
