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
          success: true,
          exitCode: 0,
          stdout: '/usr/bin/certbot',
          stderr: '',
        })
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: 'certbot 2.7.4',
          stderr: '',
        })
        .mockResolvedValueOnce({
          success: true,
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
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: 'not found',
        }) // which certbot
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: '/usr/bin/snap',
          stderr: '',
        }) // which snap
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: 'core refreshed',
          stderr: '',
        }) // snap refresh core
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
        }) // waitForAptLock: cloud-init wait (FRA-89)
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: 'FREE',
          stderr: '',
        }) // waitForAptLock: lock probe -> libre (FRA-89)
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
        }) // apt-get remove certbot
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: 'certbot installed',
          stderr: '',
        }) // snap install
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
        }) // ln -sf
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: 'certbot 2.7.4',
          stderr: '',
        }); // certbot --version

      const result = await installer.install();

      expect(result.success).toBe(true);
      expect(result.method).toBe('snap');
      expect(result.version).toBe('2.7.4');
      expect(result.steps).toContain('Certbot instalado vía snap');
    });

    it('hace fallback a apt si snap falla', async () => {
      vi.mocked(mockSsh.executeCommand)
        .mockResolvedValueOnce({
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: 'not found',
        }) // which certbot
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: '/usr/bin/snap',
          stderr: '',
        }) // which snap
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
        }) // snap refresh core
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
        }) // waitForAptLock: cloud-init wait (snap path, FRA-89)
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: 'FREE',
          stderr: '',
        }) // waitForAptLock: lock probe -> libre (snap path, FRA-89)
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
        }) // apt-get remove certbot
        .mockResolvedValueOnce({
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: 'snap install error',
        }) // snap install (falla -> fallback a apt)
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
        }) // waitForAptLock: cloud-init wait (apt path, FRA-89)
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: 'FREE',
          stderr: '',
        }) // waitForAptLock: lock probe -> libre (apt path, FRA-89)
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
        }) // apt-get update
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: 'certbot installed',
          stderr: '',
        }) // apt-get install
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: 'certbot 1.21.0',
          stderr: '',
        }); // certbot --version

      const result = await installer.install();

      expect(result.success).toBe(true);
      expect(result.method).toBe('apt');
      expect(result.steps).toContain('Snap falló, intentando con apt');
    });

    it('instala certbot vía apt directamente', async () => {
      vi.mocked(mockSsh.executeCommand)
        .mockResolvedValueOnce({
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: 'not found',
        }) // which certbot
        .mockResolvedValueOnce({
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: 'snap not found',
        }) // which snap -> apt
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
        }) // waitForAptLock: cloud-init wait (FRA-89)
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: 'FREE',
          stderr: '',
        }) // waitForAptLock: lock probe -> libre (FRA-89)
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
        }) // apt-get update
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: 'certbot installed',
          stderr: '',
        }) // apt-get install
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: 'certbot 1.21.0',
          stderr: '',
        }); // certbot --version

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

    it('espera el lock de apt y aplica DPkg::Lock::Timeout en el path apt (FRA-89)', async () => {
      vi.mocked(mockSsh.executeCommand)
        .mockResolvedValueOnce({
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: 'not found',
        }) // which certbot
        .mockResolvedValueOnce({
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: 'snap not found',
        }) // which snap -> apt
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
        }) // cloud-init wait
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: 'FREE',
          stderr: '',
        }) // lock probe -> libre
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
        }) // apt-get update
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: 'certbot installed',
          stderr: '',
        }) // apt-get install
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: 'certbot 1.21.0',
          stderr: '',
        }); // certbot --version

      await installer.install();

      const commands = vi
        .mocked(mockSsh.executeCommand)
        .mock.calls.map((call) => call[0] as string);

      // El guard del lock (lock-frontend) se emite antes del primer apt-get.
      const guardIdx = commands.findIndex((c) => c.includes('lock-frontend'));
      const firstAptIdx = commands.findIndex((c) => c.includes('apt-get'));
      expect(guardIdx).toBeGreaterThanOrEqual(0);
      expect(firstAptIdx).toBeGreaterThanOrEqual(0);
      expect(guardIdx).toBeLessThan(firstAptIdx);

      // Todas las invocaciones a apt-get esperan el lock (DPkg::Lock::Timeout).
      for (const c of commands.filter((cmd) => cmd.includes('apt-get'))) {
        expect(c).toContain('DPkg::Lock::Timeout=300');
        expect(c).toContain('DEBIAN_FRONTEND=noninteractive');
      }
    });
  });

  describe('issueCertificate', () => {
    it('emite certificado correctamente', async () => {
      vi.mocked(mockSsh.executeCommand)
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          success: true,
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
          success: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          success: true,
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
          success: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          success: true,
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
          success: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          success: true,
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

    it('usa el webroot compartido del deploy por defecto (FRA-71)', async () => {
      vi.mocked(mockSsh.executeCommand)
        .mockResolvedValueOnce({ success: true, exitCode: 0, stdout: '', stderr: '' })
        .mockResolvedValueOnce({ success: true, exitCode: 0, stdout: '', stderr: '' })
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: 'Successfully received certificate',
          stderr: '',
        });

      await installer.issueCertificate('example.com', 'admin@example.com', 'staging');

      const mkdirCall = vi.mocked(mockSsh.executeCommand).mock.calls[0][0];
      expect(mkdirCall).toContain('/home/deploy/docker/nginx/certbot/.well-known/acme-challenge');

      const certbotCall = vi.mocked(mockSsh.executeCommand).mock.calls[2][0];
      expect(certbotCall).toContain('-w /home/deploy/docker/nginx/certbot');
    });

    it('maneja error al crear directorio de challenge', async () => {
      vi.mocked(mockSsh.executeCommand).mockResolvedValueOnce({
        success: false,
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
          success: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          success: false,
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
