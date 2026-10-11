/**
 * Tests y snapshots de fixtures FDL (FRA-60, T5 de SPEC-0004).
 *
 * Recorre los fixtures JSON estables de `test/fixtures/fdl/` y ejercita la
 * cadena completa parser → validador → diagnósticos sobre cada uno, fijando
 * snapshots comprometidos del IR parseado (expansión de defaults §7.3) y de los
 * diagnósticos formateados.
 *
 * - `valid/` contiene los ejemplos de SPEC-0004 §7.6 verbatim: deben parsear,
 *   validar sin violaciones y no producir ningún diagnóstico.
 * - `invalid/` contiene un documento bien formado por regla (`vr-NN-<slug>.json`)
 *   que dispara exactamente esa regla VR-NN.
 *
 * Los fixtures se cargan de forma determinística: se leen los directorios, se
 * ordenan los nombres y se itera. Las rutas se resuelven con
 * `fileURLToPath(import.meta.url)` relativo a este archivo (mismo mecanismo que
 * `test/adapter-bridge.test.ts`). No se snapshotean rutas absolutas ni
 * timestamps; cada snapshot se nombra por el fixture para que sea independiente
 * del orden.
 *
 * @see SPEC-0004 §7.6 (ejemplos), §8 (reglas VR-1..VR-12), §10 T5
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import {
  parseFdl,
  validateFdl,
  diagnoseFdl,
  formatDiagnostics,
} from '../index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesDir = join(__dirname, '..', '..', 'test', 'fixtures', 'fdl');

/** Lee los nombres de los fixtures `.json` de un subdirectorio, ordenados. */
function fixtureNames(kind: 'valid' | 'invalid'): string[] {
  return readdirSync(join(fixturesDir, kind))
    .filter((name) => name.endsWith('.json'))
    .sort();
}

/** Lee el texto fuente de un fixture. */
function readFixture(kind: 'valid' | 'invalid', name: string): string {
  return readFileSync(join(fixturesDir, kind, name), 'utf-8');
}

/** Deriva la regla `VR-N` del prefijo `vr-NN` del nombre de archivo. */
function ruleFromName(name: string): string {
  const match = /^vr-(\d+)-/.exec(name);
  if (match === null) throw new Error(`fixture name without vr-NN prefix: ${name}`);
  return `VR-${Number(match[1])}`;
}

describe('fixtures FDL — documentos válidos (§7.6)', () => {
  for (const name of fixtureNames('valid')) {
    describe(name, () => {
      const source = readFixture('valid', name);

      it('parsea al IR materializado (snapshot)', () => {
        expect(parseFdl(source)).toMatchSnapshot(name);
      });

      it('valida sin violaciones', () => {
        expect(validateFdl(parseFdl(source)).valid).toBe(true);
      });

      it('no produce diagnósticos de punta a punta', () => {
        expect(diagnoseFdl(source)).toEqual([]);
      });
    });
  }
});

describe('fixtures FDL — documentos inválidos (uno por VR)', () => {
  for (const name of fixtureNames('invalid')) {
    describe(name, () => {
      const source = readFixture('invalid', name);
      const rule = ruleFromName(name);

      it('es bien formado: parseFdl no lanza', () => {
        expect(() => parseFdl(source)).not.toThrow();
      });

      it(`dispara ${rule}`, () => {
        const codes = diagnoseFdl(source).map((d) => d.code);
        expect(codes).toContain(rule);
      });

      it('diagnósticos formateados (snapshot)', () => {
        expect(formatDiagnostics(diagnoseFdl(source))).toMatchSnapshot(name);
      });
    });
  }
});

describe('fixtures FDL — rama de error de forma de diagnoseFdl', () => {
  it('JSON malformado → un único diagnóstico INVALID_JSON en (root)', () => {
    const diagnostics = diagnoseFdl('{ not json');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe('INVALID_JSON');
    expect(diagnostics[0]!.location.path).toBe('(root)');
  });

  it('clave obligatoria ausente → un único diagnóstico MISSING_KEY', () => {
    const src = JSON.stringify({ fdlVersion: '0', project: {}, entities: [] });
    const diagnostics = diagnoseFdl(src);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe('MISSING_KEY');
    expect(diagnostics[0]!.location.path).toBe('project');
  });

  it('tipo JSON incorrecto para una clave → un único diagnóstico INVALID_TYPE', () => {
    const src = JSON.stringify({
      fdlVersion: '0',
      project: { name: 'tienda' },
      entities: 'nope',
    });
    const diagnostics = diagnoseFdl(src);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe('INVALID_TYPE');
    expect(diagnostics[0]!.location.path).toBe('entities');
  });
});
