import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RenewalManager } from './renewal-manager.js';
import type { SslSshClient } from './types.js';

describe('RenewalManager', () => {
  let mockSsh: SslSshClient;
  let manager: RenewalManager;

  beforeEach(() => {
    mockSsh = {
      executeCommand: vi.fn(),
    } as unknown as SslSshClient;
    manager = new RenewalManager(mockSsh);
  });

  describe('setup', () => {
    it('detecta timer de certbot ya existente', async () => {
      vi.mocked(mockSsh.executeCommand).mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'certbot.timer',
        stderr: '',
      });

      const result = await manager.setup();

      expect(result.success).toBe(true);
      expect(result.mechanism).toBe('certbot-native');
      expect(result.steps).toContain('Certbot timer de systemd ya está configurado');
    });

    it('configura timer de systemd', async () => {
      vi.mocked(mockSsh.executeCommand)
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
          stdout: 'active',
          stderr: '',
        });

      const result = await manager.setup();

      expect(result.success).toBe(true);
      expect(result.mechanism).toBe('systemd');
      expect(result.steps).toContain('Timer de certbot habilitado');
      expect(result.steps).toContain('Timer de certbot iniciado');
      expect(result.steps).toContain('Timer verificado y activo');
    });

    it('configura post-renewal hook con systemd', async () => {
      vi.mocked(mockSsh.executeCommand)
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

      const result = await manager.setup({
        postRenewalHook: 'systemctl reload nginx',
      });

      expect(result.success).toBe(true);
      expect(result.steps).toContain('Post-renewal hook configurado');
      expect(result.steps).toContain('Hook: systemctl reload nginx');
    });

    it('hace fallback a cron si systemd no está disponible', async () => {
      vi.mocked(mockSsh.executeCommand)
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: 'systemctl not found',
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
        });

      const result = await manager.setup();

      expect(result.success).toBe(true);
      expect(result.mechanism).toBe('cron');
      expect(result.steps).toContain('Systemd timer no disponible, usando cron');
      expect(result.steps).toContain('Entrada de cron creada');
    });

    it('configura cron con post-renewal hook', async () => {
      vi.mocked(mockSsh.executeCommand)
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: 'systemctl not found',
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
        });

      const result = await manager.setup({
        postRenewalHook: 'systemctl reload nginx',
      });

      expect(result.success).toBe(true);
      expect(result.mechanism).toBe('cron');
      
      const cronCall = vi.mocked(mockSsh.executeCommand).mock.calls[2][0];
      expect(cronCall).toContain('certbot renew --quiet');
      expect(cronCall).toContain('--post-hook "systemctl reload nginx"');
    });

    it('crea entrada de cron con frecuencia correcta', async () => {
      vi.mocked(mockSsh.executeCommand)
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: 'systemctl not found',
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
        });

      await manager.setup();

      const cronCall = vi.mocked(mockSsh.executeCommand).mock.calls[2][0];
      expect(cronCall).toContain('0 0,12 * * *');
    });

    it('maneja error al habilitar timer de systemd', async () => {
      vi.mocked(mockSsh.executeCommand)
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
          exitCode: 1,
          stdout: '',
          stderr: 'Failed to enable unit',
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

      const result = await manager.setup();

      expect(result.success).toBe(true);
      expect(result.mechanism).toBe('cron');
    });

    it('maneja error al crear entrada de cron', async () => {
      vi.mocked(mockSsh.executeCommand)
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: 'systemctl not found',
        })
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: 'Permission denied',
        });

      const result = await manager.setup();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No se pudo crear entrada de cron');
    });

    it('maneja error de conexión', async () => {
      vi.mocked(mockSsh.executeCommand).mockRejectedValue(new Error('Connection failed'));

      const result = await manager.setup();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection failed');
    });
  });

  describe('testRenewal', () => {
    it('ejecuta dry-run exitosamente', async () => {
      vi.mocked(mockSsh.executeCommand).mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'Congratulations, all simulated renewals succeeded',
        stderr: '',
      });

      const result = await manager.testRenewal();

      expect(result.success).toBe(true);
      expect(result.output).toContain('all simulated renewals succeeded');
    });

    it('maneja error en dry-run', async () => {
      vi.mocked(mockSsh.executeCommand).mockResolvedValueOnce({
        exitCode: 1,
        stdout: '',
        stderr: 'Renewal configuration file not found',
      });

      const result = await manager.testRenewal();

      expect(result.success).toBe(false);
      expect(result.output).toContain('Renewal configuration file not found');
    });

    it('maneja excepción', async () => {
      vi.mocked(mockSsh.executeCommand).mockRejectedValue(new Error('SSH timeout'));

      const result = await manager.testRenewal();

      expect(result.success).toBe(false);
      expect(result.output).toBe('SSH timeout');
    });
  });
});
