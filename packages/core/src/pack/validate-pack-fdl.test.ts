/**
 * Tests del gate de contrato FDL del pack (SPEC-0007 AC-1).
 *
 * Un pack con FDL válido pasa; un pack con FDL inválido reporta TODAS las
 * violaciones (`rule`, `path`, `message`) y bloquea.
 */

import { describe, it, expect } from 'vitest';
import {
  assertPackFdlValid,
  collectPackFdlViolations,
  PackFdlValidationError,
} from './validate-pack-fdl.js';
import type { PackFile } from './write-pack.js';

const VALID_FDL = JSON.stringify({
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

describe('validate-pack-fdl', () => {
  it('un pack con FDL válido no reporta violaciones y no lanza', () => {
    const files: PackFile[] = [
      { path: 'AGENTS.md', contents: '# convenciones' },
      { path: 'fractal/domain.fdl.json', contents: VALID_FDL },
    ];

    expect(collectPackFdlViolations(files)).toEqual([]);
    expect(() => assertPackFdlValid(files)).not.toThrow();
  });

  it('ignora archivos que no son FDL (no valida AGENTS.md ni prompts)', () => {
    const files: PackFile[] = [
      { path: 'AGENTS.md', contents: 'esto no es JSON { inválido' },
      { path: 'fractal/prompts/add-entity.md', contents: 'tampoco' },
    ];

    expect(collectPackFdlViolations(files)).toEqual([]);
  });

  it('un pack con FDL inválido reporta TODAS las violaciones y bloquea', () => {
    // Entidad con nombre inválido (VR-1), tipo desconocido (VR-3) y relación a
    // entidad inexistente (VR-5): varias violaciones a la vez.
    const invalid = JSON.stringify({
      fdlVersion: '0',
      project: { name: 'demo' },
      entities: [
        {
          name: '1Bad',
          fields: [{ name: 'weird', type: 'banana' }],
          relations: [{ name: 'ghost', kind: 'one-to-many', target: 'Nope' }],
        },
      ],
    });

    const files: PackFile[] = [
      { path: 'fractal/domain.fdl.json', contents: invalid },
    ];

    const violations = collectPackFdlViolations(files);
    const rules = violations.map((v) => v.rule);
    expect(rules).toContain('VR-1');
    expect(rules).toContain('VR-3');
    expect(rules).toContain('VR-5');
    // Cada violación trae file, path y message.
    for (const v of violations) {
      expect(v.file).toBe('fractal/domain.fdl.json');
      expect(typeof v.path).toBe('string');
      expect(v.message.length).toBeGreaterThan(0);
    }

    expect(() => assertPackFdlValid(files)).toThrow(PackFdlValidationError);
  });

  it('un FDL con JSON malformado reporta una violación de parseo', () => {
    const files: PackFile[] = [
      { path: 'fractal/domain.fdl.json', contents: '{ no es json' },
    ];

    const violations = collectPackFdlViolations(files);
    expect(violations.length).toBe(1);
    expect(violations[0].rule).toBe('INVALID_JSON');
  });
});
