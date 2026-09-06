import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { createHash, createHmac } from 'node:crypto';
import { dirname } from 'node:path';
import { utils } from 'ssh2';
import type { UnknownHostInfo } from './types.js';

export interface PresentedHostKey {
  type: string;
  /** Base64 del blob SSH (mismo campo que en known_hosts). */
  publicKeyBase64: string;
}

export type KnownHostsMarker = 'revoked' | 'cert-authority' | null;

export interface KnownHostsEntry {
  marker: KnownHostsMarker;
  patterns: string[];
  keyType: string;
  keyBase64: string;
  comment?: string;
}

export type HostKeyDecision =
  | { status: 'match' }
  | {
      status: 'mismatch';
      keyType: string;
      presentedFingerprint: string;
      knownFingerprint: string;
    }
  | { status: 'revoked'; fingerprint: string; keyType: string }
  | { status: 'unknown'; fingerprint: string; keyType: string };

export interface VerifyHostKeyParams {
  key: Buffer;
  host: string;
  port: number;
  knownHostsPath: string;
  onUnknownHost?: (info: UnknownHostInfo) => boolean | Promise<boolean>;
}

export interface HostKeyVerificationResult {
  accepted: boolean;
  error?: string;
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Huella SHA256 en el formato de OpenSSH (`SHA256:` + base64 sin padding).
 */
export function sha256Fingerprint(publicKeyBase64: string): string {
  const blob = Buffer.from(publicKeyBase64, 'base64');
  const digest = createHash('sha256').update(blob).digest('base64');
  return `SHA256:${digest.replace(/=+$/, '')}`;
}

export function parsePresentedKey(key: Buffer | string): PresentedHostKey {
  const parsed = utils.parseKey(key);
  if (parsed instanceof Error) {
    throw parsed;
  }

  const single = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!single) {
    throw new Error('No se pudo interpretar la clave del host');
  }

  return {
    type: single.type,
    publicKeyBase64: single.getPublicSSH().toString('base64'),
  };
}

export function parseKnownHosts(content: string): KnownHostsEntry[] {
  const entries: KnownHostsEntry[] = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    let rest = line;
    let marker: KnownHostsMarker = null;

    if (rest.startsWith('@revoked')) {
      marker = 'revoked';
      rest = rest.slice('@revoked'.length).trim();
    } else if (rest.startsWith('@cert-authority')) {
      marker = 'cert-authority';
      rest = rest.slice('@cert-authority'.length).trim();
    }

    const parts = rest.split(/\s+/);
    if (parts.length < 3) {
      continue;
    }

    const [hosts, keyType, keyBase64, ...commentParts] = parts;
    entries.push({
      marker,
      patterns: hosts.split(','),
      keyType,
      keyBase64,
      comment: commentParts.join(' ') || undefined,
    });
  }

  return entries;
}

function hashedHostMatches(pattern: string, host: string): boolean {
  if (!pattern.startsWith('|1|')) {
    return false;
  }

  const encoded = pattern.slice(3);
  const separator = encoded.indexOf('|');
  if (separator === -1) {
    return false;
  }

  const salt = Buffer.from(encoded.slice(0, separator), 'base64');
  const expected = Buffer.from(encoded.slice(separator + 1), 'base64');
  if (salt.length === 0 || expected.length === 0) {
    return false;
  }

  const actual = createHmac('sha1', salt).update(host).digest();
  return actual.length === expected.length && actual.equals(expected);
}

export function hostCanonicalNames(host: string, port: number): string[] {
  const bracketed = `[${host}]:${port}`;
  if (port === 22) {
    return [host, bracketed];
  }
  return [bracketed];
}

export function hostMatchesPattern(
  host: string,
  port: number,
  pattern: string
): boolean {
  if (pattern === '*') {
    return true;
  }

  const names = hostCanonicalNames(host, port);

  if (pattern.startsWith('|1|')) {
    return names.some((name) => hashedHostMatches(pattern, name));
  }

  return names.includes(pattern);
}

function entryAppliesToHost(
  entry: KnownHostsEntry,
  host: string,
  port: number
): boolean {
  let matched = false;

  for (const pattern of entry.patterns) {
    if (pattern.startsWith('!')) {
      if (hostMatchesPattern(host, port, pattern.slice(1))) {
        return false;
      }
      continue;
    }

    if (hostMatchesPattern(host, port, pattern)) {
      matched = true;
    }
  }

  return matched;
}

export function formatKnownHostsLine(
  host: string,
  port: number,
  key: PresentedHostKey
): string {
  const name = port === 22 ? host : `[${host}]:${port}`;
  return `${name} ${key.type} ${key.publicKeyBase64}`;
}

