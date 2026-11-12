/**
 * Tests de escritura atómica del pack (SPEC-0007 AC-5).
 *
 * Camino feliz: escribe el contenido correctamente. Fallo a mitad de la
 * escritura (rename que lanza): no queda el destino ni el temporal parcial.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, readdir, mkdir, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileAtomic, type AtomicWriteFsDeps } from './atomic-write.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fractal-atomic-'));
  tempDirs.push(dir);
  return dir;
}

describe('writeFileAtomic', () => {
  it('escribe el contenido en el destino (camino feliz) y crea el directorio padre', async () => {
    const root = await makeTempDir();
    const target = join(root, 'nested', 'file.txt');

    await writeFileAtomic(target, 'hola mundo');

    expect(await readFile(target, 'utf-8')).toBe('hola mundo');
    // No quedan temporales `.tmp` en el directorio.
    const entries = await readdir(join(root, 'nested'));
    expect(entries.filter((e) => e.endsWith('.tmp'))).toEqual([]);
  });

  it('ante un fallo a mitad (rename lanza) no deja destino ni temporal parcial', async () => {
    const root = await makeTempDir();
    const target = join(root, 'file.txt');

    const failingDeps: AtomicWriteFsDeps = {
      mkdir,
      writeFile,
      rename: async () => {
        throw new Error('fallo simulado en rename');
      },
      rm,
    };

    await expect(writeFileAtomic(target, 'contenido', failingDeps)).rejects.toThrow(
      'fallo simulado en rename'
    );

    // El destino nunca se creó.
    expect(existsSync(target)).toBe(false);
    // No quedó ningún temporal parcial en el directorio.
    const entries = await readdir(root);
    expect(entries.filter((e) => e.endsWith('.tmp'))).toEqual([]);
  });
});
