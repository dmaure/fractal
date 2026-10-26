import type { SslSshClient } from './types.js';
import type { SslConfig, SslSetupResult } from './types.js';
import { CertbotInstaller } from './certbot-installer.js';
import { ContainerCertInstaller } from './container-cert-installer.js';
import { RenewalManager } from './renewal-manager.js';

/** Días mínimos de vigencia para reutilizar el cert en un redeploy (no reemitir). */
export const SSL_REUSE_MIN_DAYS = 30;

/**
 * Decisión de idempotencia SSL del redeploy: un cert válido con más de
 * `SSL_REUSE_MIN_DAYS` no se reemite.
 */
export function shouldReuseExistingCertificate(check: {
  exists: boolean;
  daysRemaining?: number;
}): boolean {
  return (
    check.exists === true &&
    typeof check.daysRemaining === 'number' &&
    Number.isFinite(check.daysRemaining) &&
    check.daysRemaining > SSL_REUSE_MIN_DAYS
  );
}

/**
 * Manejador principal de SSL/TLS.
 * Implementa AC-7 del SPEC-0003.
 * Framework-agnostic según Artículo II.
 */
export class SslManager {
  private certbotInstaller: CertbotInstaller;
  private containerCertInstaller: ContainerCertInstaller;
  private renewalManager: RenewalManager;

  constructor(private ssh: SslSshClient) {
    this.certbotInstaller = new CertbotInstaller(ssh);
    this.containerCertInstaller = new ContainerCertInstaller(ssh);
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
   * 3. Instala el certificado en el contenedor nginx (copia + reload por
   *    `docker exec`) — el redirect HTTP->HTTPS vive en el nginx.conf del adapter
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
        config.webrootPath,
        config.includeWww
      );
      
      if (!certificateIssuance.success) {
        return {
          success: false,
          certbotInstall,
          certificateIssuance,
          error: 'Emisión de certificado falló',
        };
      }

      // Paso 3: Instalar el certificado en el contenedor nginx (FRA-71).
      // Copia el cert emitido al montaje /etc/nginx/ssl y recarga nginx vía
      // `docker exec`; el redirect HTTP->HTTPS y los bloques TLS ya viven en el
      // nginx.conf generado por el adapter.
      const nginxConfig = await this.containerCertInstaller.install({
        domain: config.domain,
        deployDir: config.deployDir || '/home/deploy',
        containerName: config.containerName,
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

      // Paso 4: Configurar renovación automática. El hook de recarga lo provee
      // el caller (deploy.ts pasa `docker exec <proyecto>_nginx nginx -s reload`);
      // ya no hay nginx en el host, así que no aplica ningún fallback a
      // `systemctl reload nginx`. Si llega undefined, RenewalManager no setea hook.
      const renewalSetup = await this.renewalManager.setup({
        postRenewalHook: config.postRenewalHook,
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
   *
   * `/etc/letsencrypt/live` es 700 root: hay que leerlo con sudo. `test -f`
   * sin privilegios da un falso negativo y el redeploy cree que el cert no
   * existe. `sudo test` no está en el sudoers acotado (FRA-75); `openssl` sí.
   */
  async checkCertificate(domain: string): Promise<{
    exists: boolean;
    expiresAt?: Date;
    daysRemaining?: number;
  }> {
    try {
      const certPath = `/etc/letsencrypt/live/${domain}/cert.pem`;
      const dateCmd = `sudo openssl x509 -enddate -noout -in ${certPath}`;
      const dateResult = await this.exec(dateCmd);

      if (dateResult.exitCode !== 0) {
        return { exists: false };
      }

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
