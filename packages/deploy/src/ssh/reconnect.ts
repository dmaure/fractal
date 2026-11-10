/**
 * Reintento acotado de la reconexión SSH tras el hardening del sistema (FRA-93).
 *
 * `hardenSshd()` ejecuta `systemctl reload sshd`, lo que hace que el puerto 22
 * rechace conexiones por un instante mientras sshd reinicia. La reconexión
 * inmediata como usuario `deploy` se intentaba una sola vez y fallaba con
 * `ECONNREFUSED ...:22`. Este módulo reintenta ante errores transitorios
 * (ECONNREFUSED/ECONNRESET/ETIMEDOUT/timeout de handshake) con backoff
 * exponencial acotado y un presupuesto de tiempo configurable.
 *
 * Es auto-contenido y testeable: NO importa SSH ni red. Recibe una función
 * `connect` inyectada (p.ej. `() => sshClient.testConnection()`), de modo que en
 * los tests se puede pasar un mock sin tocar sockets. Agnóstico de framework
 * (Artículo II): no asume ningún framework ni tipo de proyecto.
 */

/** Resultado simplificado de un intento de conexión (coincide con `testConnection`). */
export interface SshReconnectResult {
  success: boolean;
  error?: string;
}

export interface ReconnectWithRetryOptions {
  /** Presupuesto total de tiempo para reintentar (ms). Default 90_000. */
  deadlineMs?: number;
  /** Retardo base para el backoff exponencial (ms). Default 2_000. */
  baseDelayMs?: number;
  /** Tope del retardo por reintento (ms). Default 10_000. */
  maxDelayMs?: number;
  /** Clasificador de errores reintentables. Default: isTransientSshError. */
  isRetryable?: (error: string | undefined) => boolean;
  /** Inyectable para tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Inyectable para tests. */
  now?: () => number;
  /** Logger opcional para informar reintentos. */
  logger?: (message: string) => void;
}

/** Presupuesto total por defecto para reintentar la reconexión (~90s). */
export const SSH_RECONNECT_DEADLINE_MS = 90_000;
/** Backoff base por defecto (exponencial) del reintento. */
export const SSH_RECONNECT_BASE_DELAY_MS = 2_000;
/** Tope por defecto del backoff exponencial del reintento. */
export const SSH_RECONNECT_MAX_DELAY_MS = 10_000;

/**
 * Errores de autenticación: NUNCA se reintentan. Un backoff no cambia que las
 * credenciales sean incorrectas; reintentar solo dilata el fallo.
 */
const AUTH_SSH_ERROR_REGEX =
  /All configured authentication methods failed|client-authentication|Permission denied|authentication method/i;

/**
 * Errores transitorios durante el reinicio de sshd: se reintentan. Cubre el
 * rechazo de puerto (ECONNREFUSED/ECONNRESET), hosts/redes momentáneamente
 * inalcanzables (EHOSTUNREACH/ENETUNREACH), y los timeouts de conexión y de
 * handshake que emite `testConnection` ("Timeout: no se pudo conectar...",
 * "Timed out while waiting for handshake").
 */
const TRANSIENT_SSH_ERROR_REGEX =
  /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|Timed out|Timeout|handshake/i;

/**
 * Un error de conexión SSH es transitorio si NO es de autenticación y matchea el
 * patrón transitorio. El chequeo de autenticación tiene precedencia: un error de
 * credenciales nunca se considera transitorio aunque contenga una palabra del
 * patrón transitorio.
 */
export function isTransientSshError(error: string | undefined): boolean {
  if (!error) return false;
  if (AUTH_SSH_ERROR_REGEX.test(error)) return false;
  return TRANSIENT_SSH_ERROR_REGEX.test(error);
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ejecuta `connect` reintentando ante errores transitorios con backoff
 * exponencial acotado, dentro de un presupuesto de tiempo. Los errores de
 * autenticación (u otros no transitorios) fallan de inmediato sin reintentar.
 * Devuelve el último resultado (éxito, o el último fallo al agotar el
 * presupuesto).
 */
export async function reconnectWithRetry(
  connect: () => Promise<SshReconnectResult>,
  options: ReconnectWithRetryOptions = {},
): Promise<SshReconnectResult> {
  const {
    deadlineMs = SSH_RECONNECT_DEADLINE_MS,
    baseDelayMs = SSH_RECONNECT_BASE_DELAY_MS,
    maxDelayMs = SSH_RECONNECT_MAX_DELAY_MS,
    isRetryable = isTransientSshError,
    sleep = defaultSleep,
    now = Date.now,
    logger,
  } = options;

  const start = now();
  let attempt = 0;

  while (true) {
    attempt += 1;
    const result = await connect();

    if (result.success) {
      if (attempt > 1) {
        logger?.(`Reconexión SSH establecida tras ${attempt} intento(s).`);
      }
      return result;
    }

    if (!isRetryable(result.error)) {
      return result; // p. ej. error de autenticación: fallar rápido.
    }

    const elapsed = now() - start;
    if (elapsed >= deadlineMs) {
      logger?.(
        `Reconexión SSH: se agotó el presupuesto de ${deadlineMs} ms tras ${attempt} intento(s).`,
      );
      return result;
    }

    const delay = Math.min(
      baseDelayMs * 2 ** (attempt - 1),
      maxDelayMs,
      Math.max(0, deadlineMs - elapsed),
    );
    logger?.(
      `Reconexión SSH rechazada (${result.error ?? 'desconocido'}); reintento ${attempt} en ${delay} ms...`,
    );
    await sleep(delay);
  }
}
