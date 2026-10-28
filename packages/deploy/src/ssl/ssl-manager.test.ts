import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SslManager, shouldReuseExistingCertificate } from './ssl-manager.js';
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
    it('completa setup exitosamente con staging (instala el cert en el contenedor)', async () => {
      const config: SslConfig = {
        domain: 'example.com',
        email: 'admin@example.com',
        environment: 'staging',
        deployDir: '/home/deploy',
        containerName: 'myapp_nginx',
      };

      // Todos los comandos SSH tienen éxito; el setup emite el cert, lo instala
      // en el contenedor (cp + docker exec reload) y configura la renovación.
      vi.mocked(mockSsh.executeCommand).mockResolvedValue({
        success: true,
        exitCode: 0,
        stdout: 'success',
        stderr: '',
      });

      const result = await manager.setup(config);

      expect(result.success).toBe(true);
      expect(result.certbotInstall.success).toBe(true);
      expect(result.certificateIssuance?.success).toBe(true);
      expect(result.certificateIssuance?.domain).toBe('example.com');
      expect(result.nginxConfig?.success).toBe(true);
      expect(result.renewalSetup?.success).toBe(true);

      // FRA-71: el paso de nginx ahora copia el cert al montaje del contenedor y
      // recarga nginx vía docker exec (ya no configura nginx del host).
      const commands = vi.mocked(mockSsh.executeCommand).mock.calls.map((c) => c[0]);
      expect(commands).toContainEqual(
        'sudo cp -L /etc/letsencrypt/live/example.com/fullchain.pem /home/deploy/docker/nginx/ssl/fullchain.pem'
      );
      expect(commands).toContainEqual('docker exec myapp_nginx nginx -s reload');
      // Ya no se configura nginx del host (sites-available / sites-enabled).
      expect(commands.some((c) => typeof c === 'string' && c.includes('sites-available'))).toBe(false);
      expect(commands.some((c) => typeof c === 'string' && c.includes('sites-enabled'))).toBe(false);
    });

    it('usa entorno de staging correctamente', async () => {
      const config: SslConfig = {
        domain: 'test.example.com',
        email: 'test@example.com',
        environment: 'staging',
      };

      vi.mocked(mockSsh.executeCommand).mockResolvedValue({
        success: true,
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
        success: true,
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
        success: true,
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
        success: true,
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
        success: true,
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
        deployDir: '/home/deploy',
        containerName: 'myapp_nginx',
        postRenewalHook: 'docker exec myapp_nginx nginx -s reload',
      };

      vi.mocked(mockSsh.executeCommand).mockResolvedValue({
        success: true,
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

    it('no configura post-renewal hook cuando no se especifica (sin fallback a systemctl)', async () => {
      const config: SslConfig = {
        domain: 'example.com',
        email: 'admin@example.com',
        environment: 'staging',
        deployDir: '/home/deploy',
        containerName: 'myapp_nginx',
      };

      vi.mocked(mockSsh.executeCommand).mockResolvedValue({
        success: true,
        exitCode: 0,
        stdout: 'success',
        stderr: '',
      });

      await manager.setup(config);

      const renewalCalls = vi.mocked(mockSsh.executeCommand).mock.calls
        .map(call => call[0])
        .filter(cmd => typeof cmd === 'string' && cmd.includes('renewal-hooks'));

      // Sin nginx en el host, ya no hay fallback a `systemctl reload nginx`:
      // si no se pasa hook, RenewalManager no configura ninguno.
      expect(renewalCalls.length).toBe(0);
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
        })
        .mockResolvedValueOnce({
          success: false,
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

    it('maneja error al instalar el cert en el contenedor nginx', async () => {
      const config: SslConfig = {
        domain: 'example.com',
        email: 'admin@example.com',
        environment: 'staging',
        deployDir: '/home/deploy',
        containerName: 'myapp_nginx',
      };

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
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: 'Successfully received certificate',
          stderr: '',
        })
        .mockResolvedValueOnce({
          success: false,
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

    it('configura el post-renewal hook provisto por el caller', async () => {
      const config: SslConfig = {
        domain: 'example.com',
        email: 'admin@example.com',
        environment: 'staging',
        deployDir: '/home/deploy',
        containerName: 'myapp_nginx',
        postRenewalHook: 'docker exec myapp_nginx nginx -s reload',
      };

      vi.mocked(mockSsh.executeCommand).mockResolvedValue({
        success: true,
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
  });

  describe('checkCertificate', () => {
    it('no trata un cert LE válido como inexistente cuando live/ no es readable sin sudo (FRA-80)', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 89);
      const certPath = '/etc/letsencrypt/live/example.com/cert.pem';

      vi.mocked(mockSsh.executeCommand).mockImplementation(async (cmd: string) => {
        // El directorio live/ es 700 root: test -f sin sudo falla aunque el cert exista.
        if (cmd === `test -f ${certPath}`) {
          return {
            success: false,
            exitCode: 1,
            stdout: '',
            stderr: 'Permission denied',
          };
        }
        if (
          cmd.includes('sudo') &&
          cmd.includes('openssl') &&
          cmd.includes(certPath)
        ) {
          return {
            success: true,
            exitCode: 0,
            stdout: `notAfter=${futureDate.toUTCString()}`,
            stderr: '',
          };
        }
        return {
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: `comando inesperado: ${cmd}`,
        };
      });

      const result = await manager.checkCertificate('example.com');
      const commands = vi.mocked(mockSsh.executeCommand).mock.calls.map(
        (call) => call[0] as string
      );

      expect(result.exists).toBe(true);
      expect(result.daysRemaining).toBeGreaterThan(80);
      expect(result.daysRemaining).toBeLessThan(95);
      expect(commands.some((cmd) => cmd === `test -f ${certPath}`)).toBe(false);
      expect(commands.every((cmd) => cmd.startsWith('sudo '))).toBe(true);
      expect(shouldReuseExistingCertificate(result)).toBe(true);
    });

    it('detecta certificado existente con fecha de expiración', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 60);

      vi.mocked(mockSsh.executeCommand).mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: `notAfter=${futureDate.toUTCString()}`,
        stderr: '',
      });

      const result = await manager.checkCertificate('example.com');

      expect(result.exists).toBe(true);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.daysRemaining).toBeGreaterThan(50);
      expect(result.daysRemaining).toBeLessThan(70);
      expect(mockSsh.executeCommand).toHaveBeenCalledWith(
        'sudo openssl x509 -enddate -noout -in /etc/letsencrypt/live/example.com/cert.pem'
      );
    });

    it('detecta certificado inexistente', async () => {
      vi.mocked(mockSsh.executeCommand).mockResolvedValueOnce({
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: 'No such file',
      });

      const result = await manager.checkCertificate('example.com');

      expect(result.exists).toBe(false);
      expect(result.expiresAt).toBeUndefined();
      expect(result.daysRemaining).toBeUndefined();
      expect(shouldReuseExistingCertificate(result)).toBe(false);
    });

    it('maneja certificado existente sin poder parsear la fecha', async () => {
      vi.mocked(mockSsh.executeCommand).mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: 'unable to parse certificate dates',
        stderr: '',
      });

      const result = await manager.checkCertificate('example.com');

      expect(result.exists).toBe(true);
      expect(result.expiresAt).toBeUndefined();
      expect(shouldReuseExistingCertificate(result)).toBe(false);
    });

    it('calcula días restantes correctamente', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      vi.mocked(mockSsh.executeCommand).mockResolvedValueOnce({
        success: true,
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

  describe('shouldReuseExistingCertificate (redeploy con cert existente)', () => {
    it('reutiliza un cert válido con más de 30 días (no reemite)', () => {
      expect(
        shouldReuseExistingCertificate({ exists: true, daysRemaining: 89 })
      ).toBe(true);
    });

    it('reemite si el cert no existe', () => {
      expect(shouldReuseExistingCertificate({ exists: false })).toBe(false);
    });

    it('reemite si el cert expira en 30 días o menos', () => {
      expect(
        shouldReuseExistingCertificate({ exists: true, daysRemaining: 30 })
      ).toBe(false);
      expect(
        shouldReuseExistingCertificate({ exists: true, daysRemaining: 10 })
      ).toBe(false);
    });

    it('reemite si existe pero no hay vigencia conocida', () => {
      expect(shouldReuseExistingCertificate({ exists: true })).toBe(false);
    });
  });

  describe('testRenewal', () => {
    it('ejecuta test de renovación', async () => {
      vi.mocked(mockSsh.executeCommand).mockResolvedValueOnce({
        success: true,
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
        success: false,
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
