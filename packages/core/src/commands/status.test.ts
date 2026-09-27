import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { statusCommand } from './status.js';
import type { ProgressData } from '../types/progress.js';

describe('fractal status', () => {
  const testDir = join(process.cwd(), 'test-status-temp');
  let originalCwd: string;
  let consoleLogSpy: string[];
  let consoleErrorSpy: string[];
  let processExitSpy: number | null;

  beforeEach(async () => {
    originalCwd = process.cwd();
    consoleLogSpy = [];
    consoleErrorSpy = [];
    processExitSpy = null;

    const originalLog = console.log;
    const originalError = console.error;
    const originalExit = process.exit;

    console.log = (...args: unknown[]) => {
      consoleLogSpy.push(args.join(' '));
      originalLog(...args);
    };

    console.error = (...args: unknown[]) => {
      consoleErrorSpy.push(args.join(' '));
      originalError(...args);
    };

    process.exit = ((code?: number) => {
      processExitSpy = code ?? 0;
      throw new Error(`process.exit(${code})`);
    }) as never;

    await mkdir(testDir, { recursive: true });
    process.chdir(testDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(testDir, { recursive: true, force: true });
  });

  describe('validation', () => {
    it('should fail with actionable message when progress.json is missing', async () => {
      await expect(statusCommand()).rejects.toThrow('process.exit');

      expect(processExitSpy).toBe(1);
      expect(consoleErrorSpy.join('\n')).toContain('No se encontró progress.json');
      expect(consoleErrorSpy.join('\n')).toContain('Crea el archivo progress.json');
    });

    it('should fail with actionable message when JSON is invalid', async () => {
      await writeFile(join(testDir, 'progress.json'), '{ invalid json }');

      await expect(statusCommand()).rejects.toThrow('process.exit');

      expect(processExitSpy).toBe(1);
      expect(consoleErrorSpy.join('\n')).toContain('no es un JSON válido');
      expect(consoleErrorSpy.join('\n')).toContain('Verifica la sintaxis JSON');
    });

    it('should fail when root is not an object', async () => {
      await writeFile(join(testDir, 'progress.json'), '[]');

      await expect(statusCommand()).rejects.toThrow('process.exit');

      expect(processExitSpy).toBe(1);
      expect(consoleErrorSpy.join('\n')).toContain('Estructura inválida');
      expect(consoleErrorSpy.join('\n')).toContain('missing "milestones"');
    });

    it('should fail when milestones field is missing', async () => {
      await writeFile(join(testDir, 'progress.json'), '{}');

      await expect(statusCommand()).rejects.toThrow('process.exit');

      expect(processExitSpy).toBe(1);
      expect(consoleErrorSpy.join('\n')).toContain('Estructura inválida');
      expect(consoleErrorSpy.join('\n')).toContain('missing "milestones"');
    });

    it('should fail when milestones is not an array', async () => {
      await writeFile(
        join(testDir, 'progress.json'),
        JSON.stringify({ milestones: 'not-array' })
      );

      await expect(statusCommand()).rejects.toThrow('process.exit');

      expect(processExitSpy).toBe(1);
      expect(consoleErrorSpy.join('\n')).toContain('Estructura inválida');
      expect(consoleErrorSpy.join('\n')).toContain('"milestones" must be array');
    });

    it('should fail when milestone lacks name', async () => {
      const data = {
        milestones: [{ tasks: [] }],
      };
      await writeFile(join(testDir, 'progress.json'), JSON.stringify(data));

      await expect(statusCommand()).rejects.toThrow('process.exit');

      expect(processExitSpy).toBe(1);
      expect(consoleErrorSpy.join('\n')).toContain('Estructura inválida');
      expect(consoleErrorSpy.join('\n')).toContain('name must be string');
    });

    it('should fail when milestone lacks tasks', async () => {
      const data = {
        milestones: [{ name: 'M1' }],
      };
      await writeFile(join(testDir, 'progress.json'), JSON.stringify(data));

      await expect(statusCommand()).rejects.toThrow('process.exit');

      expect(processExitSpy).toBe(1);
      expect(consoleErrorSpy.join('\n')).toContain('Estructura inválida');
      expect(consoleErrorSpy.join('\n')).toContain('tasks must be array');
    });

    it('should fail when task lacks name', async () => {
      const data = {
        milestones: [
          {
            name: 'M1',
            tasks: [{ status: 'completado' }],
          },
        ],
      };
      await writeFile(join(testDir, 'progress.json'), JSON.stringify(data));

      await expect(statusCommand()).rejects.toThrow('process.exit');

      expect(processExitSpy).toBe(1);
      expect(consoleErrorSpy.join('\n')).toContain('Estructura inválida');
      expect(consoleErrorSpy.join('\n')).toContain('name must be string');
    });

    it('should fail when task lacks status', async () => {
      const data = {
        milestones: [
          {
            name: 'M1',
            tasks: [{ name: 'T1' }],
          },
        ],
      };
      await writeFile(join(testDir, 'progress.json'), JSON.stringify(data));

      await expect(statusCommand()).rejects.toThrow('process.exit');

      expect(processExitSpy).toBe(1);
      expect(consoleErrorSpy.join('\n')).toContain('Estructura inválida');
      expect(consoleErrorSpy.join('\n')).toContain('status is required');
    });

    it('should fail when status is not in enum', async () => {
      const data = {
        milestones: [
          {
            name: 'M1',
            tasks: [{ name: 'T1', status: 'invalid_status' }],
          },
        ],
      };
      await writeFile(join(testDir, 'progress.json'), JSON.stringify(data));

      await expect(statusCommand()).rejects.toThrow('process.exit');

      expect(processExitSpy).toBe(1);
      expect(consoleErrorSpy.join('\n')).toContain('Estado inválido');
      expect(consoleErrorSpy.join('\n')).toContain('invalid_status');
      expect(consoleErrorSpy.join('\n')).toContain('completado, en_curso, pendiente');
    });
  });

  describe('output format', () => {
    it('should display empty state when no milestones', async () => {
      const data: ProgressData = { milestones: [] };
      await writeFile(join(testDir, 'progress.json'), JSON.stringify(data));

      await statusCommand();

      const output = consoleLogSpy.join('\n');
      expect(output).toContain('Estado del proyecto');
      expect(output).toContain('No hay milestones definidos');
    });

    it('should display milestone with no tasks', async () => {
      const data: ProgressData = {
        milestones: [{ name: 'Milestone 1', tasks: [] }],
      };
      await writeFile(join(testDir, 'progress.json'), JSON.stringify(data));

      await statusCommand();

      const output = consoleLogSpy.join('\n');
      expect(output).toContain('Estado del proyecto');
      expect(output).toContain('Milestone 1');
      expect(output).toContain('Sin tareas');
    });

    it('should display counts and percentages for each status', async () => {
      const data: ProgressData = {
        milestones: [
          {
            name: 'Milestone Alpha',
            tasks: [
              { name: 'Task 1', status: 'completado' },
              { name: 'Task 2', status: 'completado' },
              { name: 'Task 3', status: 'en_curso' },
              { name: 'Task 4', status: 'pendiente' },
            ],
          },
        ],
      };
      await writeFile(join(testDir, 'progress.json'), JSON.stringify(data));

      await statusCommand();

      const output = consoleLogSpy.join('\n');
      expect(output).toContain('Estado del proyecto');
      expect(output).toContain('Milestone Alpha');
      expect(output).toContain('Completado: 2 (50.0%)');
      expect(output).toContain('En curso:   1 (25.0%)');
      expect(output).toContain('Pendiente:  1 (25.0%)');
      expect(output).toContain('Total:      4');
    });

    it('should display multiple milestones', async () => {
      const data: ProgressData = {
        milestones: [
          {
            name: 'Phase 1',
            tasks: [
              { name: 'T1', status: 'completado' },
              { name: 'T2', status: 'completado' },
            ],
          },
          {
            name: 'Phase 2',
            tasks: [
              { name: 'T3', status: 'en_curso' },
              { name: 'T4', status: 'pendiente' },
              { name: 'T5', status: 'pendiente' },
            ],
          },
        ],
      };
      await writeFile(join(testDir, 'progress.json'), JSON.stringify(data));

      await statusCommand();

      const output = consoleLogSpy.join('\n');
      expect(output).toContain('Phase 1');
      expect(output).toContain('Completado: 2 (100.0%)');
      expect(output).toContain('Phase 2');
      expect(output).toContain('En curso:   1 (33.3%)');
      expect(output).toContain('Pendiente:  2 (66.7%)');
    });

    it('should display deterministic output for same input', async () => {
      const data: ProgressData = {
        milestones: [
          {
            name: 'M1',
            tasks: [
              { name: 'T1', status: 'completado' },
              { name: 'T2', status: 'en_curso' },
            ],
          },
        ],
      };
      await writeFile(join(testDir, 'progress.json'), JSON.stringify(data));

      await statusCommand();
      const firstOutput = consoleLogSpy.join('\n');

      consoleLogSpy = [];

      await statusCommand();
      const secondOutput = consoleLogSpy.join('\n');

      expect(firstOutput).toBe(secondOutput);
    });
  });

  describe('edge cases', () => {
    it('should handle 100% completed milestone', async () => {
      const data: ProgressData = {
        milestones: [
          {
            name: 'Done',
            tasks: [
              { name: 'T1', status: 'completado' },
              { name: 'T2', status: 'completado' },
            ],
          },
        ],
      };
      await writeFile(join(testDir, 'progress.json'), JSON.stringify(data));

      await statusCommand();

      const output = consoleLogSpy.join('\n');
      expect(output).toContain('Completado: 2 (100.0%)');
      expect(output).toContain('En curso:   0 (0.0%)');
      expect(output).toContain('Pendiente:  0 (0.0%)');
    });

    it('should handle milestone with single task', async () => {
      const data: ProgressData = {
        milestones: [
          {
            name: 'Solo',
            tasks: [{ name: 'Only task', status: 'en_curso' }],
          },
        ],
      };
      await writeFile(join(testDir, 'progress.json'), JSON.stringify(data));

      await statusCommand();

      const output = consoleLogSpy.join('\n');
      expect(output).toContain('Solo');
      expect(output).toContain('Completado: 0 (0.0%)');
      expect(output).toContain('En curso:   1 (100.0%)');
      expect(output).toContain('Pendiente:  0 (0.0%)');
      expect(output).toContain('Total:      1');
    });
  });
});
