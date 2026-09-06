import type { SshClient } from '../ssh/client.js';
import type {
  HardeningConfig,
  HardeningResult,
  PortCheckResult,
} from './types.js';

/**
 * Manejador de hardening del sistema.
 * Implementa AC-3 y AC-14 del SPEC-0003.
 * Framework-agnostic: usa comandos estándar de Linux.
 */
export class SystemHardening {
  constructor(private sshClient: SshClient) {}

  /**
   * Valida que los puertos requeridos (80, 443) estén disponibles.
   * Implementa AC-14: detecta servicios preexistentes y aborta sin modificar nada.
   */
  async checkPorts(): Promise<PortCheckResult> {
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

  /**
   * Ejecuta el hardening completo del sistema.
   * Implementa AC-3: usuario deploy, SSH hardening, firewall.
   * Solo debe ejecutarse después de verificar que los puertos están libres.
   */
  async harden(config: HardeningConfig): Promise<HardeningResult> {
    const steps: string[] = [];

    try {
      // 1. Crear usuario deploy
      const userCreated = await this.createDeployUser(config.deployUser);
      if (!userCreated) {
        return {
          success: false,
          steps,
          error: `No se pudo crear el usuario ${config.deployUser}`,
        };
      }
      steps.push(`Usuario ${config.deployUser} creado con privilegios sudo`);

      // 2. Configurar SSH para el usuario deploy
      const sshConfigured = await this.setupSshForUser(
        config.deployUser,
        config.sshPublicKey
      );
      if (!sshConfigured) {
        return {
          success: false,
          steps,
          error: `No se pudo configurar SSH para ${config.deployUser}`,
        };
      }
      steps.push(`Clave SSH agregada para ${config.deployUser}`);

      // 3. Hardening de SSH: deshabilitar root login y password auth
      const sshHardened = await this.hardenSshd();
      if (!sshHardened) {
        return {
          success: false,
          steps,
          error: 'No se pudo endurecer la configuración de SSH',
        };
      }
      steps.push('SSH endurecido: root, password y keyboard-interactive deshabilitados');

      // 4. Configurar firewall UFW
      const allowedPorts = config.allowedPorts || [22, 80, 443];
      const firewallConfigured = await this.configureFirewall(allowedPorts);
      if (!firewallConfigured) {
        return {
          success: false,
          steps,
          error: 'No se pudo configurar el firewall UFW',
        };
      }
      steps.push(`Firewall UFW configurado (puertos: ${allowedPorts.join(', ')})`); 

      return {
        success: true,
        steps,
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
   * Crea un usuario no-root con privilegios sudo.
   */
  private async createDeployUser(username: string): Promise<boolean> {
    // Verificar si el usuario ya existe
    const checkUser = await this.sshClient.executeCommand(
      `id ${username} 2>/dev/null || echo 'not_found'`
    );

    if (checkUser.success && !checkUser.stdout.includes('not_found')) {
      // Usuario ya existe, verificar que tiene sudo
      const hasSudo = await this.sshClient.executeCommand(
        `sudo -l -U ${username} 2>/dev/null | grep -q '(ALL)' && echo 'has_sudo' || echo 'no_sudo'`
      );
      
      if (hasSudo.success && hasSudo.stdout.includes('has_sudo')) {
        return true; // Usuario ya existe y tiene sudo
      }
    }

    // Crear usuario con directorio home
    const createResult = await this.sshClient.executeCommand(
      `sudo useradd -m -s /bin/bash ${username}`
    );

    if (!createResult.success && !createResult.stderr.includes('already exists')) {
      return false;
    }

    // Agregar al grupo sudo
    const sudoResult = await this.sshClient.executeCommand(
      `sudo usermod -aG sudo ${username}`
    );

    return sudoResult.success;
  }

  /**
   * Configura SSH para el usuario (authorized_keys).
   */
  private async setupSshForUser(
    username: string,
    publicKey: string
  ): Promise<boolean> {
    // Crear directorio .ssh con permisos correctos
    const mkdirResult = await this.sshClient.executeCommand(
      `sudo -u ${username} mkdir -p /home/${username}/.ssh && ` +
      `sudo chmod 700 /home/${username}/.ssh`
    );

    if (!mkdirResult.success) {
      return false;
    }

    // Agregar clave pública (escapar caracteres especiales)
    const escapedKey = publicKey.replace(/'/g, "'\\''");
    const keyResult = await this.sshClient.executeCommand(
      `echo '${escapedKey}' | sudo tee /home/${username}/.ssh/authorized_keys > /dev/null && ` +
      `sudo chmod 600 /home/${username}/.ssh/authorized_keys && ` +
      `sudo chown ${username}:${username} /home/${username}/.ssh/authorized_keys`
    );

    return keyResult.success;
  }

  /**
   * Endurece sshd de forma efectiva en Ubuntu LTS.
   *
   * OpenSSH es first-match-wins y el `sshd_config` de Ubuntu empieza con
   * `Include /etc/ssh/sshd_config.d/*.conf`, así que un drop-in de
   * cloud-init (p. ej. `50-cloud-init.conf`) gana sobre un `sed` al archivo
   * principal. Se escribe un drop-in `00-*` (orden léxico previo), se
   * garantiza que el Include sea la primera directiva activa, y se verifica
   * la config efectiva con `sshd -T` — `sshd -t` solo valida sintaxis.
   * También se deshabilita keyboard-interactive/PAM, que puede seguir
   * aceptando contraseña aunque `PasswordAuthentication` sea `no`.
   */
  private async hardenSshd(): Promise<boolean> {
    const dropInPath = '/etc/ssh/sshd_config.d/00-fractal-hardening.conf';
    const includeLine = 'Include /etc/ssh/sshd_config.d/*.conf';

    const checkConfig = await this.sshClient.executeCommand(
      'test -f /etc/ssh/sshd_config && echo "exists"'
    );

    if (!checkConfig.success || !checkConfig.stdout.includes('exists')) {
      return false;
    }

    const backupResult = await this.sshClient.executeCommand(
      'sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup'
    );

    if (!backupResult.success) {
      return false;
    }

    const writeDropIn = await this.sshClient.executeCommand(
      `sudo mkdir -p /etc/ssh/sshd_config.d && ` +
      `printf '%s\\n' 'PermitRootLogin no' 'PasswordAuthentication no' 'KbdInteractiveAuthentication no' | ` +
      `sudo tee ${dropInPath} > /dev/null`
    );

    if (!writeDropIn.success) {
      return false;
    }

    // Si Include no es la primera directiva activa, se antepone para que
    // el drop-in 00-* gane contra 50-cloud-init.conf y contra settings
    // que algunos images dejan antes del Include.
    const ensureInclude = await this.sshClient.executeCommand(
      `first=$(sudo grep -E '^[^#[:space:]]' /etc/ssh/sshd_config | head -1); ` +
      `if [ "$first" != '${includeLine}' ]; then ` +
      `printf '%s\\n' '${includeLine}' | sudo cat - /etc/ssh/sshd_config | ` +
      `sudo tee /etc/ssh/sshd_config.fractal-tmp > /dev/null && ` +
      `sudo mv /etc/ssh/sshd_config.fractal-tmp /etc/ssh/sshd_config; ` +
      `fi`
    );

    if (!ensureInclude.success) {
      await this.restoreSshdConfig(dropInPath);
      return false;
    }

    const validateResult = await this.sshClient.executeCommand('sudo sshd -t');

    if (!validateResult.success) {
      await this.restoreSshdConfig(dropInPath);
      return false;
    }

    const effectiveResult = await this.sshClient.executeCommand(
      'effective=$(sudo sshd -T) && ' +
      'echo "$effective" | grep -qx "permitrootlogin no" && ' +
      'echo "$effective" | grep -qx "passwordauthentication no" && ' +
      'echo "$effective" | grep -qx "kbdinteractiveauthentication no"'
    );

    if (!effectiveResult.success) {
      await this.restoreSshdConfig(dropInPath);
      return false;
    }

    const reloadResult = await this.sshClient.executeCommand(
      'sudo systemctl reload sshd || sudo systemctl reload ssh'
    );

    if (!reloadResult.success) {
      await this.restoreSshdConfig(dropInPath);
      return false;
    }

    return true;
  }

  /**
   * Restaura sshd_config y elimina el drop-in de Fractal si el
   * endurecimiento no quedó efectivo.
   */
  private async restoreSshdConfig(dropInPath: string): Promise<void> {
    await this.sshClient.executeCommand(
      `sudo cp /etc/ssh/sshd_config.backup /etc/ssh/sshd_config && ` +
      `sudo rm -f ${dropInPath}`
    );
  }

  /**
   * Configura UFW con los puertos especificados.
   */
  private async configureFirewall(allowedPorts: number[]): Promise<boolean> {
    // Verificar que UFW está instalado
    const checkUfw = await this.sshClient.executeCommand(
      'command -v ufw >/dev/null 2>&1 && echo "installed"'
    );

    if (!checkUfw.success || !checkUfw.stdout.includes('installed')) {
      // Intentar instalar UFW
      const installResult = await this.sshClient.executeCommand(
        'sudo apt-get update -qq && sudo apt-get install -y -qq ufw'
      );
      
      if (!installResult.success) {
        return false;
      }
    }

    // Resetear UFW a estado limpio
    const resetResult = await this.sshClient.executeCommand(
      'sudo ufw --force reset'
    );

    if (!resetResult.success) {
      return false;
    }

    // Configurar política por defecto (deny incoming, allow outgoing)
    const policyResult = await this.sshClient.executeCommand(
      'sudo ufw default deny incoming && sudo ufw default allow outgoing'
    );

    if (!policyResult.success) {
      return false;
    }

    // Permitir puertos especificados
    for (const port of allowedPorts) {
      const allowResult = await this.sshClient.executeCommand(
        `sudo ufw allow ${port}/tcp`
      );

      if (!allowResult.success) {
        return false;
      }
    }

    // Habilitar UFW
    const enableResult = await this.sshClient.executeCommand(
      'sudo ufw --force enable'
    );

    if (!enableResult.success) {
      return false;
    }

    // Verificar estado
    const statusResult = await this.sshClient.executeCommand(
      'sudo ufw status | grep -q "Status: active"'
    );

    return statusResult.success;
  }
}
