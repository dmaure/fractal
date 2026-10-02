#!/usr/bin/env node
/**
 * Instala el comando `fractal` en el PATH del usuario a partir de este repo.
 *
 * Se ejecuta en el `postinstall` del monorepo, de modo que clonar el repo y
 * correr `pnpm install` deja `fractal` funcionando en la terminal:
 *
 *   1. Compila el monorepo (`pnpm -r build`) para que exista
 *      `packages/core/dist/cli.js`.
 *   2. Escribe un shim `fractal` que ejecuta ese `cli.js` con el `node` del
 *      PATH (sobrevive a upgrades de Node), en el primer directorio escribible
 *      que ya esté en el PATH:
 *        - `FRACTAL_BIN_DIR` (override explícito),
 *        - el `bin/` del Node actual (nvm, Homebrew, instalador oficial…),
 *        - `~/.local/bin`.
 *
 * El shim apunta al checkout (no copia nada): después de cambiar código basta
 * con `pnpm build`. No pisa un `fractal` ajeno; solo reemplaza shims propios
 * (marcados con `SHIM_MARKER`).
 *
 * Uso:
 *   node scripts/install-cli.js               # build + instala el shim
 *   node scripts/install-cli.js --no-build    # solo instala el shim
 *   node scripts/install-cli.js --uninstall   # quita el shim
 *
 * En CI (`CI` definido) o con `FRACTAL_SKIP_CLI_INSTALL=1` no hace nada. Nunca
 * hace fallar `pnpm install`: ante un error avisa y sale con código 0.
 *
 * Sin dependencias externas — solo Node stdlib.
 */

import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SHIM_MARKER = 'fractal-cli-shim';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI_RELATIVE_PATH = join('packages', 'core', 'dist', 'cli.js');

/** Nombre del shim según la plataforma. */
export function shimFileName(platform = process.platform) {
  return platform === 'win32' ? 'fractal.cmd' : 'fractal';
}

/** Comillas simples seguras para sh (soporta rutas con espacios y comillas). */
function shQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Contenido del shim que delega en `cli.js` del checkout. */
export function shimContent({ repoRoot, nodePath, platform = process.platform }) {
  const cliPath = join(repoRoot, CLI_RELATIVE_PATH);

  if (platform === 'win32') {
    return [
      '@echo off',
      `rem ${SHIM_MARKER}: generado por scripts/install-cli.js (${repoRoot})`,
      `if not exist "${cliPath}" (`,
      `  echo fractal: falta el build en ${repoRoot}. Corre: pnpm -C "${repoRoot}" build 1>&2`,
      '  exit /b 1',
      ')',
      `"${nodePath}" "${cliPath}" %*`,
      '',
    ].join('\r\n');
  }

  return [
    '#!/bin/sh',
    `# ${SHIM_MARKER}: generado por scripts/install-cli.js (${repoRoot})`,
    `CLI=${shQuote(cliPath)}`,
    'if [ ! -f "$CLI" ]; then',
    `  echo "fractal: falta el build en ${repoRoot.replace(/"/g, '\\"')}. Corré: pnpm -C ${shQuote(repoRoot)} build" >&2`,
    '  exit 1',
    'fi',
    `exec ${shQuote(nodePath)} "$CLI" "$@"`,
    '',
  ].join('\n');
}

function isWritableDir(dir) {
  try {
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Elige el directorio donde instalar el shim. Devuelve `null` si no hay
 * ninguno escribible que esté en el PATH.
 */
export function resolveBinDir({
  env = process.env,
  execPath = process.execPath,
  home = homedir(),
  canWrite = isWritableDir,
} = {}) {
  if (env.FRACTAL_BIN_DIR) {
    return env.FRACTAL_BIN_DIR;
  }

  const pathDirs = (env.PATH ?? '')
    .split(delimiter)
    .filter(Boolean)
    .map((dir) => resolve(dir.replace(/^~(?=$|[\\/])/, home)));

  const candidates = [dirname(execPath), join(home, '.local', 'bin')];

  return candidates.find((dir) => pathDirs.includes(resolve(dir)) && canWrite(dir)) ?? null;
}

/** `true` si en `path` hay un shim generado por este script (o nada). */
function isOwnShimOrMissing(path) {
  if (!existsSync(path)) return true;
  return readFileSync(path, 'utf-8').includes(SHIM_MARKER);
}

/**
 * Escribe el shim en `binDir`. Lanza si ya existe un `fractal` ajeno.
 * Devuelve la ruta del shim.
 */
export function installShim({ binDir, repoRoot = REPO_ROOT, nodePath = 'node', platform = process.platform }) {
  const shimPath = join(binDir, shimFileName(platform));

  if (!isOwnShimOrMissing(shimPath)) {
    throw new Error(
      `Ya existe un comando "fractal" en ${shimPath} que no fue instalado por este repo. ` +
        'Quitalo o definí FRACTAL_BIN_DIR con otro directorio del PATH.'
    );
  }

  mkdirSync(binDir, { recursive: true });
  writeFileSync(shimPath, shimContent({ repoRoot, nodePath, platform }), { mode: 0o755 });
  return shimPath;
}

/** Quita el shim de `binDir` si es propio. Devuelve `true` si borró algo. */
export function uninstallShim({ binDir, platform = process.platform }) {
  const shimPath = join(binDir, shimFileName(platform));
  if (!existsSync(shimPath) || !isOwnShimOrMissing(shimPath)) return false;
  rmSync(shimPath);
  return true;
}

function warn(message) {
  console.warn(`\n⚠️  fractal CLI: ${message}\n`);
}

function main(argv) {
  if (process.env.CI || process.env.FRACTAL_SKIP_CLI_INSTALL === '1') {
    return;
  }

  const binDir = resolveBinDir();
  const manual = `node ${join(REPO_ROOT, CLI_RELATIVE_PATH)} <comando>`;

  if (argv.includes('--uninstall')) {
    if (binDir && uninstallShim({ binDir })) {
      console.log(`✅ fractal CLI: comando quitado de ${binDir}`);
    } else {
      console.log('fractal CLI: no había un comando "fractal" instalado por este repo.');
    }
    return;
  }

  if (!argv.includes('--no-build')) {
    const build = spawnSync('pnpm', ['-r', 'build'], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (build.status !== 0) {
      warn(`el build falló; el comando "fractal" no se instaló. Corregí el error y corré "pnpm cli:install".`);
      return;
    }
  }

  if (!binDir) {
    warn(
      'no encontré un directorio escribible en el PATH (probé el bin/ de Node y ~/.local/bin).\n' +
        '   Agregá ~/.local/bin al PATH o definí FRACTAL_BIN_DIR y corré "pnpm cli:install".\n' +
        `   Mientras tanto: ${manual}`
    );
    return;
  }

  try {
    const shimPath = installShim({ binDir });
    console.log(`\n✅ fractal CLI instalado: ${shimPath}\n   Probalo con: fractal --help\n`);
  } catch (error) {
    warn(`${error instanceof Error ? error.message : String(error)}\n   Mientras tanto: ${manual}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2));
}
