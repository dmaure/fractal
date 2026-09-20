import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SslManager } from './ssl-manager.js';
import type { SslSshClient } from './types.js';
import type { SslConfig } from './types.js';

describe('SslManager', () => {
  let mockSsh: SslSshClient;
  let manager: SslManager;

  beforeEach(() => {
    mockSsh = {
      executeCommand: vi.fn(),
    } as unknown as SslSshClient;
    manager = new SslManager(mockSsh);
  });

  describe('setup', () => {
    it('completa setup exitosamente con staging', async () => {
      const config: SslConfig = {
        domain: 'example.com',
        email: 'admin@example.com',
        environment: 'staging',
      };

      // Mock para certbot install
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
        })
        // Mock para certificate issuance
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
        })
        // Mock para nginx config
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
        })
        // Mock para renewal setup
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: '/usr/bin/systemctl',
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
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'active',
          stderr: '',
        });

      const result = await manager.setup(config);

      expect(result.success).toBe(true);
      expect(result.certbotInstall.success).toBe(true);
      expect(result.certificateIssuance?.success).toBe(true);
      expect(result.certificateIssuance?.domain).toBe('example.com');
      expect(result.nginxConfig?.success).toBe(true);
      expect(result.renewalSetup?.success).toBe(true);
    });

    it('usa entorno de staging correctamente', async () => {
      const config: SslConfig = {
        domain: 'test.example.com',
        email: 'test@example.com',
        environment: 'staging',
      };

      vi.mocked(mockSsh.executeCommand).mockResolvedValue({
        exitCode: 0,
        stdout: 'success',
        stderr: '',
      });

      await manager.setup(config);

      const certbotCalls = vi.mocked(mockSsh.executeCommand).mock.calls
        .map(call => call[0])
        .filter(cmd => typeof cmd === 'string' && cmd.includes('certbot certonly'));
      
      expect(certbotCalls.length).toBeGreaterThan(0);
      expect(certbotCalls[0]).toContain('acme-staging-v02');
    });

    it('usa entorno de producción correctamente', async () => {
      const config: SslConfig = {
        domain: 'prod.example.com',
        email: 'admin@example.com',
        environment: 'production',
      };

      vi.mocked(mockSsh.executeCommand).mockResolvedValue({
        exitCode: 0,
        stdout: 'success',
        stderr: '',
      });

      await manager.setup(config);

      const certbotCalls = vi.mocked(mockSsh.executeCommand).mock.calls
        .map(call => call[0])
        .filter(cmd => typeof cmd === 'string' && cmd.includes('certbot certonly'));
      
      expect(certbotCalls.length).toBeGreaterThan(0);
      expect(certbotCalls[0]).toContain('acme-v02.api.letsencrypt.org');
    });

    it('incluye subdominio www por defecto', async () => {
      const config: SslConfig = {
        domain: 'example.com',
        email: 'admin@example.com',
        environment: 'staging',
      };

      vi.mocked(mockSsh.executeCommand).mockResolvedValue({
        exitCode: 0,
        stdout: 'success',
        stderr: '',
      });

      await manager.setup(config);

      const certbotCalls = vi.mocked(mockSsh.executeCommand).mock.calls
        .map(call => call[0])
        .filter(cmd => typeof cmd === 'string' && cmd.includes('certbot certonly'));
      
      expect(certbotCalls.length).toBeGreaterThan(0);
      expect(certbotCalls[0]).toContain('-d example.com');
      expect(certbotCalls[0]).toContain('-d www.example.com');
    });

    it('omite subdominio www cuando includeWww es false', async () => {
      const config: SslConfig = {
        domain: 'example.com',
        email: 'admin@example.com',
        environment: 'staging',
        includeWww: false,
      };

      vi.mocked(mockSsh.executeCommand).mockResolvedValue({
        exitCode: 0,
        stdout: 'success',
        stderr: '',
      });

      await manager.setup(config);

      const certbotCalls = vi.mocked(mockSsh.executeCommand).mock.calls
        .map(call => call[0])
        .filter(cmd => typeof cmd === 'string' && cmd.includes('certbot certonly'));
      
      expect(certbotCalls.length).toBeGreaterThan(0);
      expect(certbotCalls[0]).toContain('-d example.com');
      expect(certbotCalls[0]).not.toContain('-d www.example.com');
    });

    it('incluye subdominio www cuando includeWww es true', async () => {
      const config: SslConfig = {
        domain: 'example.com',
        email: 'admin@example.com',
        environment: 'staging',
        includeWww: true,
      };

      vi.mocked(mockSsh.executeCommand).mockResolvedValue({
        exitCode: 0,
        stdout: 'success',
        stderr: '',
      });

      await manager.setup(config);

      const certbotCalls = vi.mocked(mockSsh.executeCommand).mock.calls
        .map(call => call[0])
        .filter(cmd => typeof cmd === 'string' && cmd.includes('certbot certonly'));
      
      expect(certbotCalls.length).toBeGreaterThan(0);
      expect(certbotCalls[0]).toContain('-d example.com');
      expect(certbotCalls[0]).toContain('-d www.example.com');
    });

    it('usa postRenewalHook customizado para Docker', async () => {
      const config: SslConfig = {
        domain: 'example.com',
        email: 'admin@example.com',
        environment: 'staging',
        postRenewalHook: 'docker exec myapp_nginx nginx -s reload',
      };

      vi.mocked(mockSsh.executeCommand).mockResolvedValue({
        exitCode: 0,
        stdout: 'success',
        stderr: '',
      });

      await manager.setup(config);

      const renewalCalls = vi.mocked(mockSsh.executeCommand).mock.calls
        .map(call => call[0])
        .filter(cmd => typeof cmd === 'string' && cmd.includes('renewal-hooks'));
      
      expect(renewalCalls.length).toBeGreaterThan(0);
      expect(renewalCalls[0]).toContain('docker exec myapp_nginx nginx -s reload');
    });

    it('usa systemctl reload nginx por defecto cuando no se especifica hook', async () => {
      const config: SslConfig = {
        domain: 'example.com',
        email: 'admin@example.com',
        environment: 'staging',
      };

      vi.mocked(mockSsh.executeCommand).mockResolvedValue({
        exitCode: 0,
        stdout: 'success',
        stderr: '',
      });

      await manager.setup(config);

      const renewalCalls = vi.mocked(mockSsh.executeCommand).mock.calls
        .map(call => call[0])
        .filter(cmd => typeof cmd === 'string' && cmd.includes('renewal-hooks'));
      
      expect(renewalCalls.length).toBeGreaterThan(0);
      expect(renewalCalls[0]).toContain('systemctl reload nginx');
    });

    it('maneja error en instalación de certbot', async () => {
      const config: SslConfig = {
        domain: 'example.com',
        email: 'admin@example.com',
        environment: 'staging',
      };

      vi.mocked(mockSsh.executeCommand).mockRejectedValue(new Error('Connection failed'));

      const result = await manager.setup(config);

      expect(result.success).toBe(false);
      expect(result.certbotInstall.success).toBe(false);
      expect(result.error).toBe('Instalación de certbot falló');
    });

    it('maneja error en emisión de certificado', async () => {
      const config: SslConfig = {
        domain: 'example.com',
        email: 'admin@example.com',
        environment: 'staging',
      };

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
        })
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: 'DNS validation failed',
        });

      const result = await manager.setup(config);

      expect(result.success).toBe(false);
      expect(result.certbotInstall.success).toBe(true);
      expect(result.certificateIssuance?.success).toBe(false);
      expect(result.error).toBe('Emisión de certificado falló');
    });

    it('maneja error en configuración de nginx', async () => {
      const config: SslConfig = {
        domain: 'example.com',
        email: 'admin@example.com',
        environment: 'staging',
      };

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
          stdout: 'Successfully received certificate',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: 'Permission denied',
        });

      const result = await manager.setup(config);

      expect(result.success).toBe(false);
      expect(result.certbotInstall.success).toBe(true);
      expect(result.certificateIssuance?.success).toBe(true);
      expect(result.nginxConfig?.success).toBe(false);
      expect(result.error).toBe('Configuración de nginx falló');
    });

    it('configura post-renewal hook para nginx', async () => {
      const config: SslConfig = {
        domain: 'example.com',
        email: 'admin@example.com',
        environment: 'staging',
      };

      vi.mocked(mockSsh.executeCommand).mockResolvedValue({
        exitCode: 0,
        stdout: 'success',
        stderr: '',
      });

      await manager.setup(config);

      const renewalCalls = vi.mocked(mockSsh.executeCommand).mock.calls
        .map(call => call[0])
        .filter(cmd => typeof cmd === 'string' && cmd.includes('renewal-hooks'));
      
      expect(renewalCalls.length).toBeGreaterThan(0);
      expect(renewalCalls[0]).toContain('systemctl reload nginx');
    });
  });

  describe('checkCertificate', () => {
    it('detecta certificado existente con fecha de expiración', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 60);
      
      vi.mocked(mockSsh.executeCommand)
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: `notAfter=${futureDate.toUTCString()}`,
          stderr: '',
        });

      const result = await manager.checkCertificate('example.com');

      expect(result.exists).toBe(true);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.daysRemaining).toBeGreaterThan(50);
      expect(result.daysRemaining).toBeLessThan(70);
    });

    it('detecta certificado inexistente', async () => {
      vi.mocked(mockSsh.executeCommand).mockResolvedValueOnce({
        exitCode: 1,
        stdout: '',
        stderr: 'No such file',
      });

      const result = await manager.checkCertificate('example.com');

      expect(result.exists).toBe(false);
      expect(result.expiresAt).toBeUndefined();
      expect(result.daysRemaining).toBeUndefined();
    });

    it('maneja certificado existente sin poder leer fecha', async () => {
      vi.mocked(mockSsh.executeCommand)
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: 'Could not read certificate',
        });

      const result = await manager.checkCertificate('example.com');

      expect(result.exists).toBe(true);
      expect(result.expiresAt).toBeUndefined();
    });

    it('calcula días restantes correctamente', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      
      vi.mocked(mockSsh.executeCommand)
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: `notAfter=${futureDate.toUTCString()}`,
          stderr: '',
        });

      const result = await manager.checkCertificate('example.com');

      expect(result.daysRemaining).toBeGreaterThan(25);
      expect(result.daysRemaining).toBeLessThan(35);
    });

    it('maneja error de conexión', async () => {
      vi.mocked(mockSsh.executeCommand).mockRejectedValue(new Error('SSH failed'));

      const result = await manager.checkCertificate('example.com');

      expect(result.exists).toBe(false);
    });
  });

  describe('testRenewal', () => {
    it('ejecuta test de renovación', async () => {
      vi.mocked(mockSsh.executeCommand).mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'Congratulations, all simulated renewals succeeded',
        stderr: '',
      });

      const result = await manager.testRenewal();

      expect(result.success).toBe(true);
      expect(result.output).toContain('all simulated renewals succeeded');
    });

    it('maneja error en test de renovación', async () => {
      vi.mocked(mockSsh.executeCommand).mockResolvedValueOnce({
        exitCode: 1,
        stdout: '',
        stderr: 'Renewal configuration not found',
      });

      const result = await manager.testRenewal();

      expect(result.success).toBe(false);
      expect(result.output).toContain('Renewal configuration not found');
    });
  });
});
