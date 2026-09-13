import type { SslSshClient } from './types.js';
import type { NginxSslConfig, NginxSslConfigResult } from './types.js';

/**
 * Generador de configuración nginx con SSL.
 * Framework-agnostic según Artículo II.
 */
export class NginxSslConfigGenerator {
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
   * Genera y aplica configuración nginx con SSL.
   * Incluye redirect HTTP -> HTTPS.
   */
  async generate(config: NginxSslConfig): Promise<NginxSslConfigResult> {
    const steps: string[] = [];
    
    try {
      // Generar configuración
      const configContent = this.generateSslConfig(config);
      steps.push('Configuración SSL generada');

      // Escribir archivo de configuración
      const configPath = `/etc/nginx/sites-available/${config.domain}`;
      const writeResult = await this.writeConfig(configPath, configContent);
      
      if (!writeResult.success) {
        return {
          success: false,
          steps,
          error: writeResult.error,
        };
      }
      steps.push(`Configuración escrita en ${configPath}`);

      // Habilitar sitio
      const enableResult = await this.enableSite(config.domain);
      if (!enableResult.success) {
        return {
          success: false,
          steps,
          error: enableResult.error,
        };
      }
      steps.push(...enableResult.steps);

      // Validar configuración
      const validateResult = await this.validateConfig();
      if (!validateResult.success) {
        return {
          success: false,
          configPath,
          configContent,
          steps,
          error: validateResult.error,
        };
      }
      steps.push('Configuración validada');

      // Recargar nginx
      const reloadResult = await this.reloadNginx();
      if (!reloadResult.success) {
        return {
          success: false,
          configPath,
          configContent,
          steps,
          error: reloadResult.error,
        };
      }
      steps.push('Nginx recargado');

      return {
        success: true,
        configPath,
        configContent,
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
   * Genera la configuración nginx con SSL.
   */
  private generateSslConfig(config: NginxSslConfig): string {
    const { domain, certPath, keyPath, backendPort, rootPath } = config;

    // Redirect HTTP -> HTTPS
    const httpBlock = `
# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name ${domain} www.${domain};

    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
        allow all;
    }

    # Redirect everything else to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}
`;

    // Server block HTTPS
    const httpsBlock = backendPort
      ? this.generateBackendSslBlock(domain, certPath, keyPath, backendPort)
      : this.generateStaticSslBlock(domain, certPath, keyPath, rootPath!);

    return httpBlock + '\n' + httpsBlock;
  }

  /**
   * Genera bloque HTTPS para backend (proxy_pass).
   */
  private generateBackendSslBlock(
    domain: string,
    certPath: string,
    keyPath: string,
    backendPort: number
  ): string {
    return `
# HTTPS server - Backend proxy
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${domain} www.${domain};

    # SSL certificates
    ssl_certificate ${certPath};
    ssl_certificate_key ${keyPath};

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Proxy to backend
    location / {
        proxy_pass http://localhost:${backendPort};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
    }
}
`;
  }

  /**
   * Genera bloque HTTPS para frontend estático.
   */
  private generateStaticSslBlock(
    domain: string,
    certPath: string,
    keyPath: string,
    rootPath: string
  ): string {
    return `
# HTTPS server - Static files
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${domain} www.${domain};

    root ${rootPath};
    index index.html;

    # SSL certificates
    ssl_certificate ${certPath};
    ssl_certificate_key ${keyPath};

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Serve static files
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \\.(?:css|js|jpg|jpeg|gif|png|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
`;
  }

  /**
   * Escribe el archivo de configuración en el servidor.
   */
  private async writeConfig(
    path: string,
    content: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Escapar contenido para heredoc
      const escapedContent = content.replace(/\\/g, '\\\\').replace(/\$/g, '\\$');
      
      const writeCmd = `sudo tee ${path} > /dev/null << 'EOF'\n${escapedContent}\nEOF`;
      const result = await this.exec(writeCmd);
      
      if (result.exitCode !== 0) {
        return {
          success: false,
          error: `No se pudo escribir configuración: ${result.stderr}`,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * Habilita el sitio (crea symlink en sites-enabled).
   */
  private async enableSite(
    domain: string
  ): Promise<{ success: boolean; steps: string[]; error?: string }> {
    const steps: string[] = [];
    
    try {
      // Crear symlink
      const linkCmd = `sudo ln -sf /etc/nginx/sites-available/${domain} /etc/nginx/sites-enabled/${domain}`;
      const linkResult = await this.exec(linkCmd);
      
      if (linkResult.exitCode !== 0) {
        return {
          success: false,
          steps,
          error: `No se pudo habilitar sitio: ${linkResult.stderr}`,
        };
      }
      steps.push('Sitio habilitado en sites-enabled');

      // Remover configuración por defecto si existe
      const defaultExists = await this.exec('test -f /etc/nginx/sites-enabled/default');
      if (defaultExists.exitCode === 0) {
        await this.exec('sudo rm /etc/nginx/sites-enabled/default');
        steps.push('Configuración por defecto removida');
      }

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
   * Valida la configuración de nginx.
   */
  private async validateConfig(): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.exec('sudo nginx -t');
      
      if (result.exitCode !== 0) {
        return {
          success: false,
          error: `Configuración inválida: ${result.stderr}`,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * Recarga nginx.
   */
  private async reloadNginx(): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.exec('sudo systemctl reload nginx');
      
      if (result.exitCode !== 0) {
        return {
          success: false,
          error: `No se pudo recargar nginx: ${result.stderr}`,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }
}
