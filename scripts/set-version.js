#!/usr/bin/env node
/**
 * Pone la misma versión en el package.json raíz y en todos los paquetes
 * (los paquetes de Fractal se versionan juntos).
 *
 *   node scripts/set-version.js 0.1.0
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function packageJsonPaths(root = ROOT) {
  const pkgs = readdirSync(join(root, 'packages'))
    .map((d) => join(root, 'packages', d, 'package.json'))
    .filter(existsSync);
  return [join(root, 'package.json'), ...pkgs];
}

export function setVersion(version, root = ROOT) {
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Versión inválida: "${version}" (se espera X.Y.Z)`);
  }
  for (const path of packageJsonPaths(root)) {
    const pkg = JSON.parse(readFileSync(path, 'utf-8'));
    pkg.version = version;
    writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    setVersion(process.argv[2] ?? '');
    console.log(`Versión ${process.argv[2]} aplicada a todos los paquetes.`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
