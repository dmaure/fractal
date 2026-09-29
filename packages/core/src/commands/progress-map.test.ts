import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  generateDiagrama1,
  generateDiagrama2,
  regenerateMap,
  validateProgress,
  validateCapacidades,
  DIAGRAMA1_MARKERS,
  DIAGRAMA2_MARKERS,
} from './progress-map.js';
import type { ProgressData } from '../types/progress.js';

/**
 * Núcleo de regeneración del mapa (SPEC-0031 T2 / AC-3, FRA-47). Estos son los
 * tests canónicos de la lógica de dominio, que ahora vive en el core y comparten
 * `fractal status --write` y `pnpm progress` (scripts/progress-map.js). Espejan
 * los tests del dev-script previo para no perder cobertura al mover la lógica.
 */

// Fuente de verdad de ejemplo (misma forma que docs/progress.json).
const sampleProgress: ProgressData = {
  proyecto: 'Fractal',
  actualizado: '2026-09-28',
  milestones: [
    { id: 'M0', nombre: 'Fundaciones', entregable: 'reglas y docs', estado: 'en_curso' },
    { id: 'M1', nombre: 'Esqueleto', entregable: 'app online', estado: 'pendiente' },
    { id: 'M2', nombre: 'Entidades', entregable: 'CRUD', estado: 'completado' },
  ],
  capacidades: {
    grupos: [
      {
        id: 'CAP',
        titulo: 'Capabilities (CLI · core)',
        nodos: [
          { id: 'NEW', label: 'fractal new', estado: 'en_curso' },
          { id: 'DEP', label: 'fractal deploy', estado: 'completado' },
        ],
      },
      {
        id: 'PKG',
        titulo: 'Packages',
        nodos: [{ id: 'CORE', label: 'core · agnostico', estado: 'en_curso' }],
      },
    ],
    nodos: [{ id: 'FDL', label: 'FDL · entidades', estado: 'pendiente' }],
    aristas: [
      ['NEW', 'CORE'],
      ['CORE', 'FDL'],
      ['DEP', 'CORE'],
    ],
  },
};

// Markdown mínimo con ambos pares de marcadores y contenido intencionalmente
// desactualizado entre ellos, más contenido escrito a mano alrededor.
function buildMapa({ withDiagrama2 = true }: { withDiagrama2?: boolean } = {}): string {
  const d2 = withDiagrama2
    ? `\n## Diagrama 2\n\n${DIAGRAMA2_MARKERS.start}\nSTALE\n${DIAGRAMA2_MARKERS.end}\n`
    : '';
  return (
    `# Mapa\n\nTexto a mano antes.\n\n## Diagrama 1\n\n` +
    `${DIAGRAMA1_MARKERS.start}\nSTALE\n${DIAGRAMA1_MARKERS.end}\n` +
    `${d2}\nTexto a mano después.\n`
  );
}

