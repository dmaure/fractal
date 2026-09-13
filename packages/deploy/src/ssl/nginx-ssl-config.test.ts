import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NginxSslConfigGenerator } from './nginx-ssl-config.js';
import type { SslSshClient } from './types.js';
import type { NginxSslConfig } from './types.js';

describe('NginxSslConfigGenerator', () => {
  let mockSsh: SslSshClient;
  let generator: NginxSslConfigGenerator;

  beforeEach(() => {
    mockSsh = {
      executeCommand: vi.fn(),
    } as unknown as SslSshClient;
    generator = new NginxSslConfigGenerator(mockSsh);
  });

  describe('generate', () => {
    it('genera configuración para backend con proxy', async () => {
      const config: NginxSslConfig = {
        domain: 'example.com',
        certPath: '/etc/letsencrypt/live/example.com/fullchain.pem',
        keyPath: '/etc/letsencrypt/live/example.com/privkey.pem',
        backendPort: 3000,
      };

      vi.mocked(mockSsh.executeCommand)
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'syntax is ok',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: '',
          stderr: '',
        });

      const result = await generator.generate(config);

      expect(result.success).toBe(true);
      expect(result.configContent).toContain('listen 443 ssl http2');
      expect(result.configContent).toContain('proxy_pass http://localhost:3000');
      expect(result.configContent).toContain('return 301 https://$host$request_uri');
      expect(result.configContent).toContain('Strict-Transport-Security');
      expect(result.steps).toContain('Configuración SSL generada');
      expect(result.steps).toContain('Nginx recargado');
    });

    it('genera configuración para frontend estático', async () => {
      const config: NginxSslConfig = {
        domain: 'example.com',
        certPath: '/etc/letsencrypt/live/example.com/fullchain.pem',
        keyPath: '/etc/letsencrypt/live/example.com/privkey.pem',
        rootPath: '/var/www/html/dist',
      };

      vi.mocked(mockSsh.executeCommand)
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'syntax is ok',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: '',
          stderr: '',
        });

      const result = await generator.generate(config);

      expect(result.success).toBe(true);
      expect(result.configContent).toContain('listen 443 ssl http2');
      expect(result.configContent).toContain('root /var/www/html/dist');
      expect(result.configContent).toContain('try_files $uri $uri/ /index.html');
      expect(result.configContent).toContain('return 301 https://$host$request_uri');
      expect(result.configContent).not.toContain('proxy_pass');
    });

    it('incluye headers de seguridad', async () => {
      const config: NginxSslConfig = {
        domain: 'example.com',
        certPath: '/etc/letsencrypt/live/example.com/fullchain.pem',
        keyPath: '/etc/letsencrypt/live/example.com/privkey.pem',
        rootPath: '/var/www/html',
      };

      vi.mocked(mockSsh.executeCommand).mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      });

      const result = await generator.generate(config);

      expect(result.configContent).toContain('Strict-Transport-Security');
      expect(result.configContent).toContain('X-Frame-Options');
      expect(result.configContent).toContain('X-Content-Type-Options');
      expect(result.configContent).toContain('X-XSS-Protection');
    });

    it('configura redirect HTTP a HTTPS', async () => {
      const config: NginxSslConfig = {
        domain: 'example.com',
        certPath: '/etc/letsencrypt/live/example.com/fullchain.pem',
        keyPath: '/etc/letsencrypt/live/example.com/privkey.pem',
        rootPath: '/var/www/html',
      };

      vi.mocked(mockSsh.executeCommand).mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      });

      const result = await generator.generate(config);

      expect(result.configContent).toContain('listen 80');
      expect(result.configContent).toContain('listen [::]:80');
      expect(result.configContent).toContain('return 301 https://$host$request_uri');
      expect(result.configContent).toContain('location /.well-known/acme-challenge/');
    });

    it('incluye dominio raíz y www', async () => {
      const config: NginxSslConfig = {
        domain: 'example.com',
        certPath: '/etc/letsencrypt/live/example.com/fullchain.pem',
        keyPath: '/etc/letsencrypt/live/example.com/privkey.pem',
        rootPath: '/var/www/html',
      };

      vi.mocked(mockSsh.executeCommand).mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      });

      const result = await generator.generate(config);

      expect(result.configContent).toContain('server_name example.com www.example.com');
    });

    it('maneja error al escribir configuración', async () => {
      const config: NginxSslConfig = {
        domain: 'example.com',
        certPath: '/etc/letsencrypt/live/example.com/fullchain.pem',
        keyPath: '/etc/letsencrypt/live/example.com/privkey.pem',
        rootPath: '/var/www/html',
      };

      vi.mocked(mockSsh.executeCommand).mockResolvedValueOnce({
        exitCode: 1,
        stdout: '',
        stderr: 'Permission denied',
      });

      const result = await generator.generate(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No se pudo escribir configuración');
    });

    it('maneja error de validación de nginx', async () => {
      const config: NginxSslConfig = {
        domain: 'example.com',
        certPath: '/etc/letsencrypt/live/example.com/fullchain.pem',
        keyPath: '/etc/letsencrypt/live/example.com/privkey.pem',
        rootPath: '/var/www/html',
      };

      vi.mocked(mockSsh.executeCommand)
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: 'syntax error',
        });

      const result = await generator.generate(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Configuración inválida');
    });

    it('maneja error al recargar nginx', async () => {
      const config: NginxSslConfig = {
        domain: 'example.com',
        certPath: '/etc/letsencrypt/live/example.com/fullchain.pem',
        keyPath: '/etc/letsencrypt/live/example.com/privkey.pem',
        rootPath: '/var/www/html',
      };

      vi.mocked(mockSsh.executeCommand)
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'syntax is ok',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: 'nginx: [error] could not reload',
        });

      const result = await generator.generate(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No se pudo recargar nginx');
    });

    it('remueve configuración por defecto si existe', async () => {
      const config: NginxSslConfig = {
        domain: 'example.com',
        certPath: '/etc/letsencrypt/live/example.com/fullchain.pem',
        keyPath: '/etc/letsencrypt/live/example.com/privkey.pem',
        rootPath: '/var/www/html',
      };

      vi.mocked(mockSsh.executeCommand)
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'syntax is ok',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: '',
          stderr: '',
        });

      const result = await generator.generate(config);

      expect(result.success).toBe(true);
      expect(result.steps).toContain('Configuración por defecto removida');
    });
  });
});
