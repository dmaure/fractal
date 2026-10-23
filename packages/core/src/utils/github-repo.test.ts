import { describe, it, expect, vi } from 'vitest';
import {
  createGitHubRepository,
  GitHubApiError,
  githubHttpsUrl,
  scanKnownHosts,
  setGitHubActionsSecrets,
} from './github-repo.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('githubHttpsUrl', () => {
  it('arma la URL HTTPS del remoto sin token', () => {
    expect(githubHttpsUrl('acme', 'demo')).toBe('https://github.com/acme/demo.git');
  });
});

describe('createGitHubRepository', () => {
  it('crea el repo bajo el usuario autenticado', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/user')) {
        return jsonResponse(200, { login: 'diego' });
      }
      return jsonResponse(201, {
        html_url: 'https://github.com/diego/demo',
        clone_url: 'https://github.com/diego/demo.git',
      });
    }) as unknown as typeof fetch;

    const repo = await createGitHubRepository(
      'token',
      { name: 'demo', visibility: 'private' },
      { fetchImpl }
    );

    expect(repo.owner).toBe('diego');
    expect(repo.cloneUrl).toBe('https://github.com/diego/demo.git');
    expect(fetchImpl).toHaveBeenCalled();
  });

  it('usa el endpoint de org cuando el owner no es el usuario', async () => {
    const paths: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      paths.push(url);
      if (url.endsWith('/user')) {
        return jsonResponse(200, { login: 'diego' });
      }
      return jsonResponse(201, {
        html_url: 'https://github.com/acme/demo',
        clone_url: 'https://github.com/acme/demo.git',
      });
    }) as unknown as typeof fetch;

    await createGitHubRepository(
      'token',
      { name: 'demo', owner: 'acme', visibility: 'private' },
      { fetchImpl }
    );

    expect(paths.some((p) => p.includes('/orgs/acme/repos'))).toBe(true);
  });

  it('falla claro si el repo ya existe', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/user')) {
        return jsonResponse(200, { login: 'diego' });
      }
      return jsonResponse(422, { message: 'already exists' });
    }) as unknown as typeof fetch;

    await expect(
      createGitHubRepository('token', { name: 'demo', visibility: 'private' }, { fetchImpl })
    ).rejects.toBeInstanceOf(GitHubApiError);
  });
});

describe('setGitHubActionsSecrets', () => {
  it('encripta y hace PUT de cada secret, incluyendo SSH_KNOWN_HOSTS', async () => {
    const puts: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('public-key')) {
        return jsonResponse(200, { key: 'AAAA', key_id: '42' });
      }
      if (init?.method === 'PUT') {
        puts.push(url);
        return new Response(null, { status: 204 });
      }
      return jsonResponse(500, {});
    }) as unknown as typeof fetch;

    const result = await setGitHubActionsSecrets(
      'token',
      { owner: 'diego', name: 'demo' },
      [
        { name: 'SSH_HOST', value: '192.0.2.10' },
        { name: 'SSH_KNOWN_HOSTS', value: '192.0.2.10 ssh-ed25519 AAAA' },
        { name: 'DB_PASSWORD', value: 'abc' },
      ],
      {
        fetchImpl,
        encryptSecret: async (plaintext) => `enc:${plaintext}`,
      }
    );

    expect(result.set).toEqual(['SSH_HOST', 'SSH_KNOWN_HOSTS', 'DB_PASSWORD']);
    expect(result.failed).toEqual([]);
    expect(puts).toHaveLength(3);
    expect(puts.some((p) => p.endsWith('/SSH_KNOWN_HOSTS'))).toBe(true);
  });
});

describe('scanKnownHosts', () => {
  it('devuelve las líneas no comentadas de ssh-keyscan', async () => {
    const exec = vi.fn(async () => ({
      stdout: '# comment\n192.0.2.10 ssh-ed25519 AAAA\n192.0.2.10 ssh-rsa BBBB\n',
      stderr: '',
    }));
    const line = await scanKnownHosts('192.0.2.10', exec as never);
    expect(line).toBe('192.0.2.10 ssh-ed25519 AAAA\n192.0.2.10 ssh-rsa BBBB');
  });

  it('devuelve undefined si ssh-keyscan falla', async () => {
    const exec = vi.fn(async () => {
      throw new Error('timeout');
    });
    expect(await scanKnownHosts('192.0.2.10', exec as never)).toBeUndefined();
  });
});
