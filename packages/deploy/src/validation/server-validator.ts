import type { SshClient } from '../ssh/client.js';
import type {
  ServerValidationResult,
  ServerInfo,
  ServerRequirements,
  PortValidationResult,
} from './types.js';
import { DEFAULT_REQUIREMENTS } from './types.js';

/**
 * Validador de servidor VPS.
 * Verifica distribución, recursos mínimos y puertos antes de provisioning.
 * Framework-agnostic: usa comandos estándar de Linux.
 */
export class ServerValidator {
  constructor(
    private sshClient: SshClient,
    private requirements: ServerRequirements = DEFAULT_REQUIREMENTS
  ) {}

  /**
   * Ejecuta todas las validaciones del servidor.
   */
  async validate(): Promise<ServerValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Detectar información del servidor
    const serverInfo = await this.detectServerInfo();
    
    if (!serverInfo) {
      return {
        valid: false,
        errors: ['No se pudo detectar la información del servidor'],
        warnings: [],
      };
    }

    // 2. Validar distribución
    const distroValid = this.validateDistribution(serverInfo.os, serverInfo.osVersion);
    if (!distroValid) {
      errors.push(
        `Distribución no soportada: ${serverInfo.os} ${serverInfo.osVersion}. ` +
        `Distribuciones soportadas: ${this.requirements.supportedDistros.join(', ')}`
      );
    }

    // 3. Validar CPU
    if (serverInfo.cpuCount < this.requirements.minCpu) {
      errors.push(
        `CPUs insuficientes: detectadas ${serverInfo.cpuCount}, ` +
        `mínimo requerido ${this.requirements.minCpu}`
      );
    }

    // 4. Validar RAM
    if (serverInfo.ramGb < this.requirements.minRamGb) {
      errors.push(
        `RAM insuficiente: detectados ${serverInfo.ramGb.toFixed(1)} GB, ` +
        `mínimo requerido ${this.requirements.minRamGb} GB`
      );
    }

    // 5. Validar disco
    if (serverInfo.diskAvailableGb < this.requirements.minDiskGb) {
      errors.push(
        `Espacio en disco insuficiente: disponibles ${serverInfo.diskAvailableGb.toFixed(1)} GB, ` +
        `mínimo requerido ${this.requirements.minDiskGb} GB`
      );
    }

    // 6. Advertencias no bloqueantes
    if (serverInfo.ramGb < 4) {
      warnings.push(
        'RAM limitada para cargas de trabajo intensivas. ' +
        'Se recomienda 4 GB o más para producción.'
      );
    }

    if (serverInfo.diskAvailableGb < 40) {
      warnings.push(
        'Espacio en disco limitado. ' +
        'Se recomienda 40 GB o más para logs, backups y crecimiento.'
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      serverInfo,
    };
  }

  /**
   * Detecta la información del servidor mediante comandos SSH.
   */
  private async detectServerInfo(): Promise<ServerInfo | null> {
    try {
      // Detectar OS y versión
      const osResult = await this.sshClient.executeCommand(
        'cat /etc/os-release | grep -E "^(NAME|VERSION_ID)=" | cut -d"=" -f2 | tr -d \'"\''
      );
      
      if (!osResult.success) {
        return null;
      }

      const [osName, versionId] = osResult.stdout.split('\n').map(s => s.trim());

      // Detectar CPUs
      const cpuResult = await this.sshClient.executeCommand('nproc');
      const cpuCount = cpuResult.success ? parseInt(cpuResult.stdout.trim(), 10) : 0;

      // Detectar RAM (en KB, convertir a GB)
      const ramResult = await this.sshClient.executeCommand(
        'grep MemTotal /proc/meminfo | awk \'{print $2}\''
      );
      const ramKb = ramResult.success ? parseInt(ramResult.stdout.trim(), 10) : 0;
      const ramGb = ramKb / (1024 * 1024);

      // Detectar disco (partición raíz, en GB)
      const diskResult = await this.sshClient.executeCommand(
        'df -BG / | tail -1 | awk \'{print $2, $4}\' | tr -d "G"'
      );
      
      let diskTotalGb = 0;
      let diskAvailableGb = 0;
      
      if (diskResult.success) {
        const [total, available] = diskResult.stdout.trim().split(/\s+/).map(s => parseInt(s, 10));
        diskTotalGb = total || 0;
        diskAvailableGb = available || 0;
      }

      return {
        os: osName || 'Unknown',
        osVersion: versionId || 'Unknown',
        cpuCount,
        ramGb,
        diskTotalGb,
        diskAvailableGb,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Valida que la distribución esté soportada.
   */
  private validateDistribution(os: string, version: string): boolean {
    const distroString = `${os} ${version}`;
    
    return this.requirements.supportedDistros.some(supported => {
      // Coincidencia exacta o regex
      if (supported === distroString) {
        return true;
      }
      
      // Para Ubuntu, validar versión específica
      if (supported.startsWith('Ubuntu') && os === 'Ubuntu') {
        const versionMatch = supported.match(/Ubuntu (\d+\.\d+)/);
        if (versionMatch && version.startsWith(versionMatch[1])) {
          return true;
        }
      }
      
      return false;
    });
  }

  /**
   * Valida que los puertos requeridos (80, 443) estén disponibles.
   * Implementa AC-14 del SPEC-0003: detecta servicios preexistentes.
   */
  async validatePorts(): Promise<PortValidationResult> {
    const portsToCheck = [80, 443];
    const occupiedPorts: string[] = [];

    for (const port of portsToCheck) {
      // Verificar si el puerto está en uso
      const result = await this.sshClient.executeCommand(
        `ss -tuln | grep -E ':${port}\\s' || true`
      );

      if (result.success && result.stdout.trim()) {
        // Puerto ocupado - intentar identificar el proceso
        const processResult = await this.sshClient.executeCommand(
          `sudo lsof -i :${port} -P -n | tail -n +2 | awk '{print $1}' | head -1 || echo 'unknown'`
        );
        
        const processName = processResult.success 
          ? processResult.stdout.trim() 
          : 'unknown';
        
        occupiedPorts.push(`${port} (proceso: ${processName})`);
      }
    }

    return {
      available: occupiedPorts.length === 0,
      occupiedPorts,
    };
  }
}
