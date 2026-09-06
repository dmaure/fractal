import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseKnownHosts,
  parsePresentedKey,
  decideHostKey,
  hostMatchesPattern,
  sha256Fingerprint,
  formatKnownHostsLine,
  verifyHostKeyAgainstKnownHosts,
} from './host-key.js';

const KEY_A =
  'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPElQLpDeJKqsIW+PZJXtJbFu26IBNR6ClQBg2ZU9wA3';
const KEY_B =
  'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEGSP7OoZS0nUxibl+mnBiQAlURqnzJxtmRJofS5ZFIC';
const KEY_A_B64 =
  'AAAAC3NzaC1lZDI1NTE5AAAAIPElQLpDeJKqsIW+PZJXtJbFu26IBNR6ClQBg2ZU9wA3';
const KEY_B_B64 =
  'AAAAC3NzaC1lZDI1NTE5AAAAIEGSP7OoZS0nUxibl+mnBiQAlURqnzJxtmRJofS5ZFIC';
const KEY_A_FINGERPRINT = 'SHA256:gZ7anTmGEBA09pySSmVoubDeE+2oQlXxOTHXGJj0XFM';
const HASHED_192_0_2_10 =
  '|1|ABEiM0RVZneImaq7zN3u/wARIjM=|gv7h9pCar4ugFL38vSNFRa9WZk8=';

let testDir: string;

function presentedA() {
  return parsePresentedKey(KEY_A);
}

function presentedB() {
  return parsePresentedKey(KEY_B);
}

beforeEach(() => {
  testDir = join(
    tmpdir(),
    `fractal-known-hosts-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

describe('parsePresentedKey', () => {
  it('debe parsear una línea OpenSSH y el blob crudo que envía ssh2', () => {
    const fromLine = parsePresentedKey(KEY_A);
    expect(fromLine.type).toBe('ssh-ed25519');
    expect(fromLine.publicKeyBase64).toBe(KEY_A_B64);

    const blob = Buffer.from(fromLine.publicKeyBase64, 'base64');
    expect(parsePresentedKey(blob)).toEqual(fromLine);
  });
});

describe('sha256Fingerprint', () => {
  it('debe coincidir con el formato SHA256 de OpenSSH', () => {
    expect(sha256Fingerprint(KEY_A_B64)).toBe(KEY_A_FINGERPRINT);
  });
});

describe('parseKnownHosts', () => {
  it('debe ignorar comentarios y líneas vacías', () => {
    const entries = parseKnownHosts(
      `# comentario\n\n192.0.2.10 ${KEY_A}\n`
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].patterns).toEqual(['192.0.2.10']);
    expect(entries[0].keyType).toBe('ssh-ed25519');
    expect(entries[0].keyBase64).toBe(KEY_A_B64);
  });

  it('debe parsear hosts múltiples y marcadores @revoked', () => {
    const entries = parseKnownHosts(
      `host.example,192.0.2.10 ${KEY_A}\n` +
        `@revoked 192.0.2.11 ${KEY_B}\n`
    );

    expect(entries[0].patterns).toEqual(['host.example', '192.0.2.10']);
    expect(entries[1].marker).toBe('revoked');
    expect(entries[1].keyBase64).toBe(KEY_B_B64);
  });
});

describe('hostMatchesPattern', () => {
  it('debe coincidir host en puerto 22 y [host]:puerto en otros puertos', () => {
    expect(hostMatchesPattern('192.0.2.10', 22, '192.0.2.10')).toBe(true);
    expect(hostMatchesPattern('192.0.2.10', 22, '[192.0.2.10]:22')).toBe(true);
    expect(hostMatchesPattern('192.0.2.10', 2222, '[192.0.2.10]:2222')).toBe(
      true
    );
    expect(hostMatchesPattern('192.0.2.10', 2222, '192.0.2.10')).toBe(false);
  });

  it('debe coincidir hostnames hasheados de OpenSSH', () => {
    expect(hostMatchesPattern('192.0.2.10', 22, HASHED_192_0_2_10)).toBe(true);
    expect(hostMatchesPattern('192.0.2.11', 22, HASHED_192_0_2_10)).toBe(false);
  });
});

