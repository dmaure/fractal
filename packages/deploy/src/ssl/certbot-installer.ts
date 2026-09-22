import type { SslSshClient } from './types.js';
import type {
  CertbotInstallResult,
  CertbotInstallMethod,
  CertificateIssuanceResult,
  LetsEncryptEnvironment,
} from './types.js';
import { LETSENCRYPT_URLS } from './types.js';

/**
 * Instalador de Certbot.
 * Maneja la instalación y emisión de certificados Let's Encrypt.
 * Framework-agnostic según Artículo II.
 */
export class CertbotInstaller {
  constructor(private ssh: SslSshClient) {}

  /**
   * Ejecuta un comando SSH y retorna resultado simplificado.
   */
  private async exec(command: string): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    const result = await this.ssh.executeCommand(command);
    return {
      exitCode: result.exitCode ?? 1,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  /**
   * Instala certbot en el servidor.
   * Intenta snap primero, luego apt como fallback.
   */
  async install(
    preferredMethod?: CertbotInstallMethod
  ): Promise<CertbotInstallResult> {
    const steps: string[] = [];
    
    try {
      // Verificar si certbot ya está instalado
      const checkResult = await this.exec('which certbot');
      if (checkResult.exitCode === 0 && checkResult.stdout.trim()) {
        const versionResult = await this.exec('certbot --version');
        const version = this.extractVersion(versionResult.stdout);
        
        steps.push('Certbot ya está instalado');
        steps.push(`Versión detectada: ${version}`);
        
        return {
          success: true,
          version,
          method: await this.detectInstallMethod(),
          steps,
        };
      }

      // Determinar método de instalación
      const method = preferredMethod || (await this.detectBestMethod());
      steps.push(`Instalando certbot vía ${method}`);

      if (method === 'snap') {
        const result = await this.installViaSnap();
        steps.push(...result.steps);
        
        if (!result.success) {
          // Intentar apt como fallback
          steps.push('Snap falló, intentando con apt');
          const aptResult = await this.installViaApt();
          steps.push(...aptResult.steps);
          
          return {
            ...aptResult,
            steps,
          };
        }
        
        return {
          ...result,
          steps,
        };
      } else {
        const result = await this.installViaApt();
        steps.push(...result.steps);
        
        return {
          ...result,
          steps,
        };
      }
    } catch (error) {
      return {
        success: false,
        steps,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * Emite un certificado Let's Encrypt para el dominio.
   */
  async issueCertificate(
    domain: string,
    email: string,
    environment: LetsEncryptEnvironment,
    webrootPath?: string,
    includeWww?: boolean
  ): Promise<CertificateIssuanceResult> {
    const steps: string[] = [];
    
    try {
      const server = LETSENCRYPT_URLS[environment];
      const webroot = webrootPath || '/var/www/html';
      
      steps.push(`Emitiendo certificado para ${domain}`);
      steps.push(`Entorno: ${environment}`);
      steps.push(`Webroot: ${webroot}`);

      // Verificar que nginx pueda servir el challenge
      const setupResult = await this.setupWebrootChallenge(webroot);
      if (!setupResult.success) {
        return {
          success: false,
          steps,
          error: setupResult.error,
        };
      }
      steps.push(...setupResult.steps);

      // Emitir certificado
      const certbotCmdParts = [
        'certbot certonly',
        '--webroot',
        `-w ${webroot}`,
        `-d ${domain}`,
      ];
      
      // Agregar www solo si includeWww es true (default: true para retrocompatibilidad)
      if (includeWww !== false) {
        certbotCmdParts.push(`-d www.${domain}`);
      }
      
      certbotCmdParts.push(
        `--email ${email}`,
        '--agree-tos',
        '--non-interactive',
        `--server ${server}`
      );
      
      const certbotCmd = certbotCmdParts.join(' ');

      const result = await this.exec(`sudo ${certbotCmd}`);
      
      if (result.exitCode !== 0) {
        return {
          success: false,
          steps,
          error: `Certbot falló: ${result.stderr}`,
        };
      }

      steps.push('Certificado emitido exitosamente');

      // Obtener información del certificado
      const certInfo = await this.getCertificateInfo(domain);
      
      return {
        success: true,
        certPath: certInfo.certPath,
        keyPath: certInfo.keyPath,
        fullchainPath: certInfo.fullchainPath,
        domain,
        expiresAt: certInfo.expiresAt,
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
   * Configura el webroot para el challenge de Let's Encrypt.
   */
  private async setupWebrootChallenge(
    webrootPath: string
  ): Promise<{ success: boolean; steps: string[]; error?: string }> {
    const steps: string[] = [];
    
    try {
      // Crear directorio .well-known/acme-challenge
      const mkdirCmd = `sudo mkdir -p ${webrootPath}/.well-known/acme-challenge`;
      const mkdirResult = await this.exec(mkdirCmd);
      
      if (mkdirResult.exitCode !== 0) {
        return {
          success: false,
          steps,
          error: `No se pudo crear directorio de challenge: ${mkdirResult.stderr}`,
        };
      }
      
      steps.push('Directorio de challenge creado');

      // Configurar permisos
      const chmodCmd = `sudo chmod -R 755 ${webrootPath}/.well-known`;
      await this.exec(chmodCmd);
      steps.push('Permisos configurados');

      return { success: true, steps };
    } catch (error) {
      return {
        success: false,
        steps,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * Obtiene información de un certificado ya emitido.
   */
  private async getCertificateInfo(domain: string): Promise<{
    certPath: string;
    keyPath: string;
    fullchainPath: string;
    expiresAt?: Date;
  }> {
    const baseDir = `/etc/letsencrypt/live/${domain}`;
    
    return {
      certPath: `${baseDir}/cert.pem`,
      keyPath: `${baseDir}/privkey.pem`,
      fullchainPath: `${baseDir}/fullchain.pem`,
    };
  }

  /**
   * Instala certbot vía snap.
   */
  private async installViaSnap(): Promise<CertbotInstallResult> {
    const steps: string[] = [];
    
    try {
      // Actualizar snap
      const updateResult = await this.exec('sudo snap refresh core');
      if (updateResult.exitCode !== 0 && !updateResult.stderr.includes('already')) {
        steps.push(`Advertencia al actualizar snap: ${updateResult.stderr}`);
      }
      steps.push('Snap actualizado');

      // Remover certbot de apt si existe
      await this.exec('sudo apt-get remove -y certbot');
      
      // Instalar certbot con snap
      const installResult = await this.exec(
        'sudo snap install --classic certbot'
      );
      
      if (installResult.exitCode !== 0 && !installResult.stderr.includes('already installed')) {
        return {
          success: false,
          steps,
          error: `Instalación vía snap falló: ${installResult.stderr}`,
        };
      }
      steps.push('Certbot instalado vía snap');

      // Crear symlink
      await this.exec('sudo ln -sf /snap/bin/certbot /usr/bin/certbot');
      steps.push('Symlink creado');

      // Verificar versión
      const versionResult = await this.exec('certbot --version');
      const version = this.extractVersion(versionResult.stdout);
      steps.push(`Versión instalada: ${version}`);

      return {
        success: true,
        version,
        method: 'snap',
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
   * Instala certbot vía apt.
   */
  private async installViaApt(): Promise<CertbotInstallResult> {
    const steps: string[] = [];
    
    try {
      // Actualizar lista de paquetes
      await this.exec('sudo apt-get update');
      steps.push('Lista de paquetes actualizada');

      // Instalar certbot
      const installResult = await this.exec(
        'sudo apt-get install -y certbot'
      );
      
      if (installResult.exitCode !== 0) {
        return {
          success: false,
          steps,
          error: `Instalación vía apt falló: ${installResult.stderr}`,
        };
      }
      steps.push('Certbot instalado vía apt');

      // Verificar versión
      const versionResult = await this.exec('certbot --version');
      const version = this.extractVersion(versionResult.stdout);
      steps.push(`Versión instalada: ${version}`);

      return {
        success: true,
        version,
        method: 'apt',
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
   * Detecta el mejor método de instalación disponible.
   */
  private async detectBestMethod(): Promise<CertbotInstallMethod> {
    // Verificar si snap está disponible
    const snapResult = await this.exec('which snap');
    if (snapResult.exitCode === 0) {
      return 'snap';
    }
    
    return 'apt';
  }

  /**
   * Detecta el método usado para una instalación existente.
   */
  private async detectInstallMethod(): Promise<CertbotInstallMethod> {
    const snapResult = await this.exec('snap list certbot 2>/dev/null');
    if (snapResult.exitCode === 0) {
      return 'snap';
    }
    
    return 'apt';
  }

  /**
   * Extrae la versión de certbot del output.
   */
  private extractVersion(output: string): string {
    const match = output.match(/certbot\s+([\d.]+)/i);
    return match ? match[1] : 'desconocida';
  }
}
