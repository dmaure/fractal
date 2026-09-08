import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RuntimeManager } from './runtime-manager.js';
import type { SshClient } from '../ssh/client.js';
import type { RuntimeConfig } from './types.js';

describe('RuntimeManager', () => {
  let mockSshClient: SshClient;
  let manager: RuntimeManager;

  beforeEach(() => {
    mockSshClient = {
      executeCommand: vi.fn(),
    } as any;
    manager = new RuntimeManager(mockSshClient);
  });

  describe('setup', () => {
    it('should complete full setup successfully', async () => {
      // Mock Docker already installed
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
        })
        // writeComposeFile mock
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' });

      const config: RuntimeConfig = {
        compose: {
          targetType: 'backend-full',
          projectName: 'test-project',
          outputPath: '/tmp/docker-compose.yml',
        },
      };

      const result = await manager.setup(config);

      expect(result.success).toBe(true);
      expect(result.dockerInstall.success).toBe(true);
      expect(result.composeGeneration?.success).toBe(true);
    });

    it('should fail if Docker installation fails', async () => {
      // Mock Docker not installed and installation fails
      vi.mocked(mockSshClient.executeCommand).mockResolvedValue({
        success: false,
        stdout: '',
        stderr: 'Installation error',
      });

      const config: RuntimeConfig = {
        compose: {
          targetType: 'backend-full',
          projectName: 'test-project',
          outputPath: '/tmp/docker-compose.yml',
        },
      };

      const result = await manager.setup(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Docker');
    });

    it('should fail if compose config is invalid', async () => {
      // Mock Docker installed
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

      const config: RuntimeConfig = {
        compose: {
          targetType: 'backend-full',
          projectName: '', // Invalid: empty name
          outputPath: '/tmp/docker-compose.yml',
        },
      };

      const result = await manager.setup(config);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('verifyRuntime', () => {
    it('should verify Docker and Compose are ready', async () => {
      vi.mocked(mockSshClient.executeCommand)
        .mockResolvedValueOnce({
          success: true,
          stdout: 'Docker version 24.0.7\nDocker Compose version v2.24.5',
          stderr: '',
        })
        .mockResolvedValueOnce({
          success: true,
          stdout: 'active',
          stderr: '',
        });

      const result = await manager.verifyRuntime();

      expect(result.ready).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should fail if Docker is not available', async () => {
      vi.mocked(mockSshClient.executeCommand).mockResolvedValueOnce({
        success: false,
        stdout: '',
        stderr: 'docker: command not found',
      });

      const result = await manager.verifyRuntime();

      expect(result.ready).toBe(false);
      expect(result.error).toContain('no están disponibles');
    });

    it('should fail if Docker service is not active', async () => {
      vi.mocked(mockSshClient.executeCommand)
        .mockResolvedValueOnce({
          success: true,
          stdout: 'Docker version 24.0.7\nDocker Compose version v2.24.5',
          stderr: '',
        })
        .mockResolvedValueOnce({
          success: true,
          stdout: 'inactive',
          stderr: '',
        });

      const result = await manager.verifyRuntime();

      expect(result.ready).toBe(false);
      expect(result.error).toContain('no está activo');
    });
  });

  describe('framework-agnostic compliance', () => {
    it('should not execute framework-specific commands', async () => {
      const commandCalls: string[] = [];
      
      vi.mocked(mockSshClient.executeCommand).mockImplementation(
        async (cmd: string) => {
          commandCalls.push(cmd.toLowerCase());
          return { success: true, stdout: 'Docker version 24.0.7', stderr: '' };
        }
      );

      const config: RuntimeConfig = {
        compose: {
          targetType: 'backend-full',
          projectName: 'test',
          outputPath: '/tmp/docker-compose.yml',
        },
      };

      await manager.setup(config);

      const prohibitedTerms = [
        'laravel',
        'artisan',
        'php',
        'composer',
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
