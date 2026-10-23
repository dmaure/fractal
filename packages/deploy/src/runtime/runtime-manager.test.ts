import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { RuntimeManager } from './runtime-manager.js';
import { ComposeGenerator } from './compose-generator.js';
import type { SshClient } from '../ssh/client.js';
import type { RuntimeConfig } from './types.js';
import type { DeployRuntime } from '@fractal/core';

describe('RuntimeManager', () => {
  let mockSshClient: SshClient;
  let manager: RuntimeManager;

  // Helper para crear runtimes de prueba
  const createBackendFullRuntime = (): DeployRuntime => ({
    services: ['app', 'nginx', 'db', 'redis', 'worker', 'scheduler'],
    buildCommand: 'docker build -t test:latest .',
    migrateCommand: 'docker compose exec app migrate',
    port: 80,
    healthcheck: { path: '/api/health' },
  });

  beforeEach(() => {
    mockSshClient = {
      executeCommand: vi.fn(),
    } as any;
    manager = new RuntimeManager(mockSshClient);
  });

  describe('setup', () => {
    it('should complete full setup successfully', async () => {
      // Mock shouldRerunStep: readState
      vi.mocked(mockSshClient.executeCommand)
        .mockResolvedValueOnce({
          success: true,
          stdout: '{}',
          stderr: '',
          exitCode: 0,
        })
        // Mock markStep (pending): readState + mkdir + write
        .mockResolvedValueOnce({
          success: true,
          stdout: '{}',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '', exitCode: 0 })
        // Mock Docker already installed
        .mockResolvedValueOnce({
          success: true,
          stdout: 'Docker version 24.0.7, build...',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          success: true,
          stdout: 'Docker Compose version v2.24.5',
          stderr: '',
          exitCode: 0,
        })
        // ensureCurrentUserInDockerGroup
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '', exitCode: 0 })
        // writeComposeFile mock
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '', exitCode: 0 })
        // ensureDbPasswordEnv
        .mockResolvedValueOnce({ success: true, stdout: 'already_set', stderr: '', exitCode: 0 })
        // Mock markStep (completed): readState + mkdir + write
        .mockResolvedValueOnce({
          success: true,
          stdout: '{"version":"1.0.0","provisioning":{},"deployHistory":[]}',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '', exitCode: 0 });

      const config: RuntimeConfig = {
        compose: {
          runtime: createBackendFullRuntime(),
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
        exitCode: 1,
      });

      const config: RuntimeConfig = {
        compose: {
          runtime: createBackendFullRuntime(),
          projectName: 'test-project',
          outputPath: '/tmp/docker-compose.yml',
        },
      };

      const result = await manager.setup(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Docker');
    });

    it('should fail if compose config is invalid', async () => {
      // Mock shouldRerunStep: readState
      vi.mocked(mockSshClient.executeCommand)
        .mockResolvedValueOnce({
          success: true,
          stdout: '{}',
          stderr: '',
          exitCode: 0,
        })
        // Mock markStep (pending): readState + mkdir + write
        .mockResolvedValueOnce({
          success: true,
          stdout: '{}',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '', exitCode: 0 })
        // Mock Docker installed
        .mockResolvedValueOnce({
          success: true,
          stdout: 'Docker version 24.0.7',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          success: true,
          stdout: 'Docker Compose version v2.24.5',
          stderr: '',
          exitCode: 0,
        })
        // ensureCurrentUserInDockerGroup
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '', exitCode: 0 })
        // Mock markStep (failed): readState + mkdir + write
        .mockResolvedValueOnce({
          success: true,
          stdout: '{"version":"1.0.0","provisioning":{},"deployHistory":[]}',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '', exitCode: 0 });

      const config: RuntimeConfig = {
        compose: {
          runtime: createBackendFullRuntime(),
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
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          success: true,
          stdout: 'active',
          stderr: '',
          exitCode: 0,
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
        exitCode: 1,
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
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          success: true,
          stdout: 'inactive',
          stderr: '',
          exitCode: 0,
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
          return { success: true, stdout: 'Docker version 24.0.7', stderr: '', exitCode: 0 };
        }
      );

      const config: RuntimeConfig = {
        compose: {
          runtime: createBackendFullRuntime(),
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

  // Regresión FRA-73: el docker-compose.yml se escribe en el servidor con un
  // heredoc de delimitador ENTRECOMILLADO (`<< 'FRACTAL_EOF'`), cuyo cuerpo el
  // shell trata como literal. Escapar las comillas simples antes (`'` -> `'\''`)
  // insertaba esas secuencias de forma literal y rompía `version: '3.8'` en la
  // línea 5; `docker compose up` lo rechazaba con `did not find expected key`.
  // El snapshot no lo detectaba porque solo compara strings; aquí PARSEAMOS lo
  // que realmente se manda al servidor.
  describe('writeComposeFile: YAML válido en el servidor', () => {
    // Runtime análogo al del adapter Laravel real: inyecta secretEnv con
    // interpolaciones de docker compose, igual que el e2e contra el VPS.
    const createBackendRuntimeWithSecrets = (): DeployRuntime => ({
      services: ['app', 'nginx', 'db', 'redis', 'worker', 'scheduler'],
      build: { context: '.', dockerfile: 'Dockerfile' },
      secretEnv: {
        APP_KEY: 'base64:TEST0000000000000000000000000000000000000000=',
        APP_ENV: 'production',
        DB_DATABASE: '${DB_DATABASE:-fractale2e}',
        DB_PASSWORD: '${DB_PASSWORD}',
      },
      buildCommand: 'docker build -t test:latest .',
      migrateCommand: 'docker compose exec app migrate',
      port: 8000,
      healthcheck: { path: '/api/health' },
    });

    it('escribe un compose que parsea como YAML válido y no corrompe las comillas', async () => {
      const commands: string[] = [];
      vi.mocked(mockSshClient.executeCommand).mockImplementation(
        async (cmd: string) => {
          commands.push(cmd);
          return {
            success: true,
            stdout: 'Docker version 24.0.7\nDocker Compose version v2.24.5',
            stderr: '',
            exitCode: 0,
          };
        }
      );

      const config: RuntimeConfig = {
        compose: {
          runtime: createBackendRuntimeWithSecrets(),
          projectName: 'fractale2e',
          outputPath: '/home/deploy/docker-compose.yml',
        },
      };

      await manager.setup(config);

      // Localizar el comando que escribe el compose vía heredoc.
      const writeCmd = commands.find((c) => c.includes("<< 'FRACTAL_EOF'"));
      expect(writeCmd).toBeDefined();

      const match = (writeCmd as string).match(
        /<< 'FRACTAL_EOF'\n([\s\S]*)\nFRACTAL_EOF$/
      );
      expect(match).not.toBeNull();
      const body = (match as RegExpMatchArray)[1];

      // El cuerpo NO debe contener la secuencia de escape '\'' (la corrupción).
      expect(body).not.toContain("'\\''");

      // El cuerpo escrito debe ser EXACTAMENTE el compose generado (sin escapes).
      const expected = new ComposeGenerator().generate(config.compose).content;
      expect(body).toBe(expected);

      // Y debe parsear como YAML válido: esto es lo que exige docker compose.
      const parsed = parseYaml(body) as Record<string, unknown>;
      expect(parsed).toHaveProperty('services');
      expect(parsed.version).toBe('3.8');
      const volumes = parsed.volumes as Record<string, { name?: string }>;
      expect(volumes.app_code.name).toBe('fractale2e_app_code');
    });
  });

  describe('ensureDbPasswordEnv', () => {
    it('escribe DB_PASSWORD en el .env junto al compose cuando hay servicio db', async () => {
      const commands: string[] = [];
      vi.mocked(mockSshClient.executeCommand).mockImplementation(
        async (cmd: string) => {
          commands.push(cmd);
          return {
            success: true,
            stdout: 'Docker version 24.0.7\nDocker Compose version v2.24.5',
            stderr: '',
            exitCode: 0,
          };
        }
      );

      await manager.setup({
        compose: {
          runtime: createBackendFullRuntime(),
          projectName: 'fractale2e',
          outputPath: '/home/deploy/docker-compose.yml',
        },
      });

      const envCmd = commands.find((c) => c.includes('DB_PASSWORD='));
      expect(envCmd).toBeDefined();
      expect(envCmd).toContain("ENV_FILE='/home/deploy/.env'");
      expect(envCmd).toContain("grep -q '^DB_PASSWORD='");
      expect(envCmd).toContain('openssl rand -hex 24');
      // El password se genera en el servidor: no viaja interpolado.
      expect(envCmd).not.toMatch(/DB_PASSWORD=[0-9a-f]{48}/);
    });

    it('escribe la DB_PASSWORD provista por el wizard en base64, sin openssl ni .env local', async () => {
      const commands: string[] = [];
      vi.mocked(mockSshClient.executeCommand).mockImplementation(
        async (cmd: string) => {
          commands.push(cmd);
          return {
            success: true,
            stdout: 'Docker version 24.0.7\nDocker Compose version v2.24.5',
            stderr: '',
            exitCode: 0,
          };
        }
      );

      const provided = 'wizard-db-pass-123';
      await manager.setup({
        compose: {
          runtime: createBackendFullRuntime(),
          projectName: 'fractale2e',
          outputPath: '/home/deploy/docker-compose.yml',
        },
        dbPassword: provided,
      });

      const envCmd = commands.find((c) => c.includes('ENV_FILE='));
      expect(envCmd).toBeDefined();
      expect(envCmd).toContain('base64 -d');
      expect(envCmd).not.toContain('openssl rand');
      expect(envCmd).not.toContain(`DB_PASSWORD=${provided}`);
    });

    it('no escribe .env si el runtime no declara servicio db', async () => {
      const commands: string[] = [];
      vi.mocked(mockSshClient.executeCommand).mockImplementation(
        async (cmd: string) => {
          commands.push(cmd);
          return {
            success: true,
            stdout: 'Docker version 24.0.7\nDocker Compose version v2.24.5',
            stderr: '',
            exitCode: 0,
          };
        }
      );

      await manager.setup({
        compose: {
          runtime: {
            services: ['nginx'],
            buildCommand: 'true',
            port: 80,
            healthcheck: { path: '/' },
          },
          projectName: 'web',
          outputPath: '/home/deploy/docker-compose.yml',
        },
      });

      expect(commands.some((c) => c.includes('DB_PASSWORD='))).toBe(false);
    });
  });
});