describe('decideHostKey', () => {
  it('debe aceptar una clave que coincide en known_hosts', () => {
    const entries = parseKnownHosts(`192.0.2.10 ${KEY_A}\n`);
    expect(decideHostKey(entries, '192.0.2.10', 22, presentedA())).toEqual({
      status: 'match',
    });
  });

  it('debe rechazar un cambio de clave del mismo tipo (MITM)', () => {
    const entries = parseKnownHosts(`192.0.2.10 ${KEY_A}\n`);
    const decision = decideHostKey(entries, '192.0.2.10', 22, presentedB());

    expect(decision.status).toBe('mismatch');
    if (decision.status === 'mismatch') {
      expect(decision.knownFingerprint).toBe(KEY_A_FINGERPRINT);
      expect(decision.presentedFingerprint).toBe(
        sha256Fingerprint(KEY_B_B64)
      );
    }
  });

  it('debe tratar como desconocido un host sin entrada', () => {
    const decision = decideHostKey([], '192.0.2.10', 22, presentedA());
    expect(decision).toMatchObject({
      status: 'unknown',
      keyType: 'ssh-ed25519',
      fingerprint: KEY_A_FINGERPRINT,
    });
  });

  it('debe rechazar una clave revocada aunque coincida', () => {
    const entries = parseKnownHosts(`@revoked 192.0.2.10 ${KEY_A}\n`);
    const decision = decideHostKey(entries, '192.0.2.10', 22, presentedA());
    expect(decision.status).toBe('revoked');
  });

  it('no debe tratar un tipo de clave nuevo como mismatch', () => {
    const entries = parseKnownHosts(
      `192.0.2.10 ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC0placeholder\n`
    );
    const decision = decideHostKey(entries, '192.0.2.10', 22, presentedA());
    expect(decision.status).toBe('unknown');
  });
});

describe('formatKnownHostsLine', () => {
  it('debe usar [host]:puerto cuando el puerto no es 22', () => {
    expect(formatKnownHostsLine('192.0.2.10', 2222, presentedA())).toBe(
      `[192.0.2.10]:2222 ssh-ed25519 ${KEY_A_B64}`
    );
  });
});

describe('verifyHostKeyAgainstKnownHosts', () => {
  it('debe aceptar y no reescribir una clave ya conocida', async () => {
    const knownHostsPath = join(testDir, 'known_hosts');
    writeFileSync(knownHostsPath, `192.0.2.10 ${KEY_A}\n`);

    const result = await verifyHostKeyAgainstKnownHosts({
      key: Buffer.from(KEY_A),
      host: '192.0.2.10',
      port: 22,
      knownHostsPath,
    });

    expect(result.accepted).toBe(true);
    expect(readFileSync(knownHostsPath, 'utf8')).toBe(`192.0.2.10 ${KEY_A}\n`);
  });

  it('debe rechazar un host desconocido si no hay callback TOFU', async () => {
    const result = await verifyHostKeyAgainstKnownHosts({
      key: Buffer.from(KEY_A),
      host: '192.0.2.10',
      port: 22,
      knownHostsPath: join(testDir, 'known_hosts'),
    });

    expect(result.accepted).toBe(false);
    expect(result.error).toMatch(/no está en/);
    expect(result.error).toMatch(/no hay confirmación/);
  });

  it('debe persistir la clave cuando TOFU acepta un host desconocido', async () => {
    const knownHostsPath = join(testDir, '.ssh', 'known_hosts');
    let prompted = false;

    const result = await verifyHostKeyAgainstKnownHosts({
      key: Buffer.from(KEY_A),
      host: '192.0.2.10',
      port: 22,
      knownHostsPath,
      onUnknownHost: async (info) => {
        prompted = true;
        expect(info.host).toBe('192.0.2.10');
        expect(info.fingerprint).toBe(KEY_A_FINGERPRINT);
        return true;
      },
    });

    expect(prompted).toBe(true);
    expect(result.accepted).toBe(true);
    expect(readFileSync(knownHostsPath, 'utf8')).toContain(
      `192.0.2.10 ssh-ed25519 ${KEY_A_B64}`
    );
  });

  it('no debe persistir ni aceptar si el usuario rechaza TOFU', async () => {
    const knownHostsPath = join(testDir, 'known_hosts');

    const result = await verifyHostKeyAgainstKnownHosts({
      key: Buffer.from(KEY_A),
      host: '192.0.2.10',
      port: 22,
      knownHostsPath,
      onUnknownHost: async () => false,
    });

    expect(result.accepted).toBe(false);
    expect(existsSync(knownHostsPath)).toBe(false);
  });

  it('debe rechazar mismatch sin llamar a onUnknownHost', async () => {
    const knownHostsPath = join(testDir, 'known_hosts');
    writeFileSync(knownHostsPath, `192.0.2.10 ${KEY_A}\n`);

    const result = await verifyHostKeyAgainstKnownHosts({
      key: Buffer.from(KEY_B),
      host: '192.0.2.10',
      port: 22,
      knownHostsPath,
      onUnknownHost: async () => {
        throw new Error('onUnknownHost no debe llamarse en mismatch');
      },
    });

    expect(result.accepted).toBe(false);
    expect(result.error).toMatch(/cambió/);
    expect(result.error).toMatch(/intermediario/);
  });
});
