/**
 * Tests del manifiesto del pack de convenciones (SPEC-0007, FRA-104).
 *
 * - El serializador es determinista: mismas entradas ⇒ mismos bytes, con orden
 *   de claves estable, indentación de 2 espacios y newline final (AC-8).
 * - El validador acepta un manifiesto completo y rechaza campos faltantes y
 *   rutas que no existen en el pack (cross-check).
 * - El gate `assertPackManifestValid` sobre el pack pasa con un manifiesto
 *   válido y bloquea cuando falta, no parsea o referencia archivos ausentes.
 */

import { describe, it, expect } from 'vitest';
import {
  serializePackManifest,
  collectPackManifestViolations,
  assertPackManifestValid,
  isManifestPackFile,
  PackManifestValidationError,
  PACK_MANIFEST_PATH,
  PACK_MANIFEST_VERSION,
  type PackManifest,
} from './manifest.js';
import type { PackFile } from './write-pack.js';

function validManifest(): PackManifest {
  return {
    manifestVersion: PACK_MANIFEST_VERSION,
    project: { name: 'demo' },
    framework: { adapter: 'demo-adapter', name: 'Demo Stack' },
    topology: 'monolith',
    conventions: 'AGENTS.md',
    data: { fdl: 'fractal/domain.fdl.json' },
    prompts: ['fractal/prompts/add-entity.md'],
  };
}

const PACK_PATHS = [
  'AGENTS.md',
  'fractal/domain.fdl.json',
  'fractal/prompts/add-entity.md',
  PACK_MANIFEST_PATH,
];

/** Arma un pack completo (archivos referenciados + manifiesto serializado). */
function buildPack(manifest: PackManifest): PackFile[] {
  return [
    { path: 'AGENTS.md', contents: '# convenciones\n' },
    { path: 'fractal/domain.fdl.json', contents: '{}\n' },
    { path: 'fractal/prompts/add-entity.md', contents: '# prompt\n' },
    serializePackManifest(manifest),
  ];
}

describe('serializePackManifest', () => {
  it('serializa en la ruta del manifiesto con 2 espacios y newline final', () => {
    const file = serializePackManifest(validManifest());

    expect(file.path).toBe(PACK_MANIFEST_PATH);
    expect(file.contents.endsWith('\n')).toBe(true);
    expect(file.contents).toContain('  "manifestVersion": "1"');
    // Round-trip: parsea al objeto declarado.
    expect(JSON.parse(file.contents)).toEqual({
      manifestVersion: '1',
      project: { name: 'demo' },
      framework: { adapter: 'demo-adapter', name: 'Demo Stack' },
      topology: 'monolith',
      conventions: 'AGENTS.md',
      data: { fdl: 'fractal/domain.fdl.json' },
      prompts: ['fractal/prompts/add-entity.md'],
    });
  });

  it('es determinista: dos llamadas producen los mismos bytes (AC-8)', () => {
    expect(serializePackManifest(validManifest()).contents).toBe(
      serializePackManifest(validManifest()).contents
    );
  });

  it('el orden de claves es estable aunque el objeto de entrada venga desordenado', () => {
    const shuffled: PackManifest = {
      prompts: ['fractal/prompts/add-entity.md'],
      data: { fdl: 'fractal/domain.fdl.json' },
      conventions: 'AGENTS.md',
      topology: 'monolith',
      framework: { name: 'Demo Stack', adapter: 'demo-adapter' },
      project: { name: 'demo' },
      manifestVersion: PACK_MANIFEST_VERSION,
    };

    expect(serializePackManifest(shuffled).contents).toBe(
      serializePackManifest(validManifest()).contents
    );
  });

  it('isManifestPackFile reconoce el manifiesto por su ruta', () => {
    expect(isManifestPackFile(serializePackManifest(validManifest()))).toBe(true);
    expect(isManifestPackFile({ path: 'AGENTS.md', contents: '' })).toBe(false);
  });
});

describe('collectPackManifestViolations', () => {
  it('un manifiesto completo con rutas existentes no reporta violaciones', () => {
    expect(collectPackManifestViolations(validManifest(), PACK_PATHS)).toEqual([]);
  });

  it('reporta cada campo requerido faltante', () => {
    const violations = collectPackManifestViolations({}, PACK_PATHS);
    const fields = violations.map((v) => v.field);
    expect(fields).toContain('manifestVersion');
    expect(fields).toContain('project.name');
    expect(fields).toContain('framework');
    expect(fields).toContain('topology');
    expect(fields).toContain('conventions');
    expect(fields).toContain('data.fdl');
    expect(fields).toContain('prompts');
  });

  it('rechaza un manifiesto que no es objeto', () => {
    expect(collectPackManifestViolations('nope', PACK_PATHS)).toEqual([
      { field: '(root)', message: expect.any(String) },
    ]);
  });

  it('cross-check: conventions / data.fdl / prompts deben existir en el pack', () => {
    const manifest = {
      ...validManifest(),
      conventions: 'MISSING.md',
      data: { fdl: 'fractal/missing.fdl.json' },
      prompts: ['fractal/prompts/missing.md'],
    };

    const violations = collectPackManifestViolations(manifest, PACK_PATHS);
    const fields = violations.map((v) => v.field);
    expect(fields).toContain('conventions');
    expect(fields).toContain('data.fdl');
    expect(fields).toContain('prompts[0]');
    for (const v of violations) {
      expect(v.message).toContain('no está entre los archivos del pack');
    }
  });

  it('rechaza prompts que no son strings', () => {
    const manifest = { ...validManifest(), prompts: [42] as unknown as string[] };
    const violations = collectPackManifestViolations(manifest, PACK_PATHS);
    expect(violations.map((v) => v.field)).toContain('prompts[0]');
  });
});

describe('assertPackManifestValid', () => {
  it('un pack con manifiesto válido no lanza', () => {
    expect(() => assertPackManifestValid(buildPack(validManifest()))).not.toThrow();
  });

  it('lanza si el pack no incluye el manifiesto', () => {
    const packSinManifiesto: PackFile[] = [
      { path: 'AGENTS.md', contents: '# convenciones\n' },
      { path: 'fractal/domain.fdl.json', contents: '{}\n' },
    ];
    expect(() => assertPackManifestValid(packSinManifiesto)).toThrow(
      PackManifestValidationError
    );
  });

  it('lanza si el manifiesto tiene JSON malformado', () => {
    const pack: PackFile[] = [
      { path: 'AGENTS.md', contents: '# convenciones\n' },
      { path: PACK_MANIFEST_PATH, contents: '{ no es json' },
    ];
    expect(() => assertPackManifestValid(pack)).toThrow(PackManifestValidationError);
  });

  it('lanza si el manifiesto referencia un archivo que no está en el pack', () => {
    const manifest = { ...validManifest(), conventions: 'AUSENTE.md' };
    // El manifiesto es válido de forma, pero apunta a un archivo inexistente.
    const pack: PackFile[] = [
      { path: 'fractal/domain.fdl.json', contents: '{}\n' },
      { path: 'fractal/prompts/add-entity.md', contents: '# prompt\n' },
      serializePackManifest(manifest),
    ];
    expect(() => assertPackManifestValid(pack)).toThrow(PackManifestValidationError);
  });
});
