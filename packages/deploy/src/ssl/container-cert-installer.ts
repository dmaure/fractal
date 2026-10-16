import type { SslSshClient } from './types.js';
import type { NginxSslConfigResult } from './types.js';

/**
 * Parámetros para instalar el certificado en el contenedor nginx.
 */
export interface ContainerCertInstallConfig {
  /** Dominio del certificado (ruta /etc/letsencrypt/live/<domain>/) */
  domain: string;

  /**
   * Directorio del deploy en el VPS (p.ej. /home/deploy). Opcional en el tipo;
   * `install()` valida en runtime que esté presente.
   */
  deployDir?: string;

  /**
   * Nombre del contenedor nginx (p.ej. <projectName>_nginx). Opcional en el
   * tipo; `install()` valida en runtime que esté presente.
   */
  containerName?: string;
}

/**
 * Instala el certificado Let's Encrypt emitido en el contenedor nginx del MVP.
 *
 * Reemplaza al antiguo `NginxSslConfigGenerator` (que configuraba un nginx del
 * **host** vía sites-available + `systemctl reload nginx`, inexistente en el MVP
 * containerizado). En su lugar copia el certificado emitido por certbot al
 * directorio `docker/nginx/ssl` del deploy —bind-mounteado como /etc/nginx/ssl
 * en el contenedor— y recarga nginx vía `docker exec`.
 *
 * Framework-agnostic según Artículo II: solo conoce rutas de certificados y el
 * contenedor nginx; nada del framework de la app.
 */
export class ContainerCertInstaller {
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
   * Copia el certificado emitido al directorio montado por el contenedor nginx
   * y recarga nginx. Idempotente: puede re-ejecutarse sobre un cert ya copiado.
   */
  async install(
    config: ContainerCertInstallConfig
  ): Promise<NginxSslConfigResult> {
    const steps: string[] = [];
    const { domain, deployDir, containerName } = config;

    if (!containerName || !deployDir) {
      return {
        success: false,
        steps: [],
        error:
          'containerName y deployDir son requeridos para instalar el certificado en el contenedor',
      };
    }

    try {
      const liveDir = `/etc/letsencrypt/live/${domain}`;
      const sslDir = `${deployDir}/docker/nginx/ssl`;
      const fullchainDst = `${sslDir}/fullchain.pem`;
      const privkeyDst = `${sslDir}/privkey.pem`;

      // 1. Copiar fullchain
      const cpFullchain = await this.exec(
        `sudo cp -L ${liveDir}/fullchain.pem ${fullchainDst}`
      );
      if (cpFullchain.exitCode !== 0) {
        return {
          success: false,
          steps,
          error: `No se pudo copiar fullchain.pem: ${cpFullchain.stderr}`,
        };
      }
      steps.push('Certificado (fullchain.pem) copiado al montaje del contenedor');

      // 2. Copiar privkey
      const cpPrivkey = await this.exec(
        `sudo cp -L ${liveDir}/privkey.pem ${privkeyDst}`
      );
      if (cpPrivkey.exitCode !== 0) {
        return {
          success: false,
          steps,
          error: `No se pudo copiar privkey.pem: ${cpPrivkey.stderr}`,
        };
      }
      steps.push('Clave privada (privkey.pem) copiada al montaje del contenedor');

      // 3. Permisos
      const chmodFullchain = await this.exec(`sudo chmod 644 ${fullchainDst}`);
      if (chmodFullchain.exitCode !== 0) {
        return {
          success: false,
          steps,
          error: `No se pudieron ajustar permisos de fullchain.pem: ${chmodFullchain.stderr}`,
        };
      }
      const chmodPrivkey = await this.exec(`sudo chmod 600 ${privkeyDst}`);
      if (chmodPrivkey.exitCode !== 0) {
        return {
          success: false,
          steps,
          error: `No se pudieron ajustar permisos de privkey.pem: ${chmodPrivkey.stderr}`,
        };
      }
      steps.push('Permisos del certificado configurados');

      // 4. Validar configuración de nginx en el contenedor
      const nginxTest = await this.exec(
        `docker exec ${containerName} nginx -t`
      );
      if (nginxTest.exitCode !== 0) {
        return {
          success: false,
          configPath: sslDir,
          steps,
          error: `Validación de nginx en el contenedor falló: ${nginxTest.stderr}`,
        };
      }
      steps.push('Configuración de nginx validada en el contenedor');

      // 5. Recargar nginx en el contenedor
      const nginxReload = await this.exec(
        `docker exec ${containerName} nginx -s reload`
      );
      if (nginxReload.exitCode !== 0) {
        return {
          success: false,
          configPath: sslDir,
          steps,
          error: `Recarga de nginx en el contenedor falló: ${nginxReload.stderr}`,
        };
      }
      steps.push('Nginx recargado en el contenedor');

      return {
        success: true,
        configPath: sslDir,
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
}
