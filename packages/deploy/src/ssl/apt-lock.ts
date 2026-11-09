/**
 * Espera del lock de apt/dpkg + reintento acotado para la fase de instalación
 * de certbot (FRA-89).
 *
 * Mismo problema y mismo patrón que FRA-76 resolvió para el instalador de
 * Docker: en un VPS recién aprovisionado, cloud-init y las actualizaciones
 * desatendidas corren en segundo plano y toman el lock de dpkg/apt; sin una
 * espera previa, `apt-get` aborta al instante con
 * "Could not get lock /var/lib/dpkg/lock-frontend".
 *
 * Este módulo es auto-contenido y testeable: NO importa SSH ni red. Recibe una
 * función `exec` inyectada, de modo que en los tests se puede pasar un mock sin
 * tocar sockets. Agnóstico de framework (Artículo II): solo usa utilidades
 * estándar de Linux (cloud-init, fuser, flock).
 */

/**
 * Opción de apt para esperar hasta 300s a que se libere el lock de dpkg/apt en
 * vez de abortar al instante (Ubuntu 24.04). Valor idéntico al de FRA-76
 * (DockerInstaller). Se coloca inmediatamente después de `apt-get`.
 */
export const APT_LOCK_TIMEOUT_OPT = '-o DPkg::Lock::Timeout=300';

/** Deadline por defecto de la espera activa del lock (~5 min, como FRA-76). */
export const APT_LOCK_DEADLINE_MS = 300_000;

/** Intervalo de polling por defecto entre chequeos del lock. */
export const APT_LOCK_POLL_INTERVAL_MS = 2_000;

/**
 * Timeout del comando remoto para cada chequeo/espera. Generoso respecto del
 * deadline para no cortar la espera antes de tiempo (coincide con FRA-76).
 */
export const APT_LOCK_EXEC_TIMEOUT_MS = 320_000;

/** Intentos por defecto del reintento acotado ante contención del lock. */
export const APT_LOCK_RETRY_ATTEMPTS = 3;

/** Backoff base por defecto (exponencial) del reintento. */
export const APT_LOCK_RETRY_BASE_DELAY_MS = 2_000;

/** Tope del backoff exponencial del reintento. */
export const APT_LOCK_RETRY_MAX_DELAY_MS = 30_000;

/**
 * Espera a que cloud-init termine antes de intentar apt. Best-effort: si
 * cloud-init no está presente no hace nada. `sudo cloud-init status --wait` es
 * la forma permitida por el allowlist de sudoers (`/usr/bin/cloud-init`).
 */
export const CLOUD_INIT_WAIT_COMMAND =
  'if command -v cloud-init >/dev/null 2>&1; then ' +
  'sudo cloud-init status --wait >/dev/null 2>&1 || true; fi';

/**
 * Comando-probe de una iteración del polling. Reutiliza VERBATIM las strings
 * `fuser`/`flock` que el allowlist de sudoers de FRA-75/76 ya autoriza:
 *   - `sudo fuser /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock`
 *   - `sudo flock -n /var/lib/dpkg/lock-frontend -c true`
 * Imprime `FREE` en stdout cuando el lock está libre (o cuando no hay
 * herramienta para chequearlo: degradación grácil, nunca bloquea el deploy).
 */
export const APT_LOCK_PROBE_COMMAND =
  'if command -v fuser >/dev/null 2>&1; then ' +
  'if ! sudo fuser /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock >/dev/null 2>&1; then echo FREE; fi; ' +
  'elif command -v flock >/dev/null 2>&1; then ' +
  'if sudo flock -n /var/lib/dpkg/lock-frontend -c true >/dev/null 2>&1; then echo FREE; fi; ' +
  'else echo FREE; fi';

/**
 * Regex de los mensajes de contención del lock de apt/dpkg. Deriva de los
 * errores reales que emite apt/dpkg cuando otro proceso tiene el lock.
 */
const LOCK_CONTENTION_REGEX =
  /Could not get lock|dpkg frontend lock|Unable to (acquire|lock)|Could not get a lock/i;

/** Resultado simplificado de un comando (coincide con el `exec` de certbot). */
export interface AptExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Firma de la función de ejecución inyectada. Coincide con el `executeCommand`
 * del SSH client (comando + opción de timeout por comando).
 */
export type AptExec = (
  command: string,
  options?: { timeoutMs?: number }
) => Promise<AptExecResult>;

