import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { statusCommand } from './status.js';
import { DIAGRAMA1_MARKERS, DIAGRAMA2_MARKERS } from './progress-map.js';
import type { ProgressData } from '../types/progress.js';

/**
 * `fractal status` lee la fuente de verdad real `docs/progress.json`
 * (shape `{ id, nombre, entregable, estado }` + `capacidades` opcional) y
 * reproduce el resumen de `pnpm progress` (scripts/progress-map.js). Ver FRA-46.
 */
describe('fractal status', () => {
  const testDir = join(process.cwd(), 'test-status-temp');
  const progressPath = join(testDir, 'docs', 'progress.json');
  let originalCwd: string;
  let consoleLogSpy: string[];
  let consoleErrorSpy: string[];
  let processExitSpy: number | null;
  let originalLog: typeof console.log;
  let originalError: typeof console.error;
  let originalExit: typeof process.exit;

  async function writeProgress(data: unknown): Promise<void> {
    await mkdir(join(testDir, 'docs'), { recursive: true });
    await writeFile(progressPath, JSON.stringify(data));
  }

  beforeEach(async () => {
    originalCwd = process.cwd();
    consoleLogSpy = [];
    consoleErrorSpy = [];
    processExitSpy = null;

    originalLog = console.log;
    originalError = console.error;
    originalExit = process.exit;

    console.log = (...args: unknown[]) => {
      consoleLogSpy.push(args.join(' '));
    };

    console.error = (...args: unknown[]) => {
      consoleErrorSpy.push(args.join(' '));
    };

    process.exit = ((code?: number) => {
      processExitSpy = code ?? 0;
      throw new Error(`process.exit(${code})`);
    }) as never;

    await mkdir(join(testDir, 'docs'), { recursive: true });
    process.chdir(testDir);
  });

  afterEach(async () => {
    console.log = originalLog;
    console.error = originalError;
    process.exit = originalExit;

    process.chdir(originalCwd);
    await rm(testDir, { recursive: true, force: true });
  });

  describe('validation', () => {
    it('should fail with actionable message when docs/progress.json is missing', async () => {
      await expect(statusCommand()).rejects.toThrow('process.exit');

      expect(processExitSpy).toBe(1);
      expect(consoleErrorSpy.join('\n')).toContain('No se encontró docs/progress.json');
      expect(consoleErrorSpy.join('\n')).toContain('Crea el archivo docs/progress.json');
    });

    it('should fail with actionable message when JSON is invalid', async () => {
      await writeFile(progressPath, '{ invalid json }');

      await expect(statusCommand()).rejects.toThrow('process.exit');

      expect(processExitSpy).toBe(1);
      expect(consoleErrorSpy.join('\n')).toContain('no es un JSON válido');
      expect(consoleErrorSpy.join('\n')).toContain('Verifica la sintaxis JSON');
    });

    it('should fail when root is not an object', async () => {
      await writeFile(progressPath, '[]');

      await expect(statusCommand()).rejects.toThrow('process.exit');

      expect(processExitSpy).toBe(1);
      expect(consoleErrorSpy.join('\n')).toContain('Estructura inválida');
      expect(consoleErrorSpy.join('\n')).toContain('root must be object');
    });

    it('should fail when milestones field is missing', async () => {
      await writeFile(progressPath, '{}');

      await expect(statusCommand()).rejects.toThrow('process.exit');

      expect(processExitSpy).toBe(1);
      expect(consoleErrorSpy.join('\n')).toContain('Estructura inválida');
      expect(consoleErrorSpy.join('\n')).toContain('missing "milestones"');
    });

    it('should fail when milestones is not an array', async () => {
      await writeProgress({ milestones: 'not-array' });

      await expect(statusCommand()).rejects.toThrow('process.exit');

      expect(processExitSpy).toBe(1);
      expect(consoleErrorSpy.join('\n')).toContain('Estructura inválida');
      expect(consoleErrorSpy.join('\n')).toContain('"milestones" must be array');
    });

    it('should fail when milestones is empty', async () => {
      await writeProgress({ milestones: [] });

      await expect(statusCommand()).rejects.toThrow('process.exit');

      expect(processExitSpy).toBe(1);
      expect(consoleErrorSpy.join('\n')).toContain('Estructura inválida');
      expect(consoleErrorSpy.join('\n')).toContain('"milestones" must not be empty');
    });

    it('should fail when milestone lacks id', async () => {
      await writeProgress({
        milestones: [{ nombre: 'M', entregable: 'E', estado: 'completado' }],
      });

      await expect(statusCommand()).rejects.toThrow('process.exit');

      expect(processExitSpy).toBe(1);
      expect(consoleErrorSpy.join('\n')).toContain('Estructura inválida');
      expect(consoleErrorSpy.join('\n')).toContain('milestone[0].id must be string');
    });

    it('should fail when milestone lacks nombre', async () => {
      await writeProgress({
        milestones: [{ id: 'M0', entregable: 'E', estado: 'completado' }],
      });

      await expect(statusCommand()).rejects.toThrow('process.exit');

      expect(processExitSpy).toBe(1);
      expect(consoleErrorSpy.join('\n')).toContain('milestone[0].nombre must be string');
    });

    it('should fail when milestone lacks entregable', async () => {
      await writeProgress({
        milestones: [{ id: 'M0', nombre: 'N', estado: 'completado' }],
      });

      await expect(statusCommand()).rejects.toThrow('process.exit');

      expect(processExitSpy).toBe(1);
      expect(consoleErrorSpy.join('\n')).toContain('milestone[0].entregable must be string');
    });

    it('should fail when milestone lacks estado', async () => {
      await writeProgress({
        milestones: [{ id: 'M0', nombre: 'N', entregable: 'E' }],
      });

      await expect(statusCommand()).rejects.toThrow('process.exit');

      expect(processExitSpy).toBe(1);
      expect(consoleErrorSpy.join('\n')).toContain('milestone[0].estado is required');
    });

    it('should fail when estado is not in enum', async () => {
      await writeProgress({
        milestones: [
          { id: 'M0', nombre: 'N', entregable: 'E', estado: 'invalid_status' },
        ],
      });

      await expect(statusCommand()).rejects.toThrow('process.exit');

      expect(processExitSpy).toBe(1);
      expect(consoleErrorSpy.join('\n')).toContain('Estado inválido');
      expect(consoleErrorSpy.join('\n')).toContain('invalid_status');
      expect(consoleErrorSpy.join('\n')).toContain('completado, en_curso, pendiente');
    });

    it('should fail when capacidades node has invalid estado', async () => {
      await writeProgress({
        milestones: [
          { id: 'M0', nombre: 'N', entregable: 'E', estado: 'completado' },
        ],
        capacidades: {
          nodos: [{ id: 'NEW', label: 'fractal new', estado: 'nope' }],
        },
      });

      await expect(statusCommand()).rejects.toThrow('process.exit');

      expect(processExitSpy).toBe(1);
      expect(consoleErrorSpy.join('\n')).toContain('Estado inválido');
      expect(consoleErrorSpy.join('\n')).toContain('"capacidades" node "NEW"');
    });
  });

  describe('output format', () => {
    it('should reproduce the pnpm progress summary shape', async () => {
      const data: ProgressData = {
        proyecto: 'Fractal',
        actualizado: '2026-09-28',
        milestones: [
          { id: 'M0', nombre: 'Fundaciones', entregable: 'reglas y CI', estado: 'completado' },
          { id: 'M1', nombre: 'Esqueleto', entregable: 'new + deploy', estado: 'en_curso' },
          { id: 'M2', nombre: 'FDL', entregable: 'CRUD', estado: 'pendiente' },
          { id: 'M3', nombre: 'Auth', entregable: 'roles', estado: 'pendiente' },
        ],
      };
      await writeProgress(data);

      await statusCommand();

      const output = consoleLogSpy.join('\n');
      expect(output).toContain('🗺️  Mapa de avance — Fractal');
      expect(output).toContain('Actualizado: 2026-09-28');
      expect(output).toContain('✅ M0 — Fundaciones: reglas y CI');
      expect(output).toContain('🟡 M1 — Esqueleto: new + deploy');
      expect(output).toContain('⬜ M2 — FDL: CRUD');
      expect(output).toContain('✅ Completado: 1/4 (25%)');
      expect(output).toContain('🟡 En curso: 1/4 (25%)');
      expect(output).toContain('⬜ Pendiente: 2/4 (50%)');
    });

    it('should default project name and omit Actualizado when absent', async () => {
      const data: ProgressData = {
        milestones: [
          { id: 'M0', nombre: 'Solo', entregable: 'algo', estado: 'en_curso' },
        ],
      };
      await writeProgress(data);

      await statusCommand();

      const output = consoleLogSpy.join('\n');
      expect(output).toContain('🗺️  Mapa de avance — Proyecto');
      expect(output).not.toContain('Actualizado:');
      expect(output).toContain('🟡 M0 — Solo: algo');
      expect(output).toContain('🟡 En curso: 1/1 (100%)');
    });

    it('should round percentages the same way as pnpm progress', async () => {
      const data: ProgressData = {
        proyecto: 'Fractal',
        milestones: [
          { id: 'M0', nombre: 'A', entregable: 'a', estado: 'completado' },
          { id: 'M1', nombre: 'B', entregable: 'b', estado: 'en_curso' },
          { id: 'M2', nombre: 'C', entregable: 'c', estado: 'en_curso' },
          { id: 'M3', nombre: 'D', entregable: 'd', estado: 'pendiente' },
          { id: 'M4', nombre: 'E', entregable: 'e', estado: 'pendiente' },
          { id: 'M5', nombre: 'F', entregable: 'f', estado: 'pendiente' },
          { id: 'M6', nombre: 'G', entregable: 'g', estado: 'pendiente' },
        ],
      };
      await writeProgress(data);

      await statusCommand();

      const output = consoleLogSpy.join('\n');
      // 1/7 ≈ 14%, 2/7 ≈ 29%, 4/7 ≈ 57%
      expect(output).toContain('✅ Completado: 1/7 (14%)');
      expect(output).toContain('🟡 En curso: 2/7 (29%)');
      expect(output).toContain('⬜ Pendiente: 4/7 (57%)');
    });

    it('should accept a valid capacidades block', async () => {
      const data: ProgressData = {
        proyecto: 'Fractal',
        milestones: [
          { id: 'M0', nombre: 'N', entregable: 'E', estado: 'completado' },
        ],
        capacidades: {
          grupos: [
            {
              id: 'CAP',
              titulo: 'Capabilities',
              nodos: [{ id: 'NEW', label: 'fractal new', estado: 'en_curso' }],
            },
          ],
          nodos: [{ id: 'FDL', label: 'FDL', estado: 'pendiente' }],
          aristas: [['NEW', 'FDL']],
        },
      };
      await writeProgress(data);

      await statusCommand();

      const output = consoleLogSpy.join('\n');
      expect(output).toContain('✅ M0 — N: E');
      expect(output).toContain('✅ Completado: 1/1 (100%)');
    });

    it('should display deterministic output for same input', async () => {
      const data: ProgressData = {
        proyecto: 'Fractal',
        milestones: [
          { id: 'M0', nombre: 'A', entregable: 'a', estado: 'completado' },
          { id: 'M1', nombre: 'B', entregable: 'b', estado: 'en_curso' },
        ],
      };
      await writeProgress(data);

      await statusCommand();
      const firstOutput = consoleLogSpy.join('\n');

      consoleLogSpy = [];

      await statusCommand();
      const secondOutput = consoleLogSpy.join('\n');

      expect(firstOutput).toBe(secondOutput);
    });
  });

  describe('write mode (--write) — SPEC-0031 AC-3 / FRA-47', () => {
    const mapaPath = join(testDir, 'docs', 'MAPA_DE_PROGRESO.md');

    const sample: ProgressData = {
      proyecto: 'Fractal',
      milestones: [
        { id: 'M0', nombre: 'Fundaciones', entregable: 'reglas', estado: 'en_curso' },
        { id: 'M1', nombre: 'Esqueleto', entregable: 'app online', estado: 'pendiente' },
        { id: 'M2', nombre: 'Entidades', entregable: 'CRUD', estado: 'completado' },
      ],
      capacidades: {
        grupos: [
          {
            id: 'CAP',
            titulo: 'Capabilities',
            nodos: [{ id: 'NEW', label: 'fractal new', estado: 'en_curso' }],
          },
        ],
        nodos: [{ id: 'FDL', label: 'FDL', estado: 'pendiente' }],
        aristas: [['NEW', 'FDL']],
      },
    };

    async function writeMapa({ withDiagrama2 = true } = {}): Promise<void> {
      const d2 = withDiagrama2
        ? `\n## Diagrama 2\n\n${DIAGRAMA2_MARKERS.start}\nSTALE\n${DIAGRAMA2_MARKERS.end}\n`
        : '';
      const md =
        `# Mapa\n\nTexto a mano antes.\n\n## Diagrama 1\n\n` +
        `${DIAGRAMA1_MARKERS.start}\nSTALE\n${DIAGRAMA1_MARKERS.end}\n` +
        `${d2}\nTexto a mano después.\n`;
      await writeFile(mapaPath, md);
    }

    it('regenera ambos diagramas desde progress.json e imprime el resumen', async () => {
      await writeProgress(sample);
      await writeMapa();

      await statusCommand({ write: true });

      const md = await readFile(mapaPath, 'utf-8');
      expect(md).toContain('flowchart LR'); // Diagrama 1
      expect(md).toContain('flowchart TD'); // Diagrama 2
      expect(md).not.toContain('STALE');
      // Conserva el contenido escrito a mano alrededor de los marcadores.
      expect(md).toContain('Texto a mano antes.');
      expect(md).toContain('Texto a mano después.');
      // Colorea por estado.
      expect(md).toContain('class M0 curso;');
      expect(md).toContain('class M2 done;');

      // Sigue imprimiendo el resumen de siempre.
      const output = consoleLogSpy.join('\n');
      expect(output).toContain('🗺️  Mapa de avance — Fractal');
      expect(output).toContain('✅ M2 — Entidades: CRUD');
      expect(output).toContain('Diagramas regenerados');
    });

    it('es idempotente: una segunda corrida no produce diff', async () => {
      await writeProgress(sample);
      await writeMapa();

      await statusCommand({ write: true });
      const afterFirst = await readFile(mapaPath, 'utf-8');

      consoleLogSpy = [];
      await statusCommand({ write: true });
      const afterSecond = await readFile(mapaPath, 'utf-8');

      expect(afterSecond).toBe(afterFirst);
      expect(consoleLogSpy.join('\n')).toContain('ya estaban sincronizados');
    });

    it('sin --write no toca el mapa (modo lectura por defecto)', async () => {
      await writeProgress(sample);
      await writeMapa();
      const before = await readFile(mapaPath, 'utf-8');

      await statusCommand();

      expect(await readFile(mapaPath, 'utf-8')).toBe(before);
    });

    it('falla con mensaje accionable si falta MAPA_DE_PROGRESO.md', async () => {
      await writeProgress(sample);

      await expect(statusCommand({ write: true })).rejects.toThrow('process.exit');

      expect(processExitSpy).toBe(1);
      expect(consoleErrorSpy.join('\n')).toContain('No se encontró docs/MAPA_DE_PROGRESO.md');
    });

    it('falla nombrando los marcadores del Diagrama 2 cuando faltan pero hay capacidades', async () => {
      await writeProgress(sample);
      await writeMapa({ withDiagrama2: false });

      await expect(statusCommand({ write: true })).rejects.toThrow('process.exit');

      expect(processExitSpy).toBe(1);
      expect(consoleErrorSpy.join('\n')).toContain(DIAGRAMA2_MARKERS.start);
    });
  });
});
