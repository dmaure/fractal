import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import {
  extractMermaid,
  buildDiagramExports,
  resolveFormats,
  buildExportPlan,
} from './export-diagrams.js';
import { generateDiagrama1 } from './progress-map.js';
import type { ProgressData } from '../types/progress.js';

/**
 * Tests de la exportación de diagramas (FRA-48). Cubren SOLO las partes puras
 * que no necesitan navegador: extracción del texto Mermaid de los bloques
 * generados, parseo/validación de `--format`, construcción de rutas de salida,
 * filtrado por formato y comportamiento cuando no hay `capacidades`. El render
 * real (Chromium) se prueba, gateado, en `@fractal/progress-export`.
 */

const sampleProgress: ProgressData = {
  proyecto: 'Fractal',
  milestones: [
    { id: 'M0', nombre: 'Fundaciones', entregable: 'reglas y docs', estado: 'en_curso' },
    { id: 'M1', nombre: 'Esqueleto', entregable: 'app online', estado: 'pendiente' },
  ],
  capacidades: {
    grupos: [
      {
        id: 'CAP',
        titulo: 'Capabilities',
        nodos: [{ id: 'NEW', label: 'fractal new', estado: 'en_curso' }],
      },
    ],
    nodos: [{ id: 'FDL', label: 'FDL', estado: 'completado' }],
    aristas: [['NEW', 'FDL']],
  },
};

const sinCapacidades: ProgressData = {
  milestones: sampleProgress.milestones,
};

describe('export-diagrams · extractMermaid', () => {
  it('quita las cercas ```mermaid de un bloque generado', () => {
    const block = generateDiagrama1(sampleProgress.milestones);
    const text = extractMermaid(block);
    expect(block).toContain('```mermaid');
    expect(text).not.toContain('```');
    expect(text.startsWith('flowchart LR')).toBe(true);
    expect(text).toContain('M0 --> M1');
  });

  it('es idempotente sobre texto sin cercas', () => {
    const text = 'flowchart LR\n    A --> B';
    expect(extractMermaid(text)).toBe(text);
  });
});

describe('export-diagrams · buildDiagramExports', () => {
  it('incluye hitos y capacidades cuando hay bloque capacidades', () => {
    const items = buildDiagramExports(sampleProgress);
    expect(items.map((d) => d.basename)).toEqual(['mapa-hitos', 'mapa-capacidades']);
    expect(items[0].mermaid).toContain('flowchart LR');
    expect(items[1].mermaid).toContain('flowchart TD');
  });

  it('exporta solo el Diagrama 1 cuando no hay capacidades', () => {
    const items = buildDiagramExports(sinCapacidades);
    expect(items.map((d) => d.basename)).toEqual(['mapa-hitos']);
  });
});

describe('export-diagrams · resolveFormats', () => {
  it('expande "both" a svg y png', () => {
    expect(resolveFormats('both')).toEqual(['svg', 'png']);
  });

  it('acepta svg o png individuales', () => {
    expect(resolveFormats('svg')).toEqual(['svg']);
    expect(resolveFormats('png')).toEqual(['png']);
  });

  it('rechaza un formato inválido con mensaje accionable', () => {
    expect(() => resolveFormats('webp')).toThrow(/Formato de exportación inválido/);
    expect(() => resolveFormats('webp')).toThrow(/svg \| png \| both/);
  });
});

describe('export-diagrams · buildExportPlan', () => {
  it('construye rutas de salida por diagrama y formato dentro de outDir', () => {
    const plan = buildExportPlan(sampleProgress, '/tmp/out', 'both');
    expect(plan).toHaveLength(2);
    expect(plan[0].outputs).toEqual([
      { format: 'svg', path: join('/tmp/out', 'mapa-hitos.svg') },
      { format: 'png', path: join('/tmp/out', 'mapa-hitos.png') },
    ]);
    expect(plan[1].outputs).toEqual([
      { format: 'svg', path: join('/tmp/out', 'mapa-capacidades.svg') },
      { format: 'png', path: join('/tmp/out', 'mapa-capacidades.png') },
    ]);
  });

  it('filtra por formato (svg) sin generar rutas png', () => {
    const plan = buildExportPlan(sampleProgress, '/tmp/out', 'svg');
    for (const entry of plan) {
      expect(entry.outputs.map((o) => o.format)).toEqual(['svg']);
    }
  });

  it('omite el Diagrama 2 cuando no hay capacidades', () => {
    const plan = buildExportPlan(sinCapacidades, '/tmp/out', 'png');
    expect(plan).toHaveLength(1);
    expect(plan[0].basename).toBe('mapa-hitos');
    expect(plan[0].outputs).toEqual([
      { format: 'png', path: join('/tmp/out', 'mapa-hitos.png') },
    ]);
  });
});
