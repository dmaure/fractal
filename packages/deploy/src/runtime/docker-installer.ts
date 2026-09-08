import type { SshClient } from '../ssh/client.js';
import type {
  DockerInstallConfig,
  DockerInstallResult,
} from './types.js';

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
          return {
            success: true,
            steps,
            dockerVersion: dockerCheck.version,
            composeVersion: composeCheck.version,
          };
        }
      }

      // 2. Instalar prerequisites si se solicita
      if (config.checkPrerequisites) {
        const prereqResult = await this.installPrerequisites();
        if (!prereqResult.success) {
          return {
            success: false,
            steps,
            error: 'No se pudieron instalar los prerequisites',
          };
        }
        steps.push('Prerequisites instalados');
      }

      // 3. Agregar repositorio de Docker
      if (!dockerCheck.installed) {
        const repoResult = await this.addDockerRepository();
        if (!repoResult.success) {
          return {
            success: false,
            steps,
            error: 'No se pudo agregar el repositorio de Docker',
          };
        }
        steps.push('Repositorio de Docker agregado');
      }

      // 4. Instalar Docker CE
      if (!dockerCheck.installed) {
        const installResult = await this.installDockerEngine();
        if (!installResult.success) {
          return {
            success: false,
            steps,
            error: 'No se pudo instalar Docker Engine',
          };
        }
        steps.push('Docker CE instalado');
      }

      // 5. Instalar plugin de Compose (si no está)
      const composeCheck = await this.checkComposeInstalled();
      if (!composeCheck.installed) {
        const composeResult = await this.installComposePlugin();
        if (!composeResult.success) {
          return {
            success: false,
            steps,
            error: 'No se pudo instalar Docker Compose plugin',
          };
        }
        steps.push('Docker Compose plugin instalado');
      }

      // 6. Verificar que el servicio Docker esté activo
      const serviceResult = await this.ensureDockerServiceActive();
      if (!serviceResult.success) {
        return {
          success: false,
          steps,
          error: 'El servicio Docker no está activo',
        };
      }
      steps.push('Servicio Docker activo');

      // 7. Obtener versiones finales
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
   * Instala prerequisites necesarios para Docker.
   */
  private async installPrerequisites(): Promise<{ success: boolean }> {
    const result = await this.sshClient.executeCommand(
      'sudo apt-get update -qq && ' +
      'sudo apt-get install -y -qq ca-certificates curl gnupg'
    );

    return { success: result.success };
  }

  /**
   * Agrega el repositorio oficial de Docker.
   */
  private async addDockerRepository(): Promise<{ success: boolean }> {
    // Crear directorio para keyrings
    const mkdirResult = await this.sshClient.executeCommand(
      'sudo install -m 0755 -d /etc/apt/keyrings'
    );

    if (!mkdirResult.success) {
      return { success: false };
    }

    // Agregar GPG key de Docker
    const keyResult = await this.sshClient.executeCommand(
      'curl -fsSL https://download.docker.com/linux/ubuntu/gpg | ' +
      'sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg'
    );

    if (!keyResult.success) {
      return { success: false };
    }

    // Dar permisos al keyring
    const chmodResult = await this.sshClient.executeCommand(
      'sudo chmod a+r /etc/apt/keyrings/docker.gpg'
    );

    if (!chmodResult.success) {
      return { success: false };
    }

    // Agregar repositorio
    const repoResult = await this.sshClient.executeCommand(
      'echo "deb [arch=$(dpkg --print-architecture) ' +
      'signed-by=/etc/apt/keyrings/docker.gpg] ' +
      'https://download.docker.com/linux/ubuntu ' +
      '$(. /etc/os-release && echo "$VERSION_CODENAME") stable" | ' +
      'sudo tee /etc/apt/sources.list.d/docker.list > /dev/null'
    );

    if (!repoResult.success) {
      return { success: false };
    }

    // Actualizar índice de paquetes
    const updateResult = await this.sshClient.executeCommand(
      'sudo apt-get update -qq'
    );

    return { success: updateResult.success };
  }

  /**
   * Instala Docker Engine.
   */
  private async installDockerEngine(): Promise<{ success: boolean }> {
    const result = await this.sshClient.executeCommand(
      'sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io'
    );

    return { success: result.success };
  }

  /**
   * Instala el plugin de Docker Compose.
   */
  private async installComposePlugin(): Promise<{ success: boolean }> {
    const result = await this.sshClient.executeCommand(
      'sudo apt-get install -y -qq docker-compose-plugin'
    );

    return { success: result.success };
  }

  /**
   * Asegura que el servicio Docker esté activo.
   */
  private async ensureDockerServiceActive(): Promise<{ success: boolean }> {
    // Habilitar el servicio
    const enableResult = await this.sshClient.executeCommand(
      'sudo systemctl enable docker'
    );

    if (!enableResult.success) {
      return { success: false };
    }

    // Iniciar el servicio
    const startResult = await this.sshClient.executeCommand(
      'sudo systemctl start docker'
    );

    if (!startResult.success) {
      return { success: false };
    }

    // Verificar que esté activo
    const statusResult = await this.sshClient.executeCommand(
      'sudo systemctl is-active docker'
    );

    return { 
      success: statusResult.success && statusResult.stdout.trim() === 'active'
    };
  }
}
