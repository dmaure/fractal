/**
 * Comando `fractal doctor <target>`.
 *
 * Chequeo determinista post-deploy: verifica que HTTPS responda, que la app
 * esté levantada (no 5xx / contenido esperado) y que la página base se sirva
 * (200), con exit codes deterministas para consumo del e2e. Opcionalmente
 * verifica la redirección HTTP→HTTPS.
 *
 * La lógica pura (`normalizeTarget`, `evaluateHealth`) está separada de la I/O
 * (`httpProbe`, `probeWithRetry`) y del wrapper (`doctorCommand`) para que todo
 * sea unit-testeable sin red ni `process.exit`.
 *
 * Agnóstico de framework (Artículo II): no conoce ningún stack concreto. El
 * contenido esperado nunca se hardcodea; llega siempre por `--expect-content`.
 *
 * @see FRA-103, SPEC-0007
 */

import http from 'node:http';
import https from 'node:https';
import chalk from 'chalk';

/** Exit codes deterministas del chequeo (consumidos por el e2e). */
export const DOCTOR_EXIT = {
  /** Todas las verificaciones pasaron: la app está sana. */
  HEALTHY: 0,
  /** Target inválido/ausente o una opción mal formada: error de uso. */
  USAGE: 1,
  /** HTTPS no responde (TLS caído, conexión rechazada, timeout…). */
  HTTPS_UNREACHABLE: 2,
  /** La página base no se sirve (status ≠ 200, p. ej. 404/403/3xx). */
  BASE_PAGE_FAILED: 3,
  /** La app no está levantada (5xx = proxy arriba / app caída, o contenido ausente). */
  APP_NOT_UP: 4,
  /** La redirección HTTP→HTTPS no se verificó. */
  REDIRECT_FAILED: 5,
} as const;

/** Resultado de una sonda HTTP de bajo nivel. */
export interface HttpProbeResult {
  /** `true` sii se obtuvo una respuesta HTTP (status). En fallo de red/TLS, `false`. */
  ok: boolean;
  /** Código de estado HTTP, si hubo respuesta. */
  status?: number;
  /** Cuerpo de la respuesta (acotado), si hubo respuesta. */
  body?: string;
  /** Header `Location`, si lo hubo (relevante para redirecciones). */
  location?: string;
  /** Código del error de red/TLS (p. ej. `ECONNREFUSED`, `ETIMEDOUT`), si `ok:false`. */
  errorCode?: string;
  /** Mensaje humano del error de red/TLS, si `ok:false`. */
  errorMessage?: string;
}

/** Una verificación nombrada del reporte. */
export interface DoctorCheck {
  /** Nombre legible de la verificación. */
  name: string;
  /** `true` sii la verificación pasó. */
  passed: boolean;
  /** Detalle humano del resultado de la verificación. */
  detail: string;
}

/** Reporte determinista del chequeo. */
export interface DoctorReport {
  /** Target normalizado (forma https) sobre el que se corrió el chequeo. */
  target: string;
  /** `true` sii todas las verificaciones pasaron. */
  healthy: boolean;
  /** Exit code determinista (ver `DOCTOR_EXIT`). */
  exitCode: number;
  /** Motivo de la primera verificación que falló, si la hay. */
  reason?: string;
  /** Verificaciones nombradas, en orden. */
  checks: DoctorCheck[];
}

/** Tope de bytes del cuerpo leído (truncado de forma determinista). */
const MAX_BODY_BYTES = 65536;

/**
 * Códigos de red transitorios: típicos de una app que todavía está booteando o
 * de DNS no propagado justo después de un deploy. Se reintentan.
 */
const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

/** Status de redirección aceptados para la verificación HTTP→HTTPS. */
const REDIRECT_STATUSES = new Set([301, 302, 307, 308]);

/**
 * Normaliza el target: acepta una URL completa o un dominio pelado (en cuyo
 * caso asume `https://`) y deriva las formas https y http (mismo host, puerto y
 * path). Rechaza entradas vacías o inválidas.
 *
 * Función pura: sin I/O.
 *
 * @param raw - URL o dominio provisto por el usuario.
 * @returns `{ httpsUrl, httpUrl }` o `{ error }` si es inválido.
 */
