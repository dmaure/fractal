import type { SslSshClient } from './types.js';
import type { SslConfig, SslSetupResult } from './types.js';
import { CertbotInstaller } from './certbot-installer.js';
import { NginxSslConfigGenerator } from './nginx-ssl-config.js';
import { RenewalManager } from './renewal-manager.js';

/**
 * Manejador principal de SSL/TLS.
 * Implementa AC-7 del SPEC-0003.
 * Framework-agnostic según Artículo II.
 */
export class SslManager {
  private certbotInstaller: CertbotInstaller;
  private nginxConfigGenerator: NginxSslConfigGenerator;
  private renewalManager: RenewalManager;

  constructor(private ssh: SslSshClient) {
    this.certbotInstaller = new CertbotInstaller(ssh);
    this.nginxConfigGenerator = new NginxSslConfigGenerator(ssh);
    this.renewalManager = new RenewalManager(ssh);
  }

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
   * Configura SSL completo para el dominio.
   * Pasos:
   * 1. Instala certbot
   * 2. Emite certificado Let's Encrypt
   * 3. Configura nginx con SSL y redirect HTTP->HTTPS
   * 4. Configura renovación automática
   */
  async setup(config: SslConfig): Promise<SslSetupResult> {
    try {
      // Paso 1: Instalar certbot
      const certbotInstall = await this.certbotInstaller.install(
        config.installMethod
      );
      
      if (!certbotInstall.success) {
        return {
          success: false,
          certbotInstall,
          error: 'Instalación de certbot falló',
        };
      }

      // Paso 2: Emitir certificado
      const certificateIssuance = await this.certbotInstaller.issueCertificate(
        config.domain,
        config.email,
        config.environment,
        config.webrootPath
      );
      
      if (!certificateIssuance.success) {
        return {
          success: false,
          certbotInstall,
          certificateIssuance,
          error: 'Emisión de certificado falló',
        };
      }

      // Paso 3: Configurar nginx
      const nginxConfig = await this.nginxConfigGenerator.generate({
        domain: config.domain,
        certPath: certificateIssuance.fullchainPath!,
        keyPath: certificateIssuance.keyPath!,
        rootPath: config.webrootPath || '/var/www/html',
      });
      
      if (!nginxConfig.success) {
        return {
          success: false,
          certbotInstall,
          certificateIssuance,
          nginxConfig,
          error: 'Configuración de nginx falló',
        };
      }

      // Paso 4: Configurar renovación automática
      const renewalSetup = await this.renewalManager.setup({
        postRenewalHook: 'systemctl reload nginx',
      });
      
      if (!renewalSetup.success) {
        return {
          success: false,
          certbotInstall,
          certificateIssuance,
          nginxConfig,
          renewalSetup,
          error: 'Configuración de renovación falló',
        };
      }

      return {
        success: true,
        certbotInstall,
        certificateIssuance,
        nginxConfig,
        renewalSetup,
      };
    } catch (error) {
      return {
        success: false,
        certbotInstall: {
          success: false,
          steps: [],
          error: 'Setup no completado',
        },
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * Verifica el estado del certificado actual.
   */
  async checkCertificate(domain: string): Promise<{
    exists: boolean;
    expiresAt?: Date;
    daysRemaining?: number;
  }> {
    try {
      const certPath = `/etc/letsencrypt/live/${domain}/cert.pem`;
      
      // Verificar si existe
      const existsResult = await this.exec(`test -f ${certPath}`);
      if (existsResult.exitCode !== 0) {
        return { exists: false };
      }

      // Obtener fecha de expiración
      const dateCmd = `sudo openssl x509 -enddate -noout -in ${certPath}`;
      const dateResult = await this.exec(dateCmd);
      
      if (dateResult.exitCode === 0) {
        const match = dateResult.stdout.match(/notAfter=(.+)/);
        if (match) {
          const expiresAt = new Date(match[1]);
          const now = new Date();
          const daysRemaining = Math.floor(
            (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );
          
          return {
            exists: true,
            expiresAt,
            daysRemaining,
          };
        }
      }

      return { exists: true };
    } catch (error) {
      return { exists: false };
    }
  }

  /**
   * Prueba la renovación (dry-run).
   */
  async testRenewal(): Promise<{ success: boolean; output: string }> {
    return await this.renewalManager.testRenewal();
  }
}