describe('progress-map · generación de diagramas (SPEC-0031 AC-3)', () => {
  let dir: string;
  let progressPath: string;
  let mapaPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'progress-map-'));
    progressPath = join(dir, 'progress.json');
    mapaPath = join(dir, 'MAPA.md');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe('generateDiagrama1', () => {
    it('genera un bloque estable (snapshot) coloreado por estado', () => {
      expect(generateDiagrama1(sampleProgress.milestones)).toMatchSnapshot();
    });

    it('asigna cada milestone a la clase de su estado', () => {
      const out = generateDiagrama1(sampleProgress.milestones);
      expect(out).toContain('class M0 curso;');
      expect(out).toContain('class M2 done;');
      expect(out).toContain('class M1 pend;');
    });
  });

  describe('generateDiagrama2', () => {
    it('genera un bloque estable (snapshot) con subgraphs, nodos y aristas', () => {
      expect(generateDiagrama2(sampleProgress.capacidades!)).toMatchSnapshot();
    });

    it('colorea los nodos por estado en orden estable', () => {
      const out = generateDiagrama2(sampleProgress.capacidades!);
      // Orden estable: nodos de grupos (en orden) y luego nodos sueltos.
      expect(out).toContain('class NEW,CORE curso;');
      expect(out).toContain('class DEP done;');
      expect(out).toContain('class FDL pend;');
    });

    it('tolera capacidades parciales (fallback a listas vacías)', () => {
      const out = generateDiagrama2({ grupos: [], nodos: [], aristas: [] });
      expect(out).toContain('flowchart TD');
      expect(out).toContain('classDef curso');
    });
  });

  describe('regenerateMap — idempotencia', () => {
    it('regenera ambos diagramas y una segunda corrida no produce diff', async () => {
      await writeFile(progressPath, JSON.stringify(sampleProgress));
      await writeFile(mapaPath, buildMapa());

      const first = await regenerateMap({ progressPath, mapaPath });
      expect(first.inSync).toBe(false);
      expect(first.changed).toEqual(['Diagrama 1', 'Diagrama 2']);

      const afterFirst = await readFile(mapaPath, 'utf-8');
      // Conserva el contenido escrito a mano alrededor de los marcadores.
      expect(afterFirst).toContain('Texto a mano antes.');
      expect(afterFirst).toContain('Texto a mano después.');
      expect(afterFirst).not.toContain('STALE');

      const second = await regenerateMap({ progressPath, mapaPath });
      expect(second.inSync).toBe(true);
      expect(second.changed).toEqual([]);

      const afterSecond = await readFile(mapaPath, 'utf-8');
      expect(afterSecond).toBe(afterFirst);
    });

    it('acepta datos ya cargados y evita releer progress.json', async () => {
      await writeFile(mapaPath, buildMapa());

      // Sin progressPath: si intentara cargar, fallaría; usa `data`.
      const res = await regenerateMap({ mapaPath, data: sampleProgress });
      expect(res.inSync).toBe(false);
      expect(res.changed).toEqual(['Diagrama 1', 'Diagrama 2']);

      const md = await readFile(mapaPath, 'utf-8');
      expect(md).toContain('flowchart LR');
      expect(md).toContain('flowchart TD');
    });

    it('modo check no escribe y reporta desincronización', async () => {
      await writeFile(progressPath, JSON.stringify(sampleProgress));
      await writeFile(mapaPath, buildMapa());
      const original = await readFile(mapaPath, 'utf-8');

      const res = await regenerateMap({ progressPath, mapaPath, check: true });
      expect(res.inSync).toBe(false);
      expect(res.changed.length).toBeGreaterThan(0);

      // No debe haber escrito el archivo.
      expect(await readFile(mapaPath, 'utf-8')).toBe(original);
    });
  });

  describe('compatibilidad hacia atrás (SPEC-0031 §7)', () => {
    it('un progress.json sin "capacidades" solo regenera el Diagrama 1', async () => {
      const legacy: ProgressData = { milestones: sampleProgress.milestones };
      await writeFile(progressPath, JSON.stringify(legacy));
      // Mapa sin siquiera los marcadores del Diagrama 2.
      await writeFile(mapaPath, buildMapa({ withDiagrama2: false }));

      const res = await regenerateMap({ progressPath, mapaPath });
      expect(res.changed).toEqual(['Diagrama 1']);

      const md = await readFile(mapaPath, 'utf-8');
      expect(md).toContain('flowchart LR');
      expect(md).not.toContain('flowchart TD');
    });

    it('no falla si faltan los marcadores del Diagrama 2 pero no hay datos de capacidades', async () => {
      const legacy: ProgressData = { milestones: sampleProgress.milestones };
      await writeFile(progressPath, JSON.stringify(legacy));
      await writeFile(mapaPath, buildMapa({ withDiagrama2: false }));

      await expect(regenerateMap({ progressPath, mapaPath })).resolves.toBeTruthy();
    });
  });

  describe('marcadores ausentes/ inválidos (SPEC-0031 AC-5)', () => {
    it('falla nombrando los marcadores del Diagrama 2 cuando hay datos pero faltan marcadores', async () => {
      await writeFile(progressPath, JSON.stringify(sampleProgress));
      await writeFile(mapaPath, buildMapa({ withDiagrama2: false }));

      await expect(regenerateMap({ progressPath, mapaPath })).rejects.toThrow(
        DIAGRAMA2_MARKERS.start
      );
    });

    it('falla nombrando los marcadores del Diagrama 1 cuando faltan', async () => {
      await writeFile(progressPath, JSON.stringify(sampleProgress));
      await writeFile(mapaPath, '# Mapa sin marcadores\n');

      await expect(regenerateMap({ progressPath, mapaPath })).rejects.toThrow(
        DIAGRAMA1_MARKERS.start
      );
    });
  });

  describe('validación de progress.json', () => {
    it('acepta un progress.json sin capacidades', () => {
      expect(() => validateProgress({ milestones: sampleProgress.milestones })).not.toThrow();
    });

    it('rechaza un estado de milestone fuera del enum', () => {
      expect(() =>
        validateProgress({ milestones: [{ id: 'M0', nombre: 'x', entregable: 'y', estado: 'raro' }] })
      ).toThrow(/Estado inválido/);
    });

    it('rechaza un estado de nodo fuera del enum en capacidades', () => {
      expect(() =>
        validateCapacidades({ nodos: [{ id: 'X', label: 'x', estado: 'raro' }] })
      ).toThrow(/Estado inválido/);
    });

    it('rechaza una arista que referencia un nodo inexistente', () => {
      expect(() =>
        validateCapacidades({
          nodos: [{ id: 'A', label: 'a', estado: 'en_curso' }],
          aristas: [['A', 'NOEXISTE']],
        })
      ).toThrow(/inexistente/);
    });
  });
});