export function normalizeTarget(
  raw: string
): { httpsUrl: string; httpUrl: string } | { error: string } {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') {
    return { error: 'Target vacío: se requiere una URL o un dominio.' };
  }

  // Si no trae esquema (`scheme://`), se asume https.
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { error: `Target inválido: "${raw}".` };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { error: `Protocolo no soportado (${url.protocol}): usá http o https.` };
  }
  if (url.hostname === '') {
    return { error: `Target sin host: "${raw}".` };
  }

  const httpsUrl = new URL(url.toString());
  httpsUrl.protocol = 'https:';
  const httpUrl = new URL(url.toString());
  httpUrl.protocol = 'http:';

  return { httpsUrl: httpsUrl.toString(), httpUrl: httpUrl.toString() };
}

/**
 * Evalúa la salud a partir de las sondas ya obtenidas, codificando la
 * precedencia de fallos:
 *
 *   HTTPS(2) > App-up/5xx(4) > Página-base/≠200(3) > contenido-ausente(4) > redirect(5)
 *
 * Así un 503 reporta "app no levantada" (exit 4) y un 404 reporta "página base"
 * (exit 3). Función pura y determinista: sin I/O.
 *
 * @param input - Sondas ya resueltas: `https` y (opcional) `redirect`.
 * @param options - `expectContent` (texto que debe aparecer) y `checkRedirect`.
 * @returns El reporte con verificaciones nombradas, exit code y motivo.
 */
export function evaluateHealth(
  input: { https: HttpProbeResult; redirect?: HttpProbeResult },
  options: { expectContent?: string; checkRedirect?: boolean }
): DoctorReport {
  const { https: httpsProbe, redirect } = input;
  const expectContent = options.expectContent;
  const checkRedirect = options.checkRedirect ?? false;
  const wantsContent = expectContent !== undefined && expectContent !== '';

  const httpsOk = httpsProbe.ok === true;
  const status = httpsProbe.status;
  const is5xx = httpsOk && typeof status === 'number' && status >= 500 && status <= 599;
  const is200 = httpsOk && status === 200;

  const checks: DoctorCheck[] = [];

  // 1) HTTPS responde.
  checks.push({
    name: 'HTTPS responde',
    passed: httpsOk,
    detail: httpsOk
      ? `respuesta recibida (status ${status})`
      : `sin respuesta: ${httpsProbe.errorCode ?? 'error'}${
          httpsProbe.errorMessage ? ` (${httpsProbe.errorMessage})` : ''
        }`,
  });

  // 2) App levantada (status no 5xx).
  checks.push({
    name: 'App levantada (sin 5xx)',
    passed: httpsOk && !is5xx,
    detail: !httpsOk
      ? 'no evaluable: HTTPS no respondió'
      : is5xx
        ? `status ${status} (5xx: proxy arriba, app caída)`
        : `status ${status} (sin 5xx)`,
  });

  // 3) Página base servida (status 200).
  checks.push({
    name: 'Página base servida (200)',
    passed: is200,
    detail: !httpsOk
      ? 'no evaluable: HTTPS no respondió'
      : is200
        ? 'status 200'
        : `status ${status} (se esperaba 200)`,
  });

  // 4) Contenido esperado (solo si se pidió).
  let contentPresent = true;
  if (wantsContent) {
    contentPresent =
      httpsOk && typeof httpsProbe.body === 'string' && httpsProbe.body.includes(expectContent);
    checks.push({
      name: 'Contenido esperado presente',
      passed: contentPresent,
      detail: !httpsOk
        ? 'no evaluable: HTTPS no respondió'
        : contentPresent
          ? 'el cuerpo contiene el texto esperado'
          : 'el cuerpo no contiene el texto esperado',
    });
  }

  // 5) Redirección HTTP→HTTPS (solo si se pidió).
  let redirectOk = true;
  if (checkRedirect) {
    const rStatus = redirect?.status;
    const location = redirect?.location;
    redirectOk =
      !!redirect &&
      redirect.ok === true &&
      typeof rStatus === 'number' &&
      REDIRECT_STATUSES.has(rStatus) &&
      typeof location === 'string' &&
      /^https:/i.test(location);
    checks.push({
      name: 'Redirección HTTP→HTTPS',
      passed: redirectOk,
      detail: !redirect
        ? 'no evaluable: sin sonda HTTP'
        : !redirect.ok
          ? `sin respuesta HTTP: ${redirect.errorCode ?? 'error'}`
          : redirectOk
            ? `status ${rStatus} → ${location}`
            : `status ${rStatus}${location ? ` → ${location}` : ''} (se esperaba 3xx hacia https)`,
    });
  }

  // Precedencia de fallos → exit code + motivo.
  let exitCode: number = DOCTOR_EXIT.HEALTHY;
  let reason: string | undefined;
  if (!httpsOk) {
    exitCode = DOCTOR_EXIT.HTTPS_UNREACHABLE;
    reason = `HTTPS no responde (${httpsProbe.errorCode ?? 'error'}).`;
  } else if (is5xx) {
    exitCode = DOCTOR_EXIT.APP_NOT_UP;
    reason = `App no levantada: status ${status} (5xx).`;
  } else if (!is200) {
    exitCode = DOCTOR_EXIT.BASE_PAGE_FAILED;
    reason = `Página base no servida: status ${status} (se esperaba 200).`;
  } else if (!contentPresent) {
    exitCode = DOCTOR_EXIT.APP_NOT_UP;
    reason = 'App no levantada: contenido esperado ausente en la página base.';
  } else if (checkRedirect && !redirectOk) {
    exitCode = DOCTOR_EXIT.REDIRECT_FAILED;
    reason = 'Redirección HTTP→HTTPS no verificada.';
  }

  return {
    target: '',
    healthy: exitCode === DOCTOR_EXIT.HEALTHY,
    exitCode,
    reason,
    checks,
  };
}

