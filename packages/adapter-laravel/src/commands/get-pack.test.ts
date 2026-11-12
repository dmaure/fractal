/**
 * Tests de la acción `get-pack` del adapter Laravel (SPEC-0007 AC-2, AC-3, AC-8).
 *
 * - Devuelve los tres archivos del pack con los paths esperados.
 * - El `fractal/domain.fdl.json` PASA el validador del core (VR-1..VR-12).
 * - Es determinista: dos llamadas producen el mismo resultado byte a byte.
 * - Un snapshot del contenido fija el pack como fuente de verdad estable.
 */

import { describe, it, expect } from 'vitest';
import { validateFdl, parseFdl } from '@fractal/core';
import { getPack } from './get-pack.js';

describe('getPack', () => {
  it('devuelve los tres archivos del pack con los paths esperados (AC-2, AC-3)', () => {
    const { files } = getPack('mi-proyecto');
    const paths = files.map((f) => f.path);

    expect(paths).toEqual([
      'AGENTS.md',
      'fractal/domain.fdl.json',
      'fractal/prompts/add-entity.md',
    ]);
  });

  it('el AGENTS.md documenta el mapeo del FDL y referencia el FDL + el prompt (AC-2)', () => {
    const { files } = getPack('mi-proyecto');
    const agents = files.find((f) => f.path === 'AGENTS.md')!.contents;

    expect(agents).toContain('mi-proyecto');
    expect(agents).toContain('fractal/domain.fdl.json');
    expect(agents).toContain('fractal/prompts/add-entity.md');
    // Menciona capas del stack real.
    expect(agents).toContain('Migración');
    expect(agents).toContain('Modelo');
  });

  it('el prompt add-entity es parametrizable y referencia el FDL y AGENTS.md (AC-3)', () => {
    const { files } = getPack('mi-proyecto');
    const prompt = files.find((f) => f.path === 'fractal/prompts/add-entity.md')!
      .contents;

    expect(prompt).toContain('{{ENTIDAD}}');
    expect(prompt).toContain('fractal/domain.fdl.json');
    expect(prompt).toContain('AGENTS.md');
  });

  it('el domain.fdl.json inicial PASA el validador del core (AC-1, AC-2)', () => {
    const { files } = getPack('mi-proyecto');
    const fdlText = files.find((f) => f.path === 'fractal/domain.fdl.json')!
      .contents;

    const doc = parseFdl(fdlText);
    const result = validateFdl(doc);

    expect(result.violations).toEqual([]);
    expect(result.valid).toBe(true);
    // El nombre del proyecto se inyecta en el contrato.
    expect(doc.project.name).toBe('mi-proyecto');
  });

  it('es determinista: dos llamadas producen el mismo pack byte a byte (AC-8)', () => {
    const a = getPack('mi-proyecto');
    const b = getPack('mi-proyecto');
    expect(a).toEqual(b);
    for (let i = 0; i < a.files.length; i++) {
      expect(a.files[i].contents).toBe(b.files[i].contents);
    }
  });

  it('snapshot del contenido del pack (fuente de verdad estable, AC-8)', () => {
    const { files } = getPack('demo');
    const byPath: Record<string, string> = {};
    for (const file of files) byPath[file.path] = file.contents;
    expect(byPath).toMatchSnapshot();
  });
});
