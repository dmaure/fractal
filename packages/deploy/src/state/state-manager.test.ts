/**
 * Tests del StateManager.
 */

import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StateManager } from './state-manager.js';
import type { SshClient } from '../ssh/client.js';
import type { DeployHistoryEntry, ServerState } from './types.js';

function extractHeredocBody(command: string): string {
  const match = command.match(
    /<< 'FRACTAL_STATE_EOF'\n([\s\S]*)\nFRACTAL_STATE_EOF$/
  );
  if (!match) {
    throw new Error(`No se encontró el heredoc de estado en: ${command}`);
  }
  return match[1];
}

describe('StateManager', () => {
  let mockSshClient: SshClient;
  let stateManager: StateManager;
  let mockState: ServerState;

  beforeEach(() => {
    mockState = {
      version: '1.0.0',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      provisioning: {
        hardening: {
          state: 'completed',
          lastRun: '2024-01-01T00:00:00.000Z',
          configHash: 'abc123',
        },
        runtime: {
          state: 'pending',
        },
      },
      deployHistory: [],
    };

    mockSshClient = {
      executeCommand: vi.fn(),
    } as unknown as SshClient;

    stateManager = new StateManager(mockSshClient);
  });

  describe('readState', () => {
    it('debería leer el estado existente del servidor', async () => {
      vi.mocked(mockSshClient.executeCommand).mockResolvedValue({
        success: true,
        stdout: JSON.stringify(mockState),
        stderr: '',
        exitCode: 0,
      });

      const state = await stateManager.readState();

      expect(state).toEqual(mockState);
      expect(mockSshClient.executeCommand).toHaveBeenCalledWith(
        expect.stringContaining('sudo cat /etc/fractal/state.json')
      );
    });

    it('debería retornar estado inicial si el archivo no existe', async () => {
      vi.mocked(mockSshClient.executeCommand).mockResolvedValue({
        success: true,
        stdout: '{}',
        stderr: '',
        exitCode: 0,
      });

      const state = await stateManager.readState();

      expect(state.version).toBe('1.0.0');
      expect(state.provisioning).toEqual({});
      expect(state.deployHistory).toEqual([]);
    });

    it('debería retornar estado inicial si el JSON está corrupto', async () => {
      vi.mocked(mockSshClient.executeCommand).mockResolvedValue({
        success: true,
        stdout: 'invalid json {',
        stderr: '',
        exitCode: 0,
      });

      const state = await stateManager.readState();

      expect(state.version).toBe('1.0.0');
      expect(state.provisioning).toEqual({});
    });
  });

  describe('writeState', () => {
    it('debería escribir el estado en el servidor', async () => {
      vi.mocked(mockSshClient.executeCommand)
        .mockResolvedValueOnce({
          success: true,
          stdout: '',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          success: true,
          stdout: '',
          stderr: '',
          exitCode: 0,
        });

      const result = await stateManager.writeState(mockState);

      expect(result.success).toBe(true);
      expect(mockSshClient.executeCommand).toHaveBeenCalledTimes(2);
      expect(mockSshClient.executeCommand).toHaveBeenCalledWith(
        expect.stringContaining('sudo mkdir -p')
      );
      expect(mockSshClient.executeCommand).toHaveBeenCalledWith(
        expect.stringContaining(
          "sudo tee /etc/fractal/state.json > /dev/null << 'FRACTAL_STATE_EOF'"
        )
      );

      const writeCall = vi.mocked(mockSshClient.executeCommand).mock.calls[1][0];
      // El JSON tiene que viajar con comillas dobles. Si se envuelve en
      // `bash -c "…"`, el login shell de SSH las pierde (FRA-78).
      expect(writeCall).toContain('"version"');
      expect(writeCall).not.toMatch(/bash -c "/);
      expect(() => JSON.parse(extractHeredocBody(writeCall))).not.toThrow();
    });

    it('debería retornar error si no puede crear el directorio', async () => {
      vi.mocked(mockSshClient.executeCommand).mockResolvedValue({
        success: false,
        stdout: '',
        stderr: 'Permission denied',
        exitCode: 1,
      });

      const result = await stateManager.writeState(mockState);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No se pudo crear el directorio');
    });

    it('el JSON escrito conserva apostrofes en mensajes, sin insertar escapes', async () => {
      vi.mocked(mockSshClient.executeCommand)
        .mockResolvedValueOnce({
          success: true,
          stdout: '',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          success: true,
          stdout: '',
          stderr: '',
          exitCode: 0,
        });

      const stateWithApostrophe: ServerState = {
        ...mockState,
        provisioning: {
          ...mockState.provisioning,
          hardening: {
            state: 'completed',
            lastRun: '2024-01-01T00:00:00.000Z',
            message: "Diego's hardening",
          },
        },
      };

      const result = await stateManager.writeState(stateWithApostrophe);

      expect(result.success).toBe(true);
      const writeCall = vi.mocked(mockSshClient.executeCommand).mock.calls[1][0];
      const body = extractHeredocBody(writeCall);
      expect(body).not.toContain("'\\''");
      expect(JSON.parse(body).provisioning.hardening.message).toBe(
        "Diego's hardening"
      );
    });

    it('debería retornar error si no puede escribir el archivo', async () => {
      vi.mocked(mockSshClient.executeCommand)
        .mockResolvedValueOnce({
          success: true,
          stdout: '',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          success: false,
          stdout: '',
          stderr: 'Disk full',
          exitCode: 1,
        });

      const result = await stateManager.writeState(mockState);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No se pudo escribir el estado');
    });
  });

  describe('isStepCompleted', () => {
    it('debería retornar true si el paso está completado', async () => {
      vi.mocked(mockSshClient.executeCommand).mockResolvedValue({
        success: true,
        stdout: JSON.stringify(mockState),
        stderr: '',
        exitCode: 0,
      });

      const completed = await stateManager.isStepCompleted('hardening');

      expect(completed).toBe(true);
    });

    it('debería retornar false si el paso no está completado', async () => {
      vi.mocked(mockSshClient.executeCommand).mockResolvedValue({
        success: true,
        stdout: JSON.stringify(mockState),
        stderr: '',
        exitCode: 0,
      });

      const completed = await stateManager.isStepCompleted('runtime');

      expect(completed).toBe(false);
    });

    it('debería retornar false si el paso no existe', async () => {
      vi.mocked(mockSshClient.executeCommand).mockResolvedValue({
        success: true,
        stdout: JSON.stringify(mockState),
        stderr: '',
        exitCode: 0,
      });

      const completed = await stateManager.isStepCompleted('dns');

      expect(completed).toBe(false);
    });
  });

  describe('shouldRerunStep', () => {
    it('debería retornar true si el paso no está completado', async () => {
      vi.mocked(mockSshClient.executeCommand).mockResolvedValue({
        success: true,
        stdout: JSON.stringify(mockState),
        stderr: '',
        exitCode: 0,
      });

      const shouldRerun = await stateManager.shouldRerunStep('runtime', 'xyz789');

      expect(shouldRerun).toBe(true);
    });

    it('debería retornar false si el paso está completado con el mismo hash', async () => {
      vi.mocked(mockSshClient.executeCommand).mockResolvedValue({
        success: true,
        stdout: JSON.stringify(mockState),
        stderr: '',
        exitCode: 0,
      });

      const shouldRerun = await stateManager.shouldRerunStep('hardening', 'abc123');

      expect(shouldRerun).toBe(false);
    });

    it('debería retornar true si el paso está completado pero el hash cambió', async () => {
      vi.mocked(mockSshClient.executeCommand).mockResolvedValue({
        success: true,
        stdout: JSON.stringify(mockState),
        stderr: '',
        exitCode: 0,
      });

      const shouldRerun = await stateManager.shouldRerunStep('hardening', 'xyz789');

      expect(shouldRerun).toBe(true);
    });
  });

  describe('markStep', () => {
    it('debería marcar un paso como completado', async () => {
      vi.mocked(mockSshClient.executeCommand)
        .mockResolvedValueOnce({
          success: true,
          stdout: JSON.stringify(mockState),
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          success: true,
          stdout: '',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          success: true,
          stdout: '',
          stderr: '',
          exitCode: 0,
        });

      const result = await stateManager.markStep('runtime', 'completed', 'def456');

      expect(result.success).toBe(true);
    });
  });

  describe('addDeployHistory', () => {
    it('debería agregar una entrada al historial', async () => {
      const entry: DeployHistoryEntry = {
        imageTag: 'abc1234',
        timestamp: '2024-01-01T12:00:00.000Z',
        healthcheck: 'passed',
        commitSha: 'abc1234567890',
        branch: 'production',
      };

      vi.mocked(mockSshClient.executeCommand)
        .mockResolvedValueOnce({
          success: true,
          stdout: JSON.stringify(mockState),
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          success: true,
          stdout: '',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          success: true,
          stdout: '',
          stderr: '',
          exitCode: 0,
        });

      const result = await stateManager.addDeployHistory(entry);

      expect(result.success).toBe(true);
    });

    it('debería mantener máximo 10 entradas en el historial', async () => {
      const stateWith10Entries = {
        ...mockState,
        deployHistory: Array(10)
          .fill(null)
          .map((_, i) => ({
            imageTag: `tag${i}`,
            timestamp: new Date().toISOString(),
            healthcheck: 'passed' as const,
          })),
      };

      vi.mocked(mockSshClient.executeCommand)
        .mockResolvedValueOnce({
          success: true,
          stdout: JSON.stringify(stateWith10Entries),
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          success: true,
          stdout: '',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          success: true,
          stdout: '',
          stderr: '',
          exitCode: 0,
        });

      const newEntry: DeployHistoryEntry = {
        imageTag: 'newest',
        timestamp: new Date().toISOString(),
        healthcheck: 'passed',
      };

      await stateManager.addDeployHistory(newEntry);

      const writeCall = vi.mocked(mockSshClient.executeCommand).mock.calls[2][0];
      const writtenState = JSON.parse(extractHeredocBody(writeCall));

      expect(writtenState.deployHistory).toHaveLength(10);
      expect(writtenState.deployHistory[0].imageTag).toBe('newest');
    });
  });

  describe('getLastSuccessfulImageTag', () => {
    it('debería retornar el tag de la última imagen exitosa', async () => {
      const stateWithHistory = {
        ...mockState,
        lastSuccessfulImageTag: 'abc1234',
      };

      vi.mocked(mockSshClient.executeCommand).mockResolvedValue({
        success: true,
        stdout: JSON.stringify(stateWithHistory),
        stderr: '',
        exitCode: 0,
      });

      const tag = await stateManager.getLastSuccessfulImageTag();

      expect(tag).toBe('abc1234');
    });

    it('debería retornar null si no hay ninguna imagen exitosa', async () => {
      vi.mocked(mockSshClient.executeCommand).mockResolvedValue({
        success: true,
        stdout: JSON.stringify(mockState),
        stderr: '',
        exitCode: 0,
      });

      const tag = await stateManager.getLastSuccessfulImageTag();

      expect(tag).toBeNull();
    });
  });

  describe('getPreviousSuccessfulImageTag', () => {
    it('debería retornar el tag anterior exitoso', async () => {
      const stateWithHistory = {
        ...mockState,
        currentImageTag: 'newest',
        deployHistory: [
          {
            imageTag: 'newest',
            timestamp: '2024-01-03T00:00:00.000Z',
            healthcheck: 'passed' as const,
          },
          {
            imageTag: 'middle',
            timestamp: '2024-01-02T00:00:00.000Z',
            healthcheck: 'passed' as const,
          },
          {
            imageTag: 'oldest',
            timestamp: '2024-01-01T00:00:00.000Z',
            healthcheck: 'failed' as const,
          },
        ],
      };

      vi.mocked(mockSshClient.executeCommand).mockResolvedValue({
        success: true,
        stdout: JSON.stringify(stateWithHistory),
        stderr: '',
        exitCode: 0,
      });

      const tag = await stateManager.getPreviousSuccessfulImageTag();

      expect(tag).toBe('middle');
    });

    it('debería retornar null si no hay deploy anterior exitoso', async () => {
      const stateWithHistory = {
        ...mockState,
        currentImageTag: 'first',
        deployHistory: [
          {
            imageTag: 'first',
            timestamp: '2024-01-01T00:00:00.000Z',
            healthcheck: 'passed' as const,
          },
        ],
      };

      vi.mocked(mockSshClient.executeCommand).mockResolvedValue({
        success: true,
        stdout: JSON.stringify(stateWithHistory),
        stderr: '',
        exitCode: 0,
      });

      const tag = await stateManager.getPreviousSuccessfulImageTag();

      expect(tag).toBeNull();
    });
  });

  describe('clearState', () => {
    it('debería eliminar el archivo de estado', async () => {
      vi.mocked(mockSshClient.executeCommand).mockResolvedValue({
        success: true,
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const result = await stateManager.clearState();

      expect(result.success).toBe(true);
      expect(mockSshClient.executeCommand).toHaveBeenCalledWith(
        'sudo rm -f /etc/fractal/state.json'
      );
    });

    it('debería retornar error si no puede eliminar el archivo', async () => {
      vi.mocked(mockSshClient.executeCommand).mockResolvedValue({
        success: false,
        stdout: '',
        stderr: 'Permission denied',
        exitCode: 1,
      });

      const result = await stateManager.clearState();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No se pudo eliminar el estado');
    });
  });

  describe('generateConfigHash', () => {
    it('debería generar un hash consistente para la misma configuración', () => {
      const config = { domain: 'example.com', port: 443 };

      const hash1 = StateManager.generateConfigHash(config);
      const hash2 = StateManager.generateConfigHash(config);

      expect(hash1).toBe(hash2);
    });

    it('debería generar hashes diferentes para configuraciones diferentes', () => {
      const config1 = { domain: 'example.com' };
      const config2 = { domain: 'other.com' };

      const hash1 = StateManager.generateConfigHash(config1);
      const hash2 = StateManager.generateConfigHash(config2);

      expect(hash1).not.toBe(hash2);
    });
  });

  // Regresión FRA-78: OpenSSH ejecuta el comando vía `$SHELL -c`, igual que
  // `bash -c <comando>`. El write anterior (`sudo bash -c "cat > file << 'EOF'
  // {json} EOF"`) perdía las comillas dobles del JSON; `readState` fallaba el
  // parseo, volvía al estado inicial y cada `markStep` pisaba los pasos
  // anteriores — en el VPS solo quedaba `ssl`. Aquí se ejecuta el comando
  // real contra un archivo local (sin sudo) para que el quoting no pueda
  // volver a romperse sin que este test falle.
  describe('writeState: JSON válido bajo el parseo del shell (FRA-78 / AC-11)', () => {
    let stateDir: string;
    let stateFile: string;

    beforeEach(async () => {
      stateDir = await mkdtemp(join(tmpdir(), 'fractal-state-'));
      stateFile = join(stateDir, 'state.json');
    });

    afterEach(async () => {
      await rm(stateDir, { recursive: true, force: true });
    });

    function createLocalSshClient(): SshClient {
      return {
        executeCommand: async (command: string) => {
          const localCommand = command.replace(/\bsudo\s+/g, '');
          try {
            // Simula el exec de OpenSSH: el login shell corre `bash -c <cmd>`.
            const stdout = execFileSync('bash', ['-c', localCommand], {
              encoding: 'utf8',
            });
            return {
              success: true,
              stdout: stdout.trim(),
              stderr: '',
              exitCode: 0,
            };
          } catch (error) {
            const err = error as {
              stdout?: string;
              stderr?: string;
              status?: number;
            };
            return {
              success: false,
              stdout: (err.stdout ?? '').toString().trim(),
              stderr: (err.stderr ?? String(error)).toString().trim(),
              exitCode: err.status ?? 1,
            };
          }
        },
      } as unknown as SshClient;
    }

    it('el archivo escrito es JSON válido y conserva las comillas', async () => {
      const manager = new StateManager(createLocalSshClient(), {
        statePath: stateFile,
      });

      const result = await manager.writeState({
        ...mockState,
        lastSuccessfulImageTag: 'abc1234',
      });

      expect(result.success).toBe(true);
      const raw = await readFile(stateFile, 'utf8');
      const parsed = JSON.parse(raw) as ServerState;
      expect(parsed.version).toBe('1.0.0');
      expect(parsed.lastSuccessfulImageTag).toBe('abc1234');
      expect(parsed.provisioning.hardening?.state).toBe('completed');
    });

    it('tras varios markStep el archivo acumula todos los pasos (AC-11)', async () => {
      const manager = new StateManager(createLocalSshClient(), {
        statePath: stateFile,
      });

      await manager.markStep('hardening', 'completed', 'hash-h', "Diego's hardening");
      await manager.markStep('runtime', 'completed', 'hash-r');
      await manager.markStep('dns', 'completed', 'hash-d');
      await manager.markStep('ssl', 'completed', 'hash-s');

      const raw = await readFile(stateFile, 'utf8');
      const parsed = JSON.parse(raw) as ServerState;

      expect(parsed.provisioning.hardening?.state).toBe('completed');
      expect(parsed.provisioning.hardening?.configHash).toBe('hash-h');
      expect(parsed.provisioning.hardening?.message).toBe("Diego's hardening");
      expect(parsed.provisioning.runtime?.state).toBe('completed');
      expect(parsed.provisioning.dns?.state).toBe('completed');
      expect(parsed.provisioning.ssl?.state).toBe('completed');

      // readState no cae al estado vacío: reconoce los pasos ya hechos.
      expect(await manager.isStepCompleted('hardening')).toBe(true);
      expect(await manager.isStepCompleted('runtime')).toBe(true);
      expect(await manager.isStepCompleted('dns')).toBe(true);
      expect(await manager.isStepCompleted('ssl')).toBe(true);
      expect(await manager.shouldRerunStep('hardening', 'hash-h')).toBe(false);
      expect(await manager.shouldRerunStep('ssl', 'hash-s')).toBe(false);
    });

    it('el patrón viejo bash -c "heredoc" produce JSON inválido (guarda la regresión)', async () => {
      const stateJson = JSON.stringify(
        { version: '1.0.0', provisioning: { ssl: { state: 'completed' } } },
        null,
        2
      );
      const legacyCommand =
        `bash -c "cat > ${stateFile} << 'FRACTAL_STATE_EOF'\n${stateJson}\nFRACTAL_STATE_EOF"`;

      execFileSync('bash', ['-c', legacyCommand]);
      const raw = await readFile(stateFile, 'utf8');

      expect(() => JSON.parse(raw)).toThrow();
      expect(raw).toContain('version:');
      expect(raw).not.toContain('"version"');
    });
  });
});