/** Opciones de bajo nivel de una sonda. */
export interface HttpProbeOptions {
  /** Timeout por request, en ms. */
  timeoutMs: number;
  /** Si `true`, se omite la validación del certificado TLS. */
  insecure: boolean;
  /** Si `false`, las redirecciones NO se siguen (se lee status + `Location`). */
  followRedirect: boolean;
}

/**
 * Sonda HTTP/HTTPS de bajo nivel usando los módulos nativos de Node. Nunca
 * lanza: ante un error de red/TLS resuelve con `ok:false` y `errorCode`.
 *
 * No sigue redirecciones (lee el status y el header `Location`). Aplica el
 * timeout destruyendo el socket, lee un cuerpo acotado (truncado de forma
 * determinista a `MAX_BODY_BYTES`) y usa `rejectUnauthorized: !insecure` en
 * https.
 *
 * @param url - URL absoluta a sondear.
 * @param opts - Timeout, modo inseguro y política de redirección.
 * @returns El resultado de la sonda (nunca rechaza).
 */
export async function httpProbe(url: string, opts: HttpProbeOptions): Promise<HttpProbeResult> {
  const { timeoutMs, insecure } = opts;

  let isHttps: boolean;
  try {
    isHttps = new URL(url).protocol === 'https:';
  } catch {
    return { ok: false, errorCode: 'ERR_INVALID_URL', errorMessage: `URL inválida: ${url}` };
  }

  const requestOptions: https.RequestOptions = {
    method: 'GET',
    timeout: timeoutMs,
    rejectUnauthorized: !insecure,
  };

  return new Promise<HttpProbeResult>((resolve) => {
    let settled = false;
    const done = (result: HttpProbeResult): void => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    const handler = (res: http.IncomingMessage): void => {
      const status = res.statusCode;
      const rawLocation = res.headers.location;
      const location = typeof rawLocation === 'string' ? rawLocation : undefined;
      const chunks: Buffer[] = [];
      let size = 0;
      let truncated = false;

      const finish = (): void => {
        done({ ok: true, status, body: Buffer.concat(chunks).toString('utf-8'), location });
      };

      res.on('data', (chunk: Buffer) => {
        if (truncated) return;
        const remaining = MAX_BODY_BYTES - size;
        if (chunk.length >= remaining) {
          chunks.push(chunk.subarray(0, remaining));
          size = MAX_BODY_BYTES;
          truncated = true;
          res.destroy();
          finish();
        } else {
          chunks.push(chunk);
          size += chunk.length;
        }
      });
      res.on('end', finish);
      res.on('close', finish);
      res.on('error', (err: NodeJS.ErrnoException) => {
        done({ ok: false, status, errorCode: err.code, errorMessage: err.message });
      });
    };

    const req = isHttps
      ? https.request(url, requestOptions, handler)
      : http.request(url, requestOptions, handler);

    req.on('timeout', () => {
      req.destroy();
      done({ ok: false, errorCode: 'ETIMEDOUT', errorMessage: `Timeout tras ${timeoutMs}ms.` });
    });
    req.on('error', (err: NodeJS.ErrnoException) => {
      done({ ok: false, errorCode: err.code ?? 'ERR_NETWORK', errorMessage: err.message });
    });
    req.end();
  });
}

