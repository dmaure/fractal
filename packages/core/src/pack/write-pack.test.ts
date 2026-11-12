/**
 * Tests de escritura del pack (SPEC-0007 AC-4, AC-6, AC-8).
 *
 * - Dry-run: devuelve los paths planificados y NO escribe nada (tempdir vacío).
 * - Validación de rutas: una ruta insegura hace fallar ANTES de escribir nada.
 * - Determinismo: dos escrituras idénticas producen archivos byte-idénticos.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writePack, type PackFile } from './write-pack.js';
import { PackPathError } from './path-safety.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fractal-writepack-'));
  tempDirs.push(dir);
  return dir;
}

const FILES: PackFile[] = [
  { path: 'AGENTS.md', contents: '# convenciones\n' },
  { path: 'fractal/domain.fdl.json', contents: '{"fdlVersion":"0"}\n' },
  { path: 'fractal/prompts/add-entity.md', contents: '# prompt\n' },
];

describe('writePack', () => {
  it('dry-run devuelve los paths planificados y no escribe nada', async () => {
    const root = await makeTempDir();

    const planned = await writePack(root, FILES, { dryRun: true });

    expect(planned).toEqual([
      'AGENTS.md',
      'fractal/domain.fdl.json',
      'fractal/prompts/add-entity.md',
    ]);

    // El tempdir queda vacío tras el dry-run.
    expect(await readdir(root)).toEqual([]);
  });

  it('escribe todos los archivos y devuelve sus paths', async () => {
    const root = await makeTempDir();

    const written = await writePack(root, FILES, { dryRun: false });

    expect(written).toEqual([
      'AGENTS.md',
      'fractal/domain.fdl.json',
      'fractal/prompts/add-entity.md',
    ]);
    expect(await readFile(join(root, 'AGENTS.md'), 'utf-8')).toBe('# convenciones\n');
    expect(await readFile(join(root, 'fractal', 'domain.fdl.json'), 'utf-8')).toBe(
      '{"fdlVersion":"0"}\n'
    );
    expect(
      await readFile(join(root, 'fractal', 'prompts', 'add-entity.md'), 'utf-8')
    ).toBe('# prompt\n');
  });

  it('valida TODAS las rutas antes de escribir: una ruta insegura falla sin tocar disco', async () => {
    const root = await makeTempDir();

    const badFiles: PackFile[] = [
      { path: 'AGENTS.md', contents: 'ok\n' },
      { path: '../escape.txt', contents: 'malo\n' },
    ];

    await expect(writePack(root, badFiles, { dryRun: false })).rejects.toBeInstanceOf(
      PackPathError
    );

    // No se escribió ningún archivo (ni siquiera el primero, válido).
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(false);
    expect(await readdir(root)).toEqual([]);
  });

  it('es determinista: dos escrituras producen archivos byte-idénticos (AC-8)', async () => {
    const rootA = await makeTempDir();
    const rootB = await makeTempDir();

    await writePack(rootA, FILES, { dryRun: false });
    await writePack(rootB, FILES, { dryRun: false });

    for (const file of FILES) {
      const a = await readFile(join(rootA, file.path), 'utf-8');
      const b = await readFile(join(rootB, file.path), 'utf-8');
      expect(a).toBe(b);
      expect(a).toBe(file.contents);
    }
  });
});