/** Logger mínimo opcional (evita acoplar a una implementación concreta). */
export interface AptLockLogger {
  warn?: (message: string) => void;
  info?: (message: string) => void;
}

/**
 * Detecta contención del lock de apt/dpkg a partir del resultado de un comando
 * (stderr + exitCode). Un exitCode 0 nunca se considera contención.
 */
export function isAptLockContention(result: {
  stderr?: string;
  exitCode?: number | null;
}): boolean {
  if (result.exitCode === 0) {
    return false;
  }
  return LOCK_CONTENTION_REGEX.test(result.stderr ?? '');
}

/** isRetryable por defecto: matchea el mensaje del error contra la regex. */
function defaultIsRetryable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return LOCK_CONTENTION_REGEX.test(message);
}

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface WaitForAptLockOptions {
  logger?: AptLockLogger;
  deadlineMs?: number;
  pollIntervalMs?: number;
  execTimeoutMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Espera a que cloud-init y las actualizaciones desatendidas liberen el lock de
 * dpkg/apt antes de la primera operación apt. Mirror del `waitForAptLock` de
 * FRA-76, pero con polling en Node (inyectable) y strings `fuser`/`flock`
 * verbatim.
 *
 * Degrada con elegancia: NUNCA lanza. Si se alcanza el deadline o el propio
 * probe falla, loguea una advertencia y retorna para que el caller igualmente
 * intente apt (el `DPkg::Lock::Timeout` de apt da una segunda red de contención).
 */
export async function waitForAptLock(
  exec: AptExec,
  opts: WaitForAptLockOptions = {}
): Promise<void> {
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? realSleep;
  const deadlineMs = opts.deadlineMs ?? APT_LOCK_DEADLINE_MS;
  const pollIntervalMs = opts.pollIntervalMs ?? APT_LOCK_POLL_INTERVAL_MS;
  const execTimeoutMs = opts.execTimeoutMs ?? APT_LOCK_EXEC_TIMEOUT_MS;
  const logger = opts.logger;
  const start = now();

  // 1. Esperar a cloud-init (best-effort; nunca bloquea el flujo si falla).
  try {
    await exec(CLOUD_INIT_WAIT_COMMAND, { timeoutMs: execTimeoutMs });
  } catch {
    // Degradar: si ni siquiera corre el chequeo de cloud-init, seguimos al
    // polling del lock en vez de abortar.
  }

  // 2. Polling del lock hasta liberarlo o alcanzar el deadline.
  while (now() - start < deadlineMs) {
    try {
      const probe = await exec(APT_LOCK_PROBE_COMMAND, {
        timeoutMs: execTimeoutMs,
      });
      if (probe.stdout.includes('FREE')) {
        return;
      }
    } catch {
      // Si el probe mismo falla no bloqueamos el deploy: degradar y salir.
      return;
    }
    await sleep(pollIntervalMs);
  }

  logger?.warn?.(
    'Timeout esperando el lock de apt/dpkg; se intenta apt igualmente (FRA-89)'
  );
}

export interface WithAptLockRetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  isRetryable?: (error: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
  logger?: AptLockLogger;
}

/**
 * Reintento acotado con backoff exponencial, SOLO ante contención del lock de
 * apt/dpkg. Un error que no sea de lock se relanza de inmediato (sin reintento).
 * Agotados los intentos, relanza el último error.
 */
export async function withAptLockRetry<T>(
  fn: () => Promise<T>,
  opts: WithAptLockRetryOptions = {}
): Promise<T> {
  const attempts = opts.attempts ?? APT_LOCK_RETRY_ATTEMPTS;
  const baseDelayMs = opts.baseDelayMs ?? APT_LOCK_RETRY_BASE_DELAY_MS;
  const maxDelayMs = opts.maxDelayMs ?? APT_LOCK_RETRY_MAX_DELAY_MS;
  const isRetryable = opts.isRetryable ?? defaultIsRetryable;
  const sleep = opts.sleep ?? realSleep;
  const logger = opts.logger;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isRetryable(error)) {
        throw error;
      }
      const delay = Math.min(
        baseDelayMs * 2 ** (attempt - 1),
        maxDelayMs
      );
      logger?.warn?.(
        `Contención del lock de apt/dpkg (intento ${attempt}/${attempts}); ` +
          `reintentando en ${delay}ms (FRA-89)`
      );
      await sleep(delay);
    }
  }
  // Inalcanzable en la práctica: el loop relanza en el último intento.
  throw lastError;
}