/** Opciones de reintento de una sonda. */
export interface ProbeWithRetryOptions extends HttpProbeOptions {
  /** Máximo de intentos ante condiciones transitorias. */
  retries: number;
  /** Delay (ms) entre intentos. */
  retryDelayMs: number;
  /** Tipo de sonda: `https` (reintenta más condiciones) o `redirect` (solo red). */
  kind: 'https' | 'redirect';
  /** Texto esperado en el cuerpo (si se pidió): su ausencia es transitoria. */
  expectContent?: string;
}

/** Espera `ms` milisegundos (inyectable en tests por un no-op). */
function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Decide si un resultado amerita reintento.
 *
 * - Siempre se reintentan errores de red transitorios (`TRANSIENT_NETWORK_CODES`).
 * - Para la sonda `redirect`, SOLO se reintentan errores de red.
 * - Para la sonda `https`, además: 5xx, status ≠ 200, y (si se pidió contenido)
 *   un cuerpo que todavía no lo contiene.
 * - Un 200 que ya satisface (con el contenido esperado presente, si se pidió) NO
 *   se reintenta.
 */
function shouldRetry(
  result: HttpProbeResult,
  kind: 'https' | 'redirect',
  expectContent?: string
): boolean {
  if (!result.ok) {
    return result.errorCode !== undefined && TRANSIENT_NETWORK_CODES.has(result.errorCode);
  }
  if (kind === 'redirect') {
    return false;
  }
  const status = result.status;
  if (typeof status === 'number' && status >= 500 && status <= 599) {
    return true;
  }
  if (status !== 200) {
    return true;
  }
  if (expectContent !== undefined && expectContent !== '') {
    return !(typeof result.body === 'string' && result.body.includes(expectContent));
  }
  return false;
}

/**
 * Corre la sonda con reintentos ante condiciones transitorias (ver
 * `shouldRetry`). Justo después de un deploy la app puede estar booteando, por
 * lo que reintenta hasta que la sonda pasaría o se agotan los intentos.
 *
 * `deps` se inyecta en tests (sonda falsa con una cola de resultados y un sleep
 * no-op) para correr sin red ni esperas reales.
 *
 * @param url - URL a sondear.
 * @param opts - Opciones de sonda + reintento.
 * @param deps - Dependencias inyectables (`probe`, `sleep`).
 * @returns El primer resultado que pasa, o el último si se agotan los intentos.
 */
export async function probeWithRetry(
  url: string,
  opts: ProbeWithRetryOptions,
  deps: {
    probe?: typeof httpProbe;
    sleep?: (ms: number) => Promise<void>;
  } = {}
): Promise<HttpProbeResult> {
  const probe = deps.probe ?? httpProbe;
  const sleep = deps.sleep ?? defaultSleep;
  const attempts = Math.max(1, opts.retries);
  const probeOpts: HttpProbeOptions = {
    timeoutMs: opts.timeoutMs,
    insecure: opts.insecure,
    followRedirect: opts.followRedirect,
  };

  let last: HttpProbeResult = {
    ok: false,
    errorCode: 'ENOATTEMPT',
    errorMessage: 'No se realizó ningún intento.',
  };

  for (let attempt = 0; attempt < attempts; attempt++) {
    last = await probe(url, probeOpts);
    if (!shouldRetry(last, opts.kind, opts.expectContent)) {
      return last;
    }
    if (attempt < attempts - 1) {
      await sleep(opts.retryDelayMs);
    }
  }

  return last;
}

/** Opciones del comando `fractal doctor`. */
export interface DoctorCommandOptions {
  /** Texto que debe aparecer en la página base (señal de app arriba). */
  expectContent?: string;
  /** Timeout por request, en ms (default 10000). */
  timeout?: number;
  /** Máximo de intentos ante fallos transitorios (default 10). */
  retries?: number;
  /** Delay base entre intentos, en ms (default 5000). */
  retryDelay?: number;
  /** Si `true`, omite la validación del certificado TLS (default false). */
  insecure?: boolean;
  /** Si `true`, verifica también la redirección HTTP→HTTPS (default false). */
  checkRedirect?: boolean;
  /** Si `true`, imprime salida JSON machine-readable (default false). */
  json?: boolean;
}

