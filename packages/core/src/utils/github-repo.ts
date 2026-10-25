import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

const GITHUB_API = 'https://api.github.com';

export interface GitHubApi {
  fetchImpl: typeof fetch;
  encryptSecret?: (plaintext: string, publicKey: string) => Promise<string>;
}

export interface CreatedGitHubRepo {
  owner: string;
  name: string;
  htmlUrl: string;
  cloneUrl: string;
}

export interface GitHubSecretToSet {
  name: string;
  value: string;
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: string
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

async function githubRequest(
  token: string,
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch
): Promise<Response> {
  const response = await fetchImpl(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'fractal-cli',
      ...(init.headers ?? {}),
    },
  });
  return response;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

export async function getAuthenticatedUser(
  token: string,
  api: Pick<GitHubApi, 'fetchImpl'> = { fetchImpl: fetch }
): Promise<{ login: string }> {
  const response = await githubRequest(token, '/user', { method: 'GET' }, api.fetchImpl);
  const body = await readJson(response);
  if (!response.ok) {
    throw new GitHubApiError(
      `No se pudo autenticar el token de GitHub (HTTP ${response.status})`,
      response.status,
      JSON.stringify(body)
    );
  }
  const login = typeof body.login === 'string' ? body.login : '';
  if (!login) {
    throw new GitHubApiError('El token de GitHub no devolvió un usuario');
  }
  return { login };
}

export async function createGitHubRepository(
  token: string,
  input: {
    name: string;
    owner?: string;
    visibility: 'private' | 'public';
    description?: string;
  },
  api: Pick<GitHubApi, 'fetchImpl'> = { fetchImpl: fetch }
): Promise<CreatedGitHubRepo> {
  const user = await getAuthenticatedUser(token, api);
  const owner = input.owner || user.login;
  const isOrg = owner !== user.login;
  const path = isOrg ? `/orgs/${encodeURIComponent(owner)}/repos` : '/user/repos';

  const response = await githubRequest(
    token,
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: input.name,
        private: input.visibility !== 'public',
        auto_init: false,
        description: input.description ?? 'Generado con Fractal',
      }),
    },
    api.fetchImpl
  );
  const body = await readJson(response);

  if (response.status === 422) {
    throw new GitHubApiError(
      `El repositorio ${owner}/${input.name} ya existe o el nombre es inválido`,
      422,
      JSON.stringify(body)
    );
  }
  if (!response.ok) {
    throw new GitHubApiError(
      `No se pudo crear el repositorio ${owner}/${input.name} (HTTP ${response.status})`,
      response.status,
      JSON.stringify(body)
    );
  }

  return {
    owner,
    name: input.name,
    htmlUrl: typeof body.html_url === 'string' ? body.html_url : `https://github.com/${owner}/${input.name}`,
    cloneUrl: typeof body.clone_url === 'string' ? body.clone_url : `https://github.com/${owner}/${input.name}.git`,
  };
}

async function defaultEncryptSecret(plaintext: string, publicKey: string): Promise<string> {
  const sodium = (await import('libsodium-wrappers')).default;
  await sodium.ready;
  const keyBytes = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL);
  const messageBytes = sodium.from_string(plaintext);
  const encrypted = sodium.crypto_box_seal(messageBytes, keyBytes);
  return sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);
}