export function decideHostKey(
  entries: KnownHostsEntry[],
  host: string,
  port: number,
  presented: PresentedHostKey
): HostKeyDecision {
  const fingerprint = sha256Fingerprint(presented.publicKeyBase64);
  const applicable = entries.filter((entry) =>
    entryAppliesToHost(entry, host, port)
  );

  for (const entry of applicable) {
    if (entry.marker !== 'revoked') {
      continue;
    }
    if (
      entry.keyType === presented.type &&
      entry.keyBase64 === presented.publicKeyBase64
    ) {
      return {
        status: 'revoked',
        fingerprint,
        keyType: presented.type,
      };
    }
  }

  const sameType = applicable.filter(
    (entry) =>
      entry.marker === null && entry.keyType === presented.type
  );

  if (sameType.length > 0) {
    const matched = sameType.some(
      (entry) => entry.keyBase64 === presented.publicKeyBase64
    );

    if (matched) {
      return { status: 'match' };
    }

    return {
      status: 'mismatch',
      keyType: presented.type,
      presentedFingerprint: fingerprint,
      knownFingerprint: sha256Fingerprint(sameType[0].keyBase64),
    };
  }

  return {
    status: 'unknown',
    fingerprint,
    keyType: presented.type,
  };
}

export async function readKnownHostsFile(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') {
      return '';
    }
    throw new Error(`No se pudo leer known_hosts en ${path}: ${errorMessage(err)}`);
  }
}

export async function appendKnownHostsLine(
  path: string,
  line: string
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });

  let prefix = '';
  try {
    const existing = await readFile(path, 'utf8');
    if (existing.length > 0 && !existing.endsWith('\n')) {
      prefix = '\n';
    }
  } catch (err) {
    if (!isErrnoException(err) || err.code !== 'ENOENT') {
      throw err;
    }
  }

  await appendFile(path, `${prefix}${line}\n`, { mode: 0o600 });
}

function formatMismatchError(
  host: string,
  port: number,
  knownHostsPath: string,
  decision: Extract<HostKeyDecision, { status: 'mismatch' }>
): string {
  return (
    `La clave del host ${host} (puerto ${port}) cambió respecto de ${knownHostsPath}. ` +
    `Posible ataque de intermediario. ` +
    `Tipo ${decision.keyType}: conocida ${decision.knownFingerprint}, ` +
    `presentada ${decision.presentedFingerprint}. ` +
    `Si reinstalaste el servidor, eliminá la entrada anterior en known_hosts.`
  );
}

/**
 * Verifica la clave del host contra known_hosts.
 * Desconocido: pide confirmación (TOFU) y, si se acepta, persiste la clave.
 * Distinta a la conocida: rechaza siempre (MITM).
 */
export async function verifyHostKeyAgainstKnownHosts(
  params: VerifyHostKeyParams
): Promise<HostKeyVerificationResult> {
  const { key, host, port, knownHostsPath, onUnknownHost } = params;

  try {
    const presented = parsePresentedKey(key);
    const content = await readKnownHostsFile(knownHostsPath);
    const decision = decideHostKey(
      parseKnownHosts(content),
      host,
      port,
      presented
    );

    switch (decision.status) {
      case 'match':
        return { accepted: true };
      case 'revoked':
        return {
          accepted: false,
          error:
            `La clave del host ${host} está revocada en ${knownHostsPath} ` +
            `(${decision.keyType} ${decision.fingerprint}).`,
        };
      case 'mismatch':
        return {
          accepted: false,
          error: formatMismatchError(host, port, knownHostsPath, decision),
        };
      case 'unknown': {
        if (!onUnknownHost) {
          return {
            accepted: false,
            error:
              `El host ${host} no está en ${knownHostsPath} y no hay ` +
              `confirmación de clave configurada (${presented.type} ${decision.fingerprint}).`,
          };
        }

        const accepted = await onUnknownHost({
          host,
          port,
          keyType: presented.type,
          fingerprint: decision.fingerprint,
        });

        if (!accepted) {
          return {
            accepted: false,
            error:
              `Conexión rechazada: la clave del host ${host} no fue aceptada ` +
              `(${presented.type} ${decision.fingerprint}).`,
          };
        }

        await appendKnownHostsLine(
          knownHostsPath,
          formatKnownHostsLine(host, port, presented)
        );
        return { accepted: true };
      }
    }
  } catch (err) {
    return {
      accepted: false,
      error: `Error al verificar la clave del host: ${errorMessage(err)}`,
    };
  }
}
