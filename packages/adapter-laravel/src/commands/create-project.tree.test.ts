/**
 * Snapshot tests del ÁRBOL COMPLETO que genera `createProject`
 * (estructura + contenido) para las tres topologías: monolith, monorepo
 * y multirepo. FRA-53.
 *
 * ## Decisión de diseño sobre duplicación con FRA-52
 *
 * Este archivo es la ÚNICA fuente de verdad para el CONTENIDO de cada
 * archivo generado. REEMPLAZA (no duplica) los snapshots de contenido
 * por-stub que agregó FRA-52: aquéllos capturaban el output crudo de cada
 * generador de stub, contenido que vuelve a aparecer verbatim dentro de
 * este árbol. Para no snapshotear el mismo contenido en dos lugares, los
 * tests por-stub conservan solo sus aserciones de comportamiento
 * (`toContain` / `JSON.parse`) y se eliminaron sus `toMatchSnapshot()` junto
 * con los `.snap` correspondientes. Cualquier cambio a un stub rompe el
 * snapshot de "contenido" de abajo, cumpliendo el objetivo de FRA-53.
 *
 * ## Determinismo (AC-4)
 *
 * Se genera en un tempdir (`os.tmpdir()` + `fs.mkdtemp`) con un nombre de
 * proyecto fijo, se stripéa el prefijo del tempdir y solo se capturan paths
 * relativos POSIX ordenados. No hay paths absolutos, timestamps ni valores
 * dependientes de la máquina, por lo que dos corridas consecutivas producen
 * snapshots idénticos. Los tempdirs se limpian en `afterEach`.
 *
 * ## Asimetría de los generadores
 *
 * `monolith`/`monorepo` devuelven `<dest>/<name>`, mientras que `multirepo`
 * devuelve el directorio padre y escribe `<name>-api/` y `<name>-web/` como
 * hermanos. El harness recorre siempre el tempdir destino completo, por lo
 * que la asimetría se maneja de forma uniforme.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createProject } from './create-project.js';
import type { CreateProjectPayload } from '@fractal/core';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

interface Tree {
  /** Lista ordenada de paths relativos POSIX; los directorios llevan `/` final. */
  structure: string[];
  /** Mapa path relativo POSIX -> contenido utf-8 de cada archivo (claves ordenadas). */
  contents: Record<string, string>;
}

/**
 * Recorre `root` recursivamente y devuelve su estructura y contenido de
 * forma determinista. Ordena las entradas de cada directorio e incluye los
 * directorios (con `/` final) para capturar también los vacíos
 * (p.ej. `database/migrations/`).
 */
async function readTree(root: string): Promise<Tree> {
  const structure: string[] = [];
  const contents: Record<string, string> = {};

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      const rel = relative(root, abs).split(sep).join('/');
      if (entry.isDirectory()) {
        structure.push(`${rel}/`);
        await walk(abs);
      } else {
        structure.push(rel);
        contents[rel] = await readFile(abs, 'utf-8');
      }
    }
  }

  await walk(root);

  structure.sort();
  const sortedContents: Record<string, string> = {};
  for (const key of Object.keys(contents).sort()) {
    sortedContents[key] = contents[key];
  }
  return { structure, contents: sortedContents };
}

/**
 * Genera un proyecto en un tempdir aislado y devuelve su árbol completo.
 * El tempdir queda registrado para limpieza en `afterEach`.
 */
async function generateTree(
  topology: CreateProjectPayload['topology'],
  name: string
): Promise<Tree> {
  const root = await mkdtemp(join(tmpdir(), 'fractal-tree-'));
  tempDirs.push(root);

  const response = await createProject({
    name,
    topology,
    destinationPath: root,
    target: 'laravel',
  });

  expect(response.success).toBe(true);
  return readTree(root);
}

describe('árbol generado por createProject (estructura + contenido)', () => {
  it('monolith', async () => {
    const { structure, contents } = await generateTree('monolith', 'demo');
    expect(structure).toMatchSnapshot('estructura');
    expect(contents).toMatchSnapshot('contenido');
  });

  it('monorepo', async () => {
    const { structure, contents } = await generateTree('monorepo', 'demo');
    expect(structure).toMatchSnapshot('estructura');
    expect(contents).toMatchSnapshot('contenido');
  });

  it('multirepo', async () => {
    const { structure, contents } = await generateTree('multirepo', 'demo');
    expect(structure).toMatchSnapshot('estructura');
    expect(contents).toMatchSnapshot('contenido');
  });
});