export async function setGitHubActionsSecrets(
  token: string,
  repo: { owner: string; name: string },
  secrets: GitHubSecretToSet[],
  api: GitHubApi = { fetchImpl: fetch }
): Promise<{ set: string[]; failed: Array<{ name: string; error: string }> }> {
  const encrypt = api.encryptSecret ?? defaultEncryptSecret;
  const keyResponse = await githubRequest(
    token,
    `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/actions/secrets/public-key`,
    { method: 'GET' },
    api.fetchImpl
  );
  const keyBody = await readJson(keyResponse);
  if (!keyResponse.ok) {
    throw new GitHubApiError(
      `No se pudo leer la clave pública de secrets de ${repo.owner}/${repo.name} (HTTP ${keyResponse.status})`,
      keyResponse.status,
      JSON.stringify(keyBody)
    );
  }
  const publicKey = typeof keyBody.key === 'string' ? keyBody.key : '';
  const keyId = typeof keyBody.key_id === 'string' ? keyBody.key_id : '';
  if (!publicKey || !keyId) {
    throw new GitHubApiError('La clave pública de secrets de GitHub vino vacía');
  }

  const set: string[] = [];
  const failed: Array<{ name: string; error: string }> = [];

  for (const secret of secrets) {
    try {
      const encrypted_value = await encrypt(secret.value, publicKey);
      const put = await githubRequest(
        token,
        `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/actions/secrets/${encodeURIComponent(secret.name)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ encrypted_value, key_id: keyId }),
        },
        api.fetchImpl
      );
      if (!put.ok && put.status !== 204) {
        const putBody = await readJson(put);
        failed.push({
          name: secret.name,
          error: `HTTP ${put.status}: ${JSON.stringify(putBody)}`,
        });
        continue;
      }
      set.push(secret.name);
    } catch (error) {
      failed.push({
        name: secret.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { set, failed };
}

export async function scanKnownHosts(
  host: string,
  exec: typeof execFileAsync = execFileAsync
): Promise<string | undefined> {
  try {
    const { stdout } = await exec('ssh-keyscan', ['-t', 'ed25519,rsa,ecdsa', '-T', '5', host], {
      timeout: 15_000,
    });
    const lines = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    return lines.length > 0 ? lines.join('\n') : undefined;
  } catch {
    return undefined;
  }
}

export function expandHomePath(filePath: string): string {
  if (filePath.startsWith('~')) {
    return filePath.replace('~', homedir());
  }
  return filePath;
}

export async function readPrivateKeyForSecret(
  keyPath: string
): Promise<{ value?: string; warning?: string }> {
  const expanded = expandHomePath(keyPath);
  try {
    const value = await readFile(expanded, 'utf-8');
    const looksEncrypted =
      value.includes('ENCRYPTED') || value.includes('Proc-Type: 4,ENCRYPTED');
    if (looksEncrypted) {
      return {
        warning:
          'La clave privada parece tener passphrase. El CLI no la descifra (gap documentado); no se setea SSH_PRIVATE_KEY.',
      };
    }
    return { value };
  } catch (error) {
    return {
      warning: `No se pudo leer la clave privada en ${expanded}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

const SAFE_GIT_BRANCH = /^[A-Za-z0-9._/-]+$/;

export type ExecFileSyncFn = typeof execFileSync;

/**
 * Redacta el token si apareciera en un error de git (stderr, spawnargs).
 * El push no lo pone en argv; esto es red de seguridad para logs.
 */
export function redactGitHubToken(text: string, token: string): string {
  if (!token) {
    return text;
  }
  return text.split(token).join('***');
}

function writeGitAskpassScript(dir: string): string {
  const askpassPath = join(dir, 'askpass.cjs');
  writeFileSync(
    askpassPath,
    [
      `#!${process.execPath}`,
      `'use strict';`,
      `const fs = require('fs');`,
      `const prompt = process.argv.slice(2).join(' ');`,
      `if (/username/i.test(prompt)) {`,
      `  process.stdout.write('x-access-token');`,
      `} else {`,
      `  const encoded = fs.readFileSync(process.env.FRACTAL_GIT_ASKPASS_TOKEN_FILE, 'utf8');`,
      `  process.stdout.write(Buffer.from(encoded.trim(), 'base64').toString('utf8'));`,
      `}`,
      ``,
    ].join('\n'),
    { mode: 0o700 }
  );
  return askpassPath;
}

/**
 * Pasa el token por archivo base64 + GIT_ASKPASS (mismo criterio que la
 * DB password en runtime-manager: el secreto no viaja en argv).
 */
function withGitAskpass<T>(token: string, fn: (env: NodeJS.ProcessEnv) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'fractal-git-askpass-'));
  const tokenFile = join(dir, 'token.b64');
  writeFileSync(tokenFile, Buffer.from(token, 'utf8').toString('base64'), { mode: 0o600 });
  const askpassPath = writeGitAskpassScript(dir);
  try {
    return fn({
      ...process.env,
      GIT_ASKPASS: askpassPath,
      GIT_TERMINAL_PROMPT: '0',
      FRACTAL_GIT_ASKPASS_TOKEN_FILE: tokenFile,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runGit(
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
  token: string,
  execFile: ExecFileSyncFn
): void {
  try {
    execFile('git', args, {
      cwd: options.cwd,
      stdio: 'pipe',
      env: options.env,
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    throw new Error(redactGitHubToken(raw, token));
  }
}

/**
 * Agrega origin sin embeber el token y pushea con GIT_ASKPASS.
 * El remote queda como HTTPS limpia (el token no se persiste ni va en argv).
 */
export function pushRepositoryToGitHub(
  repoDir: string,
  cloneUrl: string,
  token: string,
  branch = 'main',
  execFile: ExecFileSyncFn = execFileSync
): void {
  if (!SAFE_GIT_BRANCH.test(branch)) {
    throw new Error(`Rama inválida: ${branch}`);
  }

  runGit(['branch', '-M', branch], { cwd: repoDir }, token, execFile);

  try {
    runGit(['remote', 'remove', 'origin'], { cwd: repoDir }, token, execFile);
  } catch {
    // no había origin
  }
  runGit(['remote', 'add', 'origin', cloneUrl], { cwd: repoDir }, token, execFile);

  withGitAskpass(token, (env) => {
    runGit(
      ['-c', 'credential.helper=', 'push', '-u', 'origin', `HEAD:${branch}`],
      { cwd: repoDir, env },
      token,
      execFile
    );
  });
}

export function githubHttpsUrl(owner: string, name: string): string {
  return `https://github.com/${owner}/${name}.git`;
}
