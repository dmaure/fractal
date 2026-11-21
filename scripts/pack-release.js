#!/usr/bin/env node
/**
 * Arma el tarball instalable del CLI: `fractal-cli-<versión>.tgz`.
 *
 * Un solo paquete (`@fractal/cli`) que lleva adentro, en `vendor/`
 * (dependencias `file:`), los paquetes del monorepo ya compilados: core, deploy,
 * progress-export y los adapters. Las dependencias de terceros (commander,
 * ssh2, …) las instala npm al hacer `npm install -g`. Así no hace falta
 * checkout, pnpm ni compilar, y `workspace:*` no aparece en lo instalado.
 *
 * Requiere haber corrido `pnpm build`. Uso:
 *   node scripts/pack-release.js [--out <dir>]     # default: ./release
 *
 * Migrar a npm (público o privado): ver docs/guides/distribucion.md.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Paquetes que viajan en el tarball: los que tienen `dist/` compilado. */
function bundledPackages(root) {
  return readdirSync(join(root, 'packages'))
    .map((d) => join(root, 'packages', d))
    .filter((dir) => existsSync(join(dir, 'package.json')))
    .map((dir) => ({ dir, pkg: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) }))
    .filter(({ dir }) => existsSync(join(dir, 'dist')));
}

/** Arma el package.json del paquete raíz del tarball. Pura, testeable. */
export function buildCliManifest(packages, version) {
  const external = {};
  for (const { pkg } of packages) {
    for (const [name, range] of Object.entries(pkg.dependencies ?? {})) {
      if (name.startsWith('@fractal/')) continue;
      if (external[name] && external[name] !== range) {
        throw new Error(`Rango en conflicto para ${name}: ${external[name]} vs ${range}`);
      }
      external[name] = range;
    }
  }
  return {
    name: '@fractal/cli',
    version,
    description: 'Fractal CLI: generador de aplicaciones production-ready',
    type: 'module',
    license: 'MIT',
    engines: { node: '>=20.0.0' },
    bin: { fractal: './vendor/core/dist/cli.js' },
    // Los paquetes de Fractal viajan en vendor/ y npm los enlaza en node_modules.
    // (bundleDependencies no sirve: npm corre los install scripts de TODO el
    // árbol, y el build nativo opcional de cpu-features rompe la instalación.)
    dependencies: {
      ...external,
      ...Object.fromEntries(packages.map(({ pkg, dir }) => [pkg.name, `file:vendor/${dir.split(/[\\/]/).pop()}`])),
    },
  };
}

export function packRelease({ root = ROOT, outDir = join(root, 'release') } = {}) {
  const packages = bundledPackages(root);
  if (!packages.some(({ pkg }) => pkg.name === '@fractal/core')) {
    throw new Error('Falta el build (packages/core/dist). Corré "pnpm build" primero.');
  }
  const core = packages.find(({ pkg }) => pkg.name === '@fractal/core').pkg;
  const versions = new Set(packages.map(({ pkg }) => pkg.version));
  if (versions.size !== 1) {
    throw new Error(`Los paquetes tienen versiones distintas: ${[...versions].join(', ')}. Usá scripts/set-version.js.`);
  }

  const stage = mkdtempSync(join(tmpdir(), 'fractal-pack-'));
  try {
    for (const { dir, pkg } of packages) {
      const dest = join(stage, 'vendor', dir.split(/[\\/]/).pop());
      mkdirSync(dest, { recursive: true });
      cpSync(join(dir, 'dist'), join(dest, 'dist'), { recursive: true });
      // package.json mínimo: sin scripts/devDependencies, y sin deps (las
      // resuelve el paquete raíz).
      const { scripts, devDependencies, dependencies, ...rest } = pkg;
      writeFileSync(join(dest, 'package.json'), `${JSON.stringify(rest, null, 2)}\n`);
    }
    writeFileSync(join(stage, 'package.json'), `${JSON.stringify(buildCliManifest(packages, core.version), null, 2)}\n`);
    writeFileSync(join(stage, 'README.md'), '# Fractal CLI\n\nVer https://github.com/dmaure/fractal\n');

    mkdirSync(outDir, { recursive: true });
    execFileSync('npm', ['pack', '--pack-destination', resolve(outDir), '--silent'], {
      cwd: stage,
      stdio: ['ignore', 'pipe', 'inherit'],
      shell: process.platform === 'win32',
    });
    return join(resolve(outDir), `fractal-cli-${core.version}.tgz`);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const i = process.argv.indexOf('--out');
  try {
    console.log(packRelease(i > 0 ? { outDir: process.argv[i + 1] } : {}));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