/** Dependencias inyectables del comando (para tests sin red). */
export interface DoctorDeps {
  /** Sonda https (con reintento) inyectable. */
  probeHttps?: (url: string) => Promise<HttpProbeResult>;
  /** Sonda http (con reintento) inyectable, para la redirección. */
  probeHttp?: (url: string) => Promise<HttpProbeResult>;
  /** Sink de salida (default `console.log`). */
  logger?: (line: string) => void;
}

/**
 * Arma el reporte humano (una línea por elemento), con marcas ✓/✗ y colores.
 */
function formatHumanReport(report: DoctorReport): string[] {
  const lines: string[] = [];
  lines.push(chalk.bold(`fractal doctor — ${report.target}`));
  for (const check of report.checks) {
    const mark = check.passed ? chalk.green('✓') : chalk.red('✗');
    lines.push(`  ${mark} ${check.name}: ${check.detail}`);
  }
  if (report.healthy) {
    lines.push(chalk.green('✔ Sano: todas las verificaciones pasaron.'));
  } else {
    lines.push(chalk.red(`✘ Falló (exit ${report.exitCode}): ${report.reason ?? 'desconocido'}`));
  }
  return lines;
}

/**
 * Ejecuta `fractal doctor <target>`: normaliza el target, corre la sonda https
 * (con reintento) y, si se pidió, la sonda http para la redirección; evalúa la
 * salud, imprime el reporte (humano o JSON) y DEVUELVE el exit code.
 *
 * No llama a `process.exit` (eso lo hace el wrapper de la CLI), lo que mantiene
 * la función testeable. Acepta `deps` para inyectar sondas/logger en tests.
 *
 * @param target - URL o dominio a chequear.
 * @param options - Opciones del comando.
 * @param deps - Dependencias inyectables.
 * @returns El exit code determinista (ver `DOCTOR_EXIT`).
 */
export async function doctorCommand(
  target: string,
  options: DoctorCommandOptions = {},
  deps: DoctorDeps = {}
): Promise<number> {
  const logger = deps.logger ?? ((line: string): void => console.log(line));
  const timeoutMs = options.timeout ?? 10000;
  const retries = options.retries ?? 10;
  const retryDelayMs = options.retryDelay ?? 5000;
  const insecure = options.insecure ?? false;
  const checkRedirect = options.checkRedirect ?? false;
  const expectContent = options.expectContent;

  const normalized = normalizeTarget(target);
  if ('error' in normalized) {
    if (options.json) {
      logger(
        JSON.stringify(
          {
            target: target ?? null,
            healthy: false,
            exitCode: DOCTOR_EXIT.USAGE,
            reason: normalized.error,
            checks: [],
          },
          null,
          2
        )
      );
    } else {
      logger(chalk.red(`✗ ${normalized.error}`));
    }
    return DOCTOR_EXIT.USAGE;
  }

  const probeHttps =
    deps.probeHttps ??
    ((url: string): Promise<HttpProbeResult> =>
      probeWithRetry(url, {
        timeoutMs,
        insecure,
        followRedirect: false,
        retries,
        retryDelayMs,
        expectContent,
        kind: 'https',
      }));
  const probeHttp =
    deps.probeHttp ??
    ((url: string): Promise<HttpProbeResult> =>
      probeWithRetry(url, {
        timeoutMs,
        insecure,
        followRedirect: false,
        retries,
        retryDelayMs,
        kind: 'redirect',
      }));

  const httpsResult = await probeHttps(normalized.httpsUrl);
  const redirectResult = checkRedirect ? await probeHttp(normalized.httpUrl) : undefined;

  const evaluated = evaluateHealth(
    { https: httpsResult, redirect: redirectResult },
    { expectContent, checkRedirect }
  );
  const report: DoctorReport = { ...evaluated, target: normalized.httpsUrl };

  if (options.json) {
    logger(JSON.stringify(report, null, 2));
  } else {
    for (const line of formatHumanReport(report)) {
      logger(line);
    }
  }

  return report.exitCode;
}
