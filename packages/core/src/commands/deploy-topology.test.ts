/**
 * FRA-114: `fractal deploy` lee la topología de `fractal/manifest.json` para
 * pasársela al adapter en `get-contract` (en monorepo el build vive en el
 * directorio del backend).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readProjectTopology } from './deploy.js';

describe('readProjectTopology', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'fractal-topology-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function writeManifest(contents: string): Promise<void> {
    await mkdir(join(dir, 'fractal'), { recursive: true });
    await writeFile(join(dir, 'fractal', 'manifest.json'), contents);
  }

  it('devuelve la topología declarada en el manifiesto', async () => {
    await writeManifest(JSON.stringify({ topology: 'monorepo' }));
    expect(await readProjectTopology(dir)).toBe('monorepo');
  });

  it('sin manifiesto devuelve undefined', async () => {
    expect(await readProjectTopology(dir)).toBeUndefined();
  });

  it('con JSON inválido o topología desconocida devuelve undefined', async () => {
    await writeManifest('{ no es json');
    expect(await readProjectTopology(dir)).toBeUndefined();
    await writeManifest(JSON.stringify({ topology: 'microservicios' }));
    expect(await readProjectTopology(dir)).toBeUndefined();
  });
});
