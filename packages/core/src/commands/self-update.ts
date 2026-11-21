/**
 * `fractal self-update`: reinstala la última versión de Fractal desde el repo
 * privado de GitHub.
 *
 * - Instalado con `npm install -g` (tarball `fractal-cli-X.Y.Z.tgz` de un
 *   GitHub Release): baja el tarball del último release y lo reinstala en el
 *   mismo prefijo.
 * - Sin releases: clona `master`, compila y empaqueta (requiere git y pnpm).
 * - Corriendo desde un checkout (shim de `pnpm install`): no toca nada.
 *
 * El acceso al repo privado usa `GH_TOKEN`/`GITHUB_TOKEN`, `gh auth token` o,
 * para el clon, las credenciales git (SSH o HTTPS) del usuario.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readVersion } from '../version.js';

const REPO = process.env.FRACTAL_SELF_UPDATE_REPO ?? 'dmaure/fractal';

export type InstallKind = { kind: 'checkout' } | { kind: 'global'; prefix: string | null };

/** Distingue un checkout del monorepo de una instalación global. Pura. */
export function detectInstall(cliFile: string): InstallKind {
  const marker = `${sep}node_modules${sep}@fractal${sep}cli${sep}`;
  const i = cliFile.indexOf(marker);
  if (i === -1) return { kind: 'checkout' };
  // <prefix>/lib/node_modules/@fractal/cli/...  (Windows: <prefix>/node_modules/...)
  let dir = cliFile.slice(0, i + `${sep}node_modules`.length);
  dir = dirname(dir);
  if (basename(dir) === 'lib') dir = dirname(dir);
  return { kind: 'global', prefix: dir };
}

export const CHECKOUT_MESSAGE =
  'Este "fractal" corre desde un checkout del repo (shim de pnpm install); self-update no lo pisa.\n' +
  'Para actualizarlo: git pull && pnpm install && pnpm build';

export const ACCESS_MESSAGE =
  'No pude acceder al repo privado dmaure/fractal. Verificá que tu usuario tenga acceso y que haya credenciales:\n' +
  '  - SSH: una clave cargada en GitHub (ssh -T git@github.com), o\n' +
  '  - token: GH_TOKEN/GITHUB_TOKEN con permiso de lectura al repo (o `gh auth login`).';

function ghToken(): string | null {
  const env = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (env) return env;
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

interface Asset { name: string; url: string }

/** Último release con su tarball; `null` si no hay ninguno. */
async function latestRelease(token: string): Promise<{ tag: string; asset: Asset } | null> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (res.status === 404) return null; // sin releases (o sin acceso: se distingue después)
  if (res.status === 401 || res.status === 403) throw new Error(ACCESS_MESSAGE);
  if (!res.ok) throw new Error(`GitHub respondió ${res.status} al consultar los releases.`);
  const rel = (await res.json()) as { tag_name: string; assets: Asset[] };
  const asset = rel.assets.find((a) => /^fractal-cli-.*\.tgz$/.test(a.name));
  if (!asset) throw new Error(`El release ${rel.tag_name} no tiene el tarball fractal-cli-*.tgz adjunto.`);
  return { tag: rel.tag_name, asset };
}

async function download(token: string, asset: Asset, dest: string): Promise<void> {
  const res = await fetch(asset.url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/octet-stream' } });
  if (!res.ok) throw new Error(ACCESS_MESSAGE);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

function run(cmd: string, args: string[], cwd?: string, env?: NodeJS.ProcessEnv): void {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env }, shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(`Falló: ${cmd} ${args.join(' ')}`);
}

/** Sin releases: clona master, compila y empaqueta. Devuelve el tarball. */
function buildFromMaster(work: string): string {
  const url = process.env.FRACTAL_SELF_UPDATE_REPO_URL ?? `git@github.com:${REPO}.git`;
  const dir = join(work, 'src');
  const clone = spawnSync('git', ['clone', '--depth', '1', url, dir], { stdio: 'inherit' });
  if (clone.status !== 0) throw new Error(ACCESS_MESSAGE);
  const env = { CI: '1', FRACTAL_SKIP_CLI_INSTALL: '1' }; // sin shim ni prompts
  run('pnpm', ['install', '--frozen-lockfile'], dir, env);
  run('pnpm', ['build'], dir, env);
  const out = execFileSync('node', ['scripts/pack-release.js', '--out', join(work, 'out')], { cwd: dir, encoding: 'utf-8' });
  return out.trim().split('\n').pop() as string;
}

export async function selfUpdateCommand(): Promise<number> {
  const cliFile = realpathSync(fileURLToPath(new URL('../cli.js', import.meta.url)));
  const install = detectInstall(cliFile);
  if (install.kind === 'checkout') {
    console.log(CHECKOUT_MESSAGE);
    return 0;
  }

  console.log(`Versión instalada: ${readVersion()}`);
  const work = mkdtempSync(join(tmpdir(), 'fractal-update-'));
  try {
    let tarball: string;
    const token = ghToken();
    const release = token ? await latestRelease(token) : null;
    if (token && release) {
      console.log(`Último release: ${release.tag}`);
      tarball = join(work, release.asset.name);
      await download(token, release.asset, tarball);
    } else {
      console.log('No hay releases accesibles: instalo master (clona, compila y empaqueta).');
      tarball = buildFromMaster(work);
    }
    const args = ['install', '-g', tarball];
    if (install.prefix) args.push('--prefix', install.prefix);
    run('npm', args);
    console.log('✅ Fractal actualizado. Verificá con: fractal --version');
    return 0;
  } catch (error) {
    console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
