import { existsSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { UnknownHostInfo } from '@fractal/deploy';
import type { SshAuthMethod } from '../types/deploy-command.js';

export const SSH_KNOWN_HOSTS_ENV = 'FRACTAL_DEPLOY_SSH_KNOWN_HOSTS';

export const PASSWORD_UNVERIFIED_HOST_ERROR =
  'Modo --non-interactive: autenticación por contraseña contra un host ' +
  'desconocido sin FRACTAL_DEPLOY_SSH_KNOWN_HOSTS (ni --ssh-known-hosts). ' +
  'La contraseña no se envió. Pineá la host key esperada o usá autenticación por clave.';

export const PIN_UNKNOWN_HOST_ERROR =
  'Modo --non-interactive: la host key presentada no coincide con el pin ' +
  'de FRACTAL_DEPLOY_SSH_KNOWN_HOSTS / --ssh-known-hosts. ' +
  'No se aceptó a ciegas.';

export class DeployHostKeyPinError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeployHostKeyPinError';
  }
}

export interface NonInteractiveHostKeyPolicy {
  knownHostsPath?: string;
  onUnknownHost: (info: UnknownHostInfo) => Promise<boolean>;
  unknownHostRejectError?: string;
  pinConfigured: boolean;
  /** TOFU explícito (clave, sin pin): se acepta el host desconocido. */
  explicitTofu: boolean;
}

function expandHome(path: string): string {
  if (path.startsWith('~/')) {
    return resolve(homedir(), path.slice(2));
  }
  if (path === '~') {
    return homedir();
  }
  return path;
}

function looksLikeKnownHostsContent(value: string): boolean {
  return value.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return false;
    }
    return /\s(?:ssh-|ecdsa-|sk-ssh-|sk-ecdsa-)/.test(trimmed);
  });
}

function isExistingFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function writePinFile(content: string): string {
  const path = join(
    tmpdir(),
    `fractal-known-hosts-pin-${process.pid}-${Date.now()}.txt`
  );
  writeFileSync(path, content.endsWith('\n') ? content : `${content}\n`, {
    mode: 0o600,
  });
  return path;
}

/**
 * Resuelve pin de host key: flag (ruta) > env (ruta o contenido known_hosts).
 */
export function resolveHostKeyPin(
  pinFromFlag?: string,
  pinFromEnv?: string
): { path: string } | undefined {
  const flag = pinFromFlag?.trim();
  if (flag) {
    const path = expandHome(flag);
    if (!isExistingFile(path)) {
      throw new DeployHostKeyPinError(
        `No se encontró el archivo de host key (--ssh-known-hosts): ${path}`
      );
    }
    return { path };
  }

  const env = pinFromEnv?.trim();
  if (!env) {
    return undefined;
  }

  const asPath = expandHome(env);
  if (isExistingFile(asPath)) {
    return { path: asPath };
  }

  if (looksLikeKnownHostsContent(env)) {
    return { path: writePinFile(env) };
  }

  throw new DeployHostKeyPinError(
    `${SSH_KNOWN_HOSTS_ENV} no es un archivo existente ni una línea known_hosts: ${env}`
  );
}

/**
 * Política de host key para `fractal deploy --non-interactive` (FRA-75).
 *
 * - Pin configurado: se verifica contra ese known_hosts; un host desconocido
 *   se rechaza (no se acepta a ciegas). Aplica al cliente inicial y al
 *   reconectar como `deploy`.
 * - Sin pin + password: se rechaza el host desconocido ANTES de autenticar,
 *   para no mandar la contraseña a un host sin verificar.
 * - Sin pin + key: TOFU explícito (se acepta y persiste). El e2e pinea con
 *   ssh-keyscan; este camino queda documentado.
 */
export function resolveNonInteractiveHostKeyPolicy(input: {
  authMethod: SshAuthMethod;
  pinFromFlag?: string;
  pinFromEnv?: string;
}): NonInteractiveHostKeyPolicy {
  const pin = resolveHostKeyPin(input.pinFromFlag, input.pinFromEnv);

  if (pin) {
    return {
      knownHostsPath: pin.path,
      pinConfigured: true,
      explicitTofu: false,
      unknownHostRejectError: PIN_UNKNOWN_HOST_ERROR,
      onUnknownHost: async () => false,
    };
  }

  if (input.authMethod === 'password') {
    // `onUnknownHost => false` garantiza que la contraseña NO se transmite a un
    // host sin verificar: ssh2 invoca el host-verifier durante el handshake del
    // transporte, ANTES de la fase de autenticación (ver el `hostVerifier` en
    // packages/deploy/src/ssh/client.ts). Devolver `false` aborta la conexión
    // en ese punto, de modo que la credencial nunca llega a enviarse. Por eso
    // PASSWORD_UNVERIFIED_HOST_ERROR puede afirmar "La contraseña no se envió".
    return {
      pinConfigured: false,
      explicitTofu: false,
      unknownHostRejectError: PASSWORD_UNVERIFIED_HOST_ERROR,
      onUnknownHost: async () => false,
    };
  }

  return {
    pinConfigured: false,
    explicitTofu: true,
    onUnknownHost: async () => true,
  };
}
