import type { SshClient } from '../ssh/client.js';
import type { SshCommandResult } from '../ssh/types.js';
import type {
  DockerInstallConfig,
  DockerInstallResult,
} from './types.js';

/**
 * Opción de apt para esperar hasta 300s a que se libere el lock de dpkg/apt
 * en vez de abortar al instante (Ubuntu 24.04). Se coloca inmediatamente
 * después de `apt-get`. Ver FRA-76.
 */
const APT_LOCK_TIMEOUT_OPT = '-o DPkg::Lock::Timeout=300';

/**
 * Prefijo común de toda invocación a apt-get: corre con sudo, en modo no
 * interactivo (sin prompts de debconf) y esperando el lock de dpkg/apt.
 */
const APT_GET = `sudo DEBIAN_FRONTEND=noninteractive apt-get ${APT_LOCK_TIMEOUT_OPT}`;

/**
 * Instalador de Docker CE y plugin Compose.
 * Implementa AC-4 del SPEC-0003.
 * Framework-agnostic: solo usa Docker oficial.
 */
export class DockerInstaller {
  constructor(private sshClient: SshClient) {}

  /**
   * Instala Docker CE y el plugin de Docker Compose.
   * Idempotente: puede ejecutarse múltiples veces sin romper nada.
   */
  async install(config: DockerInstallConfig = {}): Promise<DockerInstallResult> {
    const steps: string[] = [];

    try {
      // 1. Verificar si Docker ya está instalado
      const dockerCheck = await this.checkDockerInstalled();
      if (dockerCheck.installed) {
        steps.push(`Docker ya instalado: ${dockerCheck.version}`);
        
        // Verificar Compose
        const composeCheck = await this.checkComposeInstalled();
        if (composeCheck.installed) {
          steps.push(`Docker Compose ya instalado: ${composeCheck.version}`);
          const groupResult = await this.ensureCurrentUserInDockerGroup();
          if (!groupResult.success) {
            return {
              success: false,
              steps,
              error: 'No se pudo agregar el usuario al grupo docker',
            };
          }
          steps.push('Usuario agregado al grupo docker');
          return {
            success: true,
            steps,
            dockerVersion: dockerCheck.version,
            composeVersion: composeCheck.version,
          };
        }
      }

      // 2. Esperar a que cloud-init / unattended-upgrades liberen el lock de
      //    dpkg/apt ANTES de la primera operación apt. En un VPS recién creado
      //    esos procesos corren en segundo plano y, sin esta espera, apt-get
      //    aborta con "Could not get lock /var/lib/dpkg/lock-frontend" a los
      //    pocos segundos del arranque (FRA-76: causa del deploy-e2e en rojo).
      if (!dockerCheck.installed || config.checkPrerequisites) {
        await this.waitForAptLock();
        steps.push('Lock de apt/dpkg liberado (o se alcanzó el timeout de espera)');
      }

      // 3. Instalar prerequisites si se solicita
      if (config.checkPrerequisites) {
        const prereqResult = await this.installPrerequisites();
        if (!prereqResult.success) {
          return {
            success: false,
            steps,
            error: `No se pudieron instalar los prerequisites — ${prereqResult.error}`,
          };
        }
        steps.push('Prerequisites instalados');
      }

      // 4. Agregar repositorio de Docker
      if (!dockerCheck.installed) {
        const repoResult = await this.addDockerRepository();
        if (!repoResult.success) {
          return {
            success: false,
            steps,
            error: `No se pudo agregar el repositorio de Docker — ${repoResult.error}`,
          };
        }
        steps.push('Repositorio de Docker agregado');
      }

      // 5. Instalar Docker CE
      if (!dockerCheck.installed) {
        const installResult = await this.installDockerEngine();
        if (!installResult.success) {
          return {
            success: false,
            steps,
            error: `No se pudo instalar Docker Engine — ${installResult.error}`,
          };
        }
        steps.push('Docker CE instalado');
      }

      // 6. Instalar plugin de Compose (si no está)
      const composeCheck = await this.checkComposeInstalled();
      if (!composeCheck.installed) {
        const composeResult = await this.installComposePlugin();
        if (!composeResult.success) {
          return {
            success: false,
            steps,
            error: `No se pudo instalar Docker Compose plugin — ${composeResult.error}`,
          };
        }
        steps.push('Docker Compose plugin instalado');
      }

      // 7. Verificar que el servicio Docker esté activo
      const serviceResult = await this.ensureDockerServiceActive();
      if (!serviceResult.success) {
        return {
          success: false,
          steps,
          error: serviceResult.error
            ? `El servicio Docker no está activo — ${serviceResult.error}`
            : 'El servicio Docker no está activo',
        };
      }
      steps.push('Servicio Docker activo');

      // 8. Dar al usuario actual acceso al socket de Docker.
      //    Sin el grupo `docker`, `docker compose` como `deploy` falla con
      //    `permission denied ... unix:///var/run/docker.sock` (e2e FRA-73).
      //    Cada executeCommand abre una sesión SSH nueva, así que el compose
      //    posterior ya ve la membresía.
      const groupResult = await this.ensureCurrentUserInDockerGroup();
      if (!groupResult.success) {
        return {
          success: false,
          steps,
          error: 'No se pudo agregar el usuario al grupo docker',
        };
      }
      steps.push('Usuario agregado al grupo docker');

      // 9. Obtener versiones finales
      const finalDockerCheck = await this.checkDockerInstalled();
      const finalComposeCheck = await this.checkComposeInstalled();

      return {
        success: true,
        steps,
        dockerVersion: finalDockerCheck.version,
        composeVersion: finalComposeCheck.version,
      };
    } catch (error) {
      return {
        success: false,
        steps,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * Verifica si Docker está instalado y obtiene su versión.
   */
  private async checkDockerInstalled(): Promise<{ installed: boolean; version?: string }> {
    const result = await this.sshClient.executeCommand(
      'docker --version 2>/dev/null || echo "not_installed"'
    );

    if (result.success && !result.stdout.includes('not_installed')) {
      // Extraer versión: "Docker version 24.0.7, build..."
      const versionMatch = result.stdout.match(/Docker version ([0-9.]+)/);
      return {
        installed: true,
        version: versionMatch ? versionMatch[1] : 'unknown',
      };
    }

    return { installed: false };
  }

  /**
   * Verifica si Docker Compose plugin está instalado.
   */
  private async checkComposeInstalled(): Promise<{ installed: boolean; version?: string }> {
    const result = await this.sshClient.executeCommand(
      'docker compose version 2>/dev/null || echo "not_installed"'
    );

    if (result.success && !result.stdout.includes('not_installed')) {
      // Extraer versión: "Docker Compose version v2.24.5"
      const versionMatch = result.stdout.match(/version v?([0-9.]+)/);
      return {
        installed: true,
        version: versionMatch ? versionMatch[1] : 'unknown',
      };
    }

    return { installed: false };
  }

  /**
   * Espera a que cloud-init y unattended-upgrades liberen el lock de
   * dpkg/apt antes de la primera operación apt. En un VPS recién creado esos
   * procesos corren en segundo plano y, sin esta espera, apt-get aborta con
   * "Could not get lock /var/lib/dpkg/lock-frontend" (FRA-76).
   *
   * Es un único comando shell robusto: primero bloquea en `cloud-init status
   * --wait` si la herramienta existe, y luego hace polling del lock con
   * `fuser` (o `flock` como alternativa) hasta liberarlo, con un timeout
   * global de ~300s. Degrada con elegancia: si cloud-init, fuser y flock no
   * están, no falla y sigue de largo. Agnóstico de framework: solo usa
   * utilidades estándar de Linux.
   */
  private async waitForAptLock(): Promise<{ success: boolean }> {
    const guard = [
      'if command -v cloud-init >/dev/null 2>&1; then',
      '  sudo cloud-init status --wait >/dev/null 2>&1 || true;',
      'fi;',
      'deadline=$(( $(date +%s) + 300 ));',
      'while [ "$(date +%s)" -lt "$deadline" ]; do',
      '  if command -v fuser >/dev/null 2>&1; then',
      '    if ! sudo fuser /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock >/dev/null 2>&1; then break; fi;',
      '  elif command -v flock >/dev/null 2>&1; then',
      '    if sudo flock -n /var/lib/dpkg/lock-frontend -c true >/dev/null 2>&1; then break; fi;',
      '  else',
      '    break;',
      '  fi;',
      '  sleep 2;',
      'done',
    ].join(' ');

    // El guard puede esperar hasta 300s; damos margen extra al timeout del
    // comando para no cortar la espera antes de tiempo.
    const result = await this.sshClient.executeCommand(guard, {
      timeoutMs: 320_000,
    });
    return { success: result.success };
  }

  /**
   * Instala prerequisites necesarios para Docker.
   */
  private async installPrerequisites(): Promise<{ success: boolean; error?: string }> {
    const command =
      `${APT_GET} update -qq && ` +
      `${APT_GET} install -y -qq ca-certificates curl gnupg`;
    const result = await this.sshClient.executeCommand(command);

    return result.success
      ? { success: true }
      : { success: false, error: this.failureDetail(command, result) };
  }

  /**
   * Agrega el repositorio oficial de Docker.
   */
  private async addDockerRepository(): Promise<{ success: boolean; error?: string }> {
    // Crear directorio para keyrings
    const mkdirCommand = 'sudo install -m 0755 -d /etc/apt/keyrings';
    const mkdirResult = await this.sshClient.executeCommand(mkdirCommand);

    if (!mkdirResult.success) {
      return { success: false, error: this.failureDetail(mkdirCommand, mkdirResult) };
    }

    // Agregar GPG key de Docker
    const keyCommand =
      'curl -fsSL https://download.docker.com/linux/ubuntu/gpg | ' +
      'sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg';
    const keyResult = await this.sshClient.executeCommand(keyCommand);

    if (!keyResult.success) {
      return { success: false, error: this.failureDetail(keyCommand, keyResult) };
    }

    // Dar permisos al keyring
    const chmodCommand = 'sudo chmod a+r /etc/apt/keyrings/docker.gpg';
    const chmodResult = await this.sshClient.executeCommand(chmodCommand);

    if (!chmodResult.success) {
      return { success: false, error: this.failureDetail(chmodCommand, chmodResult) };
    }

    // Agregar repositorio
    const repoCommand =
      'echo "deb [arch=$(dpkg --print-architecture) ' +
      'signed-by=/etc/apt/keyrings/docker.gpg] ' +
      'https://download.docker.com/linux/ubuntu ' +
      '$(. /etc/os-release && echo "$VERSION_CODENAME") stable" | ' +
      'sudo tee /etc/apt/sources.list.d/docker.list > /dev/null';
    const repoResult = await this.sshClient.executeCommand(repoCommand);

    if (!repoResult.success) {
      return { success: false, error: this.failureDetail(repoCommand, repoResult) };
    }

    // Actualizar índice de paquetes
    const updateCommand = `${APT_GET} update -qq`;
    const updateResult = await this.sshClient.executeCommand(updateCommand);

    return updateResult.success
      ? { success: true }
      : { success: false, error: this.failureDetail(updateCommand, updateResult) };
  }

  /**
   * Instala Docker Engine.
   */
  private async installDockerEngine(): Promise<{ success: boolean; error?: string }> {
    const command = `${APT_GET} install -y -qq docker-ce docker-ce-cli containerd.io`;
    const result = await this.sshClient.executeCommand(command);

    return result.success
      ? { success: true }
      : { success: false, error: this.failureDetail(command, result) };
  }

  /**
   * Instala el plugin de Docker Compose.
   */
  private async installComposePlugin(): Promise<{ success: boolean; error?: string }> {
    const command = `${APT_GET} install -y -qq docker-compose-plugin`;
    const result = await this.sshClient.executeCommand(command);

    return result.success
      ? { success: true }
      : { success: false, error: this.failureDetail(command, result) };
  }

  /**
   * Arma un detalle de error que incluye el comando que falló y su salida real
   * (stderr/stdout/exit code) desde el resultado del SshClient. Clave para
   * FRA-76: el deploy-e2e fallaba con un mensaje genérico porque el stderr de
   * apt se descartaba; ahora el error remoto sube hasta los logs del CLI.
   */
  private failureDetail(command: string, result: SshCommandResult): string {
    const parts: string[] = [`comando: ${command}`];
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    if (stderr) {
      parts.push(`stderr: ${stderr}`);
    }
    if (stdout) {
      parts.push(`stdout: ${stdout}`);
    }
    if (!stderr && !stdout && result.error) {
      parts.push(result.error);
    }
    if (result.exitCode !== null && result.exitCode !== undefined) {
      parts.push(`exit ${result.exitCode}`);
    }
    return parts.join(' | ');
  }

  /**
   * Agrega al usuario de la sesión SSH actual al grupo `docker` para que
   * pueda hablar con `/var/run/docker.sock` sin sudo. `usermod -aG` es
   * idempotente. Agnóstico de framework: solo usa utilidades de Linux.
   *
   * Destapado por el e2e real de FRA-73: el install de Docker corría con
   * sudo, pero el `docker compose build/up` posterior se ejecutaba como
   * `deploy` y el socket rechazaba la conexión.
   */
  async ensureCurrentUserInDockerGroup(): Promise<{ success: boolean }> {
    const result = await this.sshClient.executeCommand(
      'sudo usermod -aG docker "$(id -un)"'
    );
    return { success: result.success };
  }

  /**
   * Asegura que el servicio Docker esté activo.
   */
  private async ensureDockerServiceActive(): Promise<{ success: boolean; error?: string }> {
    // Habilitar el servicio
    const enableCommand = 'sudo systemctl enable docker';
    const enableResult = await this.sshClient.executeCommand(enableCommand);

    if (!enableResult.success) {
      return { success: false, error: this.failureDetail(enableCommand, enableResult) };
    }

    // Iniciar el servicio
    const startCommand = 'sudo systemctl start docker';
    const startResult = await this.sshClient.executeCommand(startCommand);

    if (!startResult.success) {
      return { success: false, error: this.failureDetail(startCommand, startResult) };
    }

    // Verificar que esté activo
    const statusCommand = 'sudo systemctl is-active docker';
    const statusResult = await this.sshClient.executeCommand(statusCommand);

    if (statusResult.success && statusResult.stdout.trim() === 'active') {
      return { success: true };
    }

    return { success: false, error: this.failureDetail(statusCommand, statusResult) };
  }
}
