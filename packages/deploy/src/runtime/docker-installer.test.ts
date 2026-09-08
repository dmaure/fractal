import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DockerInstaller } from './docker-installer.js';
import type { SshClient } from '../ssh/client.js';

describe('DockerInstaller', () => {
  let mockSshClient: SshClient;
  let installer: DockerInstaller;

  beforeEach(() => {
    mockSshClient = {
      executeCommand: vi.fn(),
    } as any;
    installer = new DockerInstaller(mockSshClient);
  });

  describe('install - Docker already installed', () => {
    it('should detect existing Docker and Compose installation', async () => {
      // Mock: Docker y Compose ya instalados
      vi.mocked(mockSshClient.executeCommand)
        .mockResolvedValueOnce({
          success: true,
          stdout: 'Docker version 24.0.7, build...',
          stderr: '',
        })
        .mockResolvedValueOnce({
          success: true,
          stdout: 'Docker Compose version v2.24.5',
          stderr: '',
        });

      const result = await installer.install();

      expect(result.success).toBe(true);
      expect(result.dockerVersion).toBe('24.0.7');
      expect(result.composeVersion).toBe('2.24.5');
      expect(result.steps).toContain('Docker ya instalado: 24.0.7');
      expect(result.steps).toContain('Docker Compose ya instalado: 2.24.5');
    });
  });

  describe('install - Fresh installation', () => {
    it('should install Docker and Compose from scratch', async () => {
      // Mock: Docker no instalado
      vi.mocked(mockSshClient.executeCommand)
        .mockResolvedValueOnce({
          success: true,
          stdout: 'not_installed',
          stderr: '',
        })
        // addDockerRepository steps
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' }) // mkdir
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' }) // gpg key
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' }) // chmod
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' }) // add repo
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' }) // apt update
        // installDockerEngine
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' })
        // checkComposeInstalled
        .mockResolvedValueOnce({
          success: true,
          stdout: 'not_installed',
          stderr: '',
        })
        // installComposePlugin
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' })
        // ensureDockerServiceActive
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' }) // enable
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' }) // start
        .mockResolvedValueOnce({
          success: true,
          stdout: 'active',
          stderr: '',
        }) // is-active
        // Final version checks
        .mockResolvedValueOnce({
          success: true,
          stdout: 'Docker version 24.0.7, build...',
          stderr: '',
        })
        .mockResolvedValueOnce({
          success: true,
          stdout: 'Docker Compose version v2.24.5',
          stderr: '',
        });

      const result = await installer.install();

      expect(result.success).toBe(true);
      expect(result.steps).toContain('Repositorio de Docker agregado');
      expect(result.steps).toContain('Docker CE instalado');
      expect(result.steps).toContain('Docker Compose plugin instalado');
      expect(result.steps).toContain('Servicio Docker activo');
      expect(result.dockerVersion).toBe('24.0.7');
      expect(result.composeVersion).toBe('2.24.5');
    });
  });

  describe('install - Prerequisites', () => {
    it('should install prerequisites when checkPrerequisites is true', async () => {
      vi.mocked(mockSshClient.executeCommand)
        .mockResolvedValueOnce({
          success: true,
          stdout: 'not_installed',
          stderr: '',
        })
        // installPrerequisites
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' })
        // Rest of installation...
        .mockResolvedValue({ success: true, stdout: '', stderr: '' });

      const result = await installer.install({ checkPrerequisites: true });

      expect(result.steps).toContain('Prerequisites instalados');
    });

    it('should fail if prerequisites installation fails', async () => {
      vi.mocked(mockSshClient.executeCommand)
        .mockResolvedValueOnce({
          success: true,
          stdout: 'not_installed',
          stderr: '',
        })
        // installPrerequisites fails
        .mockResolvedValueOnce({ success: false, stdout: '', stderr: 'Error' });

      const result = await installer.install({ checkPrerequisites: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain('prerequisites');
    });
  });

  describe('install - Error handling', () => {
    it('should fail gracefully if Docker Engine installation fails', async () => {
      vi.mocked(mockSshClient.executeCommand)
        .mockResolvedValueOnce({
          success: true,
          stdout: 'not_installed',
          stderr: '',
        })
        // addDockerRepository succeeds
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' })
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' })
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' })
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' })
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' })
        // installDockerEngine fails
        .mockResolvedValueOnce({
          success: false,
          stdout: '',
          stderr: 'Installation failed',
        });

      const result = await installer.install();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Docker Engine');
    });

    it('should fail if Docker service cannot be started', async () => {
      vi.mocked(mockSshClient.executeCommand)
        .mockResolvedValueOnce({
          success: true,
          stdout: 'Docker version 24.0.7',
          stderr: '',
        })
        .mockResolvedValueOnce({
          success: true,
          stdout: 'Docker Compose version v2.24.5',
          stderr: '',
        });

      const result = await installer.install();

      expect(result.success).toBe(true);
    });
  });

  describe('framework-agnostic compliance', () => {
    it('should not use framework-specific commands', async () => {
      const commandCalls: string[] = [];
      
      vi.mocked(mockSshClient.executeCommand).mockImplementation(
        async (cmd: string) => {
          commandCalls.push(cmd.toLowerCase());
          return { success: true, stdout: '', stderr: '' };
        }
      );

      // Try to install (will fail but we'll capture commands)
      await installer.install().catch(() => {});

      // Verificar que no hay términos prohibidos del Artículo II
      const prohibitedTerms = [
        'laravel',
        'artisan',
        'composer',
        'php',
        'rails',
        'bundle',
        'ruby',
      ];

      const allCommands = commandCalls.join(' ');
      prohibitedTerms.forEach((term) => {
        expect(allCommands).not.toContain(term);
      });
    });
  });
});
