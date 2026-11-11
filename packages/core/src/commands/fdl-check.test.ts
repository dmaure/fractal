/**
 * Tests del comando `fractal fdl check` (SPEC-0007 AC-1).
 *
 * FDL válido → ok. FDL inválido → reporta {rule, path, message} y no-ok.
 */

import { describe, it, expect } from 'vitest';
import { checkFdlSource } from './fdl-check.js';

const VALID = JSON.stringify({
  fdlVersion: '0',
  project: { name: 'demo' },
  entities: [
    {
      name: 'Author',
      fields: [
        { name: 'id', type: 'uuid', primaryKey: true },
        { name: 'name', type: 'string', maxLength: 255 },
      ],
    },
  ],
});

describe('checkFdlSource', () => {
  it('un FDL válido reporta ok y sin violaciones', () => {
    const result = checkFdlSource(VALID);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.report).toContain('válido');
  });

  it('un FDL inválido reporta no-ok con {rule, path, message}', () => {
    const invalid = JSON.stringify({
      fdlVersion: '0',
      project: { name: 'demo' },
      entities: [
        {
          name: 'Author',
          fields: [{ name: 'weird', type: 'banana' }],
        },
      ],
    });

    const result = checkFdlSource(invalid);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);

    // El reporte legible nombra la regla y el path de la violación.
    expect(result.report).toContain('VR-3');
    expect(result.report).toContain('entities[0].fields[0].type');

    const d = result.diagnostics[0];
    expect(d.code).toBe('VR-3');
    expect(typeof d.location.path).toBe('string');
    expect(d.message.length).toBeGreaterThan(0);
  });

  it('un JSON malformado reporta no-ok con una violación de forma', () => {
    const result = checkFdlSource('{ no es json');
    expect(result.ok).toBe(false);
    expect(result.diagnostics.length).toBe(1);
    expect(result.diagnostics[0].code).toBe('INVALID_JSON');
  });
});
