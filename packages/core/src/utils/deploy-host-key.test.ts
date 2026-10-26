import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  DeployHostKeyPinError,
  PASSWORD_UNVERIFIED_HOST_ERROR,
  PIN_UNKNOWN_HOST_ERROR,
  resolveHostKeyPin,
  resolveNonInteractiveHostKeyPolicy,
  SSH_KNOWN_HOSTS_ENV,
} from './deploy-host-key.js';

const KEY_LINE =
  '203.0.113.10 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPElQLpDeJKqsIW+PZJXtJbFu26IBNR6ClQBg2ZU9wA3';

const unknownInfo = {
  host: '203.0.113.10',
  port: 22,
  keyType: 'ssh-ed25519' as const,
  fingerprint: 'SHA256:test',
};

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

function writePinFile(contents = KEY_LINE): string {
  tempDir = join(tmpdir(), `fractal-pin-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(tempDir, { recursive: true });
  const path = join(tempDir, 'known_hosts');
  writeFileSync(path, `${contents}\n`, { mode: 0o600 });
  return path;
}

describe('resolveHostKeyPin', () => {
  it('usa el flag como ruta y falla si el archivo no existe', () => {
    const path = writePinFile();
    expect(resolveHostKeyPin(path)?.path).toBe(path);

    expect(() => resolveHostKeyPin('/no/existe/known_hosts')).toThrow(
      DeployHostKeyPinError
    );
  });

  it('acepta FRACTAL_DEPLOY_SSH_KNOWN_HOSTS como ruta o como contenido', () => {
    const path = writePinFile();
    expect(resolveHostKeyPin(undefined, path)?.path).toBe(path);

    const fromContent = resolveHostKeyPin(undefined, KEY_LINE);
    expect(fromContent?.path).toBeDefined();
    expect(fromContent?.path).not.toBe(path);

    expect(() => resolveHostKeyPin(undefined, 'no-es-ni-ruta-ni-linea')).toThrow(
      new RegExp(SSH_KNOWN_HOSTS_ENV)
    );
  });

  it('el flag gana sobre el env', () => {
    const path = writePinFile();
    expect(resolveHostKeyPin(path, KEY_LINE)?.path).toBe(path);
  });
});

describe('resolveNonInteractiveHostKeyPolicy', () => {
  it('con pin rechaza un host desconocido (no acepta a ciegas)', async () => {
    const path = writePinFile();
    const policy = resolveNonInteractiveHostKeyPolicy({
      authMethod: 'key',
      pinFromFlag: path,
    });

    expect(policy.pinConfigured).toBe(true);
    expect(policy.explicitTofu).toBe(false);
    expect(policy.knownHostsPath).toBe(path);
    expect(await policy.onUnknownHost(unknownInfo)).toBe(false);
    expect(policy.unknownHostRejectError).toBe(PIN_UNKNOWN_HOST_ERROR);
  });

  it('sin pin + password rechaza el host desconocido y no manda la contraseña', async () => {
    const policy = resolveNonInteractiveHostKeyPolicy({
      authMethod: 'password',
    });

    expect(policy.pinConfigured).toBe(false);
    expect(policy.explicitTofu).toBe(false);
    expect(await policy.onUnknownHost(unknownInfo)).toBe(false);
    expect(policy.unknownHostRejectError).toBe(PASSWORD_UNVERIFIED_HOST_ERROR);
    expect(policy.unknownHostRejectError).toMatch(/contraseña no se envió/i);
  });

  it('sin pin + key deja TOFU explícito', async () => {
    const policy = resolveNonInteractiveHostKeyPolicy({
      authMethod: 'key',
    });

    expect(policy.pinConfigured).toBe(false);
    expect(policy.explicitTofu).toBe(true);
    expect(await policy.onUnknownHost(unknownInfo)).toBe(true);
    expect(policy.unknownHostRejectError).toBeUndefined();
  });
});
