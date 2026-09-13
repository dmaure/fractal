import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CertbotInstaller } from './certbot-installer.js';
import type { SslSshClient } from './types.js';

describe('CertbotInstaller', () => {
  let mockSsh: SslSshClient;
  let installer: CertbotInstaller;

  beforeEach(() => {
    mockSsh = {
      executeCommand: vi.fn(),
    } as unknown as SslSshClient;
    installer = new CertbotInstaller(mockSsh);
  });

  describe('install', () => {
    it('detecta certbot ya instalado', async () => {
      vi.mocked(mockSsh.executeCommand)
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: '/usr/bin/certbot',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'certbot 2.7.4',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'certbot',
          stderr: '',
        });

      const result = await installer.install();

      expect(result.success).toBe(true);
      expect(result.version).toBe('2.7.4');
      expect(result.steps).toContain('Certbot ya está instalado');
    });

    it('instala certbot vía snap', async () => {
      vi.mocked(mockSsh.executeCommand)
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: 'not found',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: '/usr/bin/snap',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'core refreshed',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'certbot installed',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'certbot 2.7.4',
          stderr: '',
        });

      const result = await installer.install();

      expect(result.success).toBe(true);
      expect(result.method).toBe('snap');
      expect(result.version).toBe('2.7.4');
      expect(result.steps).toContain('Certbot instalado vía snap');
    });

    it('hace fallback a apt si snap falla', async () => {
      vi.mocked(mockSsh.executeCommand)
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: 'not found',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: '/usr/bin/snap',
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
          exitCode: 1,
          stdout: '',
          stderr: 'snap install error',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'certbot installed',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'certbot 1.21.0',
          stderr: '',
        });

      const result = await installer.install();

      expect(result.success).toBe(true);
      expect(result.method).toBe('apt');
      expect(result.steps).toContain('Snap falló, intentando con apt');
    });

    it('instala certbot vía apt directamente', async () => {
      vi.mocked(mockSsh.executeCommand)
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: 'not found',
        })
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: 'snap not found',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'certbot installed',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'certbot 1.21.0',
          stderr: '',
        });

      const result = await installer.install();

      expect(result.success).toBe(true);
      expect(result.method).toBe('apt');
      expect(result.steps).toContain('Certbot instalado vía apt');
    });

    it('maneja error de instalación', async () => {
      vi.mocked(mockSsh.executeCommand).mockRejectedValue(new Error('Connection failed'));

      const result = await installer.install();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection failed');
    });
  });

  describe('issueCertificate', () => {
    it('emite certificado correctamente', async () => {
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
          stdout: 'Successfully received certificate',
          stderr: '',
        });

      const result = await installer.issueCertificate(
        'example.com',
        'admin@example.com',
        'staging',
        '/var/www/html'
      );

      expect(result.success).toBe(true);
      expect(result.domain).toBe('example.com');
      expect(result.certPath).toBe('/etc/letsencrypt/live/example.com/cert.pem');
      expect(result.keyPath).toBe('/etc/letsencrypt/live/example.com/privkey.pem');
      expect(result.fullchainPath).toBe('/etc/letsencrypt/live/example.com/fullchain.pem');
      expect(result.steps).toContain('Certificado emitido exitosamente');
    });

    it('usa entorno de staging', async () => {
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
          stdout: 'Successfully received certificate',
          stderr: '',
        });

      await installer.issueCertificate(
        'example.com',
        'admin@example.com',
        'staging'
      );

      const certbotCall = vi.mocked(mockSsh.executeCommand).mock.calls[2][0];
      expect(certbotCall).toContain('--server https://acme-staging-v02.api.letsencrypt.org/directory');
    });

    it('usa entorno de producción', async () => {
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
          stdout: 'Successfully received certificate',
          stderr: '',
        });

      await installer.issueCertificate(
        'example.com',
        'admin@example.com',
        'production'
      );

      const certbotCall = vi.mocked(mockSsh.executeCommand).mock.calls[2][0];
      expect(certbotCall).toContain('--server https://acme-v02.api.letsencrypt.org/directory');
    });

    it('configura webroot challenge correctamente', async () => {
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
          stdout: 'Successfully received certificate',
          stderr: '',
        });

      await installer.issueCertificate(
        'example.com',
        'admin@example.com',
        'staging',
        '/custom/webroot'
      );

      const mkdirCall = vi.mocked(mockSsh.executeCommand).mock.calls[0][0];
      expect(mkdirCall).toContain('/custom/webroot/.well-known/acme-challenge');

      const certbotCall = vi.mocked(mockSsh.executeCommand).mock.calls[2][0];
      expect(certbotCall).toContain('-w /custom/webroot');
    });

    it('maneja error al crear directorio de challenge', async () => {
      vi.mocked(mockSsh.executeCommand).mockResolvedValueOnce({
        exitCode: 1,
        stdout: '',
        stderr: 'Permission denied',
      });

      const result = await installer.issueCertificate(
        'example.com',
        'admin@example.com',
        'staging'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No se pudo crear directorio de challenge');
    });

    it('maneja error de certbot', async () => {
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
          stderr: 'DNS validation failed',
        });

      const result = await installer.issueCertificate(
        'example.com',
        'admin@example.com',
        'staging'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Certbot falló');
    });
  });
});
