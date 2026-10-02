import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import {
  SHIM_MARKER,
  installShim,
  resolveBinDir,
  shimContent,
  shimFileName,
  uninstallShim,
} from './install-cli.js';

const isWindows = process.platform === 'win32';

describe('resolveBinDir', () => {
  const home = '/home/dev';
  const execPath = '/opt/node/bin/node';

  it('respeta FRACTAL_BIN_DIR', () => {
    expect(resolveBinDir({ env: { FRACTAL_BIN_DIR: '/custom/bin' }, execPath, home })).toBe('/custom/bin');
  });

  it('prefiere el bin/ de Node si está en el PATH y es escribible', () => {
    const env = { PATH: ['/usr/bin', '/opt/node/bin', '/home/dev/.local/bin'].join(delimiter) };
    expect(resolveBinDir({ env, execPath, home, canWrite: () => true })).toBe('/opt/node/bin');
  });

  it('cae a ~/.local/bin si el bin/ de Node no es escribible', () => {
    const env = { PATH: ['/opt/node/bin', '~/.local/bin'].join(delimiter) };
    const canWrite = (dir) => dir !== '/opt/node/bin';
    expect(resolveBinDir({ env, execPath, home, canWrite })).toBe('/home/dev/.local/bin');
  });

  it('devuelve null si ningún candidato está en el PATH', () => {
    const env = { PATH: '/usr/bin' };
    expect(resolveBinDir({ env, execPath, home, canWrite: () => true })).toBeNull();
  });
});

describe('shimContent', () => {
  it('genera un shim sh que delega en cli.js con el node dado', () => {
    const content = shimContent({ repoRoot: '/repo/fractal', nodePath: '/opt/node/bin/node', platform: 'darwin' });
    expect(content.startsWith('#!/bin/sh\n')).toBe(true);
    expect(content).toContain(SHIM_MARKER);
    expect(content).toContain("CLI='/repo/fractal/packages/core/dist/cli.js'");
    expect(content).toContain(`exec '/opt/node/bin/node' "$CLI" "$@"`);
  });

  it('escapa rutas con espacios y comillas simples', () => {
    const content = shimContent({ repoRoot: "/a b/it's", nodePath: '/n/node', platform: 'linux' });
    expect(content).toContain(`CLI='/a b/it'\\''s/packages/core/dist/cli.js'`);
  });

  it('genera un .cmd en Windows', () => {
    expect(shimFileName('win32')).toBe('fractal.cmd');
    const content = shimContent({ repoRoot: 'C:\\repo', nodePath: 'C:\\node.exe', platform: 'win32' });
    expect(content).toContain('@echo off');
    expect(content).toContain(SHIM_MARKER);
  });
});

describe('installShim / uninstallShim', () => {
  let binDir;

  beforeEach(async () => {
    binDir = await mkdtemp(join(tmpdir(), 'fractal-bin-'));
  });

  afterEach(async () => {
    await rm(binDir, { recursive: true, force: true });
  });

  it('instala un shim ejecutable y lo reinstala sin error', async () => {
    const shimPath = installShim({ binDir, repoRoot: '/repo', nodePath: '/n/node' });
    expect(installShim({ binDir, repoRoot: '/repo2', nodePath: '/n/node' })).toBe(shimPath);
    expect(await readFile(shimPath, 'utf-8')).toContain('/repo2/');
    if (!isWindows) {
      expect((await stat(shimPath)).mode & 0o111).not.toBe(0);
    }
  });

  it('no pisa un "fractal" ajeno', async () => {
    const foreign = join(binDir, shimFileName());
    await writeFile(foreign, '#!/bin/sh\necho otro fractal\n');
    expect(() => installShim({ binDir, repoRoot: '/repo', nodePath: '/n/node' })).toThrow(/no fue instalado por este repo/);
    expect(uninstallShim({ binDir })).toBe(false);
    expect(existsSync(foreign)).toBe(true);
  });

  it('desinstala solo el shim propio', () => {
    installShim({ binDir, repoRoot: '/repo', nodePath: '/n/node' });
    expect(uninstallShim({ binDir })).toBe(true);
    expect(existsSync(join(binDir, shimFileName()))).toBe(false);
  });

  it.skipIf(isWindows)('el shim ejecuta cli.js con los argumentos', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'fractal-repo-'));
    try {
      const cliDir = join(repoRoot, 'packages', 'core', 'dist');
      await mkdir(cliDir, { recursive: true });
      await writeFile(join(cliDir, 'cli.js'), 'console.log(JSON.stringify(process.argv.slice(2)));\n');

      const shimPath = installShim({ binDir, repoRoot, nodePath: process.execPath });
      const out = execFileSync(shimPath, ['status', '--check'], { encoding: 'utf-8' });
      expect(JSON.parse(out)).toEqual(['status', '--check']);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it.skipIf(isWindows)('el shim avisa si falta el build', () => {
    const shimPath = installShim({ binDir, repoRoot: '/no/existe', nodePath: process.execPath });
    expect(() => execFileSync(shimPath, [], { stdio: 'pipe' })).toThrow(/falta el build/);
  });
});
