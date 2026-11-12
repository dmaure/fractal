/**
 * Tests del comando `fractal doctor` (FRA-103, SPEC-0007).
 *
 * Cubre la lógica pura (`normalizeTarget`, `evaluateHealth`), la de reintento
 * (`probeWithRetry` con sonda inyectada + sleep no-op) y el wrapper
 * (`doctorCommand` con sondas + logger inyectados). Nunca toca la red.
 */

import { describe, it, expect } from 'vitest';
import {
  DOCTOR_EXIT,
  normalizeTarget,
  evaluateHealth,
  probeWithRetry,
  doctorCommand,
} from './doctor.js';
import type { HttpProbeResult, HttpProbeOptions, ProbeWithRetryOptions } from './doctor.js';

// --- helpers --------------------------------------------------------------

/** Sonda falsa que devuelve una cola de resultados (y cuenta las llamadas). */
function fakeProbeQueue(results: HttpProbeResult[]): {
  probe: (url: string, opts: HttpProbeOptions) => Promise<HttpProbeResult>;
  calls: () => number;
} {
  let i = 0;
  let count = 0;
  return {
    probe: async (): Promise<HttpProbeResult> => {
      count++;
      const r = results[Math.min(i, results.length - 1)];
      i++;
      return r;
    },
    calls: () => count,
  };
}

const noopSleep = async (): Promise<void> => undefined;

const RETRY_BASE: Omit<ProbeWithRetryOptions, 'kind' | 'retries'> = {
  timeoutMs: 10,
  insecure: false,
  followRedirect: false,
  retryDelayMs: 1,
};

// --- normalizeTarget ------------------------------------------------------

describe('normalizeTarget', () => {
  it('un dominio pelado deriva https y http', () => {
    const result = normalizeTarget('example.com');
    expect(result).toEqual({
      httpsUrl: 'https://example.com/',
      httpUrl: 'http://example.com/',
    });
  });

  it('una URL https completa se preserva y deriva su http', () => {
    const result = normalizeTarget('https://example.com/health');
    expect(result).toEqual({
      httpsUrl: 'https://example.com/health',
      httpUrl: 'http://example.com/health',
    });
  });

  it('preserva path y puerto', () => {
    const result = normalizeTarget('example.com:8443/app');
    expect(result).toEqual({
      httpsUrl: 'https://example.com:8443/app',
      httpUrl: 'http://example.com:8443/app',
    });
  });

  it('target vacío → error', () => {
    const result = normalizeTarget('   ');
    expect('error' in result).toBe(true);
  });

  it('target basura → error', () => {
    const result = normalizeTarget('no es una url');
    expect('error' in result).toBe(true);
  });

  it('protocolo no soportado → error', () => {
    const result = normalizeTarget('ftp://example.com');
    expect('error' in result).toBe(true);
  });
});

// --- evaluateHealth (puro, sin mocks) -------------------------------------

describe('evaluateHealth', () => {
  it('200 limpio → sano (exit 0), todas las verificaciones pasan', () => {
    const report = evaluateHealth({ https: { ok: true, status: 200, body: 'ok' } }, {});
    expect(report.exitCode).toBe(DOCTOR_EXIT.HEALTHY);
    expect(report.healthy).toBe(true);
    expect(report.checks.every((c) => c.passed)).toBe(true);
  });

  it('error de conexión (ok:false) → exit 2 (HTTPS)', () => {
    const report = evaluateHealth(
      { https: { ok: false, errorCode: 'ECONNREFUSED', errorMessage: 'rechazada' } },
      {}
    );
    expect(report.exitCode).toBe(DOCTOR_EXIT.HTTPS_UNREACHABLE);
    expect(report.reason).toContain('HTTPS');
  });

  it('503 → exit 4 "app no levantada" (NO página base)', () => {
    const report = evaluateHealth({ https: { ok: true, status: 503, body: '' } }, {});
    expect(report.exitCode).toBe(DOCTOR_EXIT.APP_NOT_UP);
    expect(report.reason).toContain('5xx');
  });

  it('404 → exit 3 página base', () => {
    const report = evaluateHealth({ https: { ok: true, status: 404, body: '' } }, {});
    expect(report.exitCode).toBe(DOCTOR_EXIT.BASE_PAGE_FAILED);
  });

  it('200 pero expectContent ausente → exit 4', () => {
    const report = evaluateHealth(
      { https: { ok: true, status: 200, body: 'hola mundo' } },
      { expectContent: 'MARCADOR' }
    );
    expect(report.exitCode).toBe(DOCTOR_EXIT.APP_NOT_UP);
    expect(report.reason).toContain('contenido');
  });

  it('200 con expectContent presente → exit 0', () => {
    const report = evaluateHealth(
      { https: { ok: true, status: 200, body: 'antes MARCADOR despues' } },
      { expectContent: 'MARCADOR' }
    );
    expect(report.exitCode).toBe(DOCTOR_EXIT.HEALTHY);
  });

  it('checkRedirect con redirect ok (308→https) → pasa', () => {
    const report = evaluateHealth(
      {
        https: { ok: true, status: 200, body: 'ok' },
        redirect: { ok: true, status: 308, location: 'https://example.com/' },
      },
      { checkRedirect: true }
    );
    expect(report.exitCode).toBe(DOCTOR_EXIT.HEALTHY);
    expect(report.checks.find((c) => c.name.includes('Redirección'))?.passed).toBe(true);
  });

  it('checkRedirect con redirect que devuelve 200 (sin redirección) → exit 5', () => {
    const report = evaluateHealth(
      {
        https: { ok: true, status: 200, body: 'ok' },
        redirect: { ok: true, status: 200, body: 'sin redirect' },
      },
      { checkRedirect: true }
    );
    expect(report.exitCode).toBe(DOCTOR_EXIT.REDIRECT_FAILED);
  });

  it('checkRedirect false → la redirección no se evalúa', () => {
    const report = evaluateHealth(
      { https: { ok: true, status: 200, body: 'ok' } },
      { checkRedirect: false }
    );
    expect(report.checks.find((c) => c.name.includes('Redirección'))).toBeUndefined();
    expect(report.exitCode).toBe(DOCTOR_EXIT.HEALTHY);
  });

  it('precedencia: 503 + contenido ausente reporta 5xx (exit 4 por 5xx, no por contenido)', () => {
    const report = evaluateHealth(
      { https: { ok: true, status: 503, body: '' } },
      { expectContent: 'X' }
    );
    expect(report.exitCode).toBe(DOCTOR_EXIT.APP_NOT_UP);
    expect(report.reason).toContain('5xx');
  });
});

// --- probeWithRetry (sonda inyectada + sleep no-op) -----------------------

describe('probeWithRetry', () => {
  it('reintenta ante ECONNREFUSED y luego pasa con un 200', async () => {
    const fake = fakeProbeQueue([
      { ok: false, errorCode: 'ECONNREFUSED' },
      { ok: false, errorCode: 'ECONNREFUSED' },
      { ok: true, status: 200, body: 'ok' },
    ]);
    const result = await probeWithRetry(
      'https://x',
      { ...RETRY_BASE, kind: 'https', retries: 10 },
      { probe: fake.probe, sleep: noopSleep }
    );
    expect(result.status).toBe(200);
    expect(fake.calls()).toBe(3);
  });

  it('reintenta ante 5xx y luego pasa con un 200', async () => {
    const fake = fakeProbeQueue([
      { ok: true, status: 503, body: '' },
      { ok: true, status: 200, body: 'ok' },
    ]);
    const result = await probeWithRetry(
      'https://x',
      { ...RETRY_BASE, kind: 'https', retries: 10 },
      { probe: fake.probe, sleep: noopSleep }
    );
    expect(result.status).toBe(200);
    expect(fake.calls()).toBe(2);
  });

  it('reintenta cuando falta expectContent y luego aparece', async () => {
    const fake = fakeProbeQueue([
      { ok: true, status: 200, body: 'todavia no' },
      { ok: true, status: 200, body: 'ya aparece MARCADOR' },
    ]);
    const result = await probeWithRetry(
      'https://x',
      { ...RETRY_BASE, kind: 'https', retries: 10, expectContent: 'MARCADOR' },
      { probe: fake.probe, sleep: noopSleep }
    );
    expect(result.body).toContain('MARCADOR');
    expect(fake.calls()).toBe(2);
  });

  it('se rinde tras `retries` intentos y devuelve el último resultado', async () => {
    const fake = fakeProbeQueue([
      { ok: false, errorCode: 'ECONNREFUSED' },
      { ok: false, errorCode: 'ECONNREFUSED' },
      { ok: false, errorCode: 'ETIMEDOUT' },
      { ok: false, errorCode: 'ENOTFOUND' },
    ]);
    const result = await probeWithRetry(
      'https://x',
      { ...RETRY_BASE, kind: 'https', retries: 3 },
      { probe: fake.probe, sleep: noopSleep }
    );
    expect(fake.calls()).toBe(3);
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('ETIMEDOUT');
  });

  it('NO reintenta un 200 limpio que ya satisface (sonda llamada una vez)', async () => {
    const fake = fakeProbeQueue([{ ok: true, status: 200, body: 'ok' }]);
    const result = await probeWithRetry(
      'https://x',
      { ...RETRY_BASE, kind: 'https', retries: 10 },
      { probe: fake.probe, sleep: noopSleep }
    );
    expect(result.status).toBe(200);
    expect(fake.calls()).toBe(1);
  });

  it('la sonda redirect solo reintenta errores de red, no un 200', async () => {
    const fake = fakeProbeQueue([{ ok: true, status: 200, body: 'sin redirect' }]);
    const result = await probeWithRetry(
      'http://x',
      { ...RETRY_BASE, kind: 'redirect', retries: 10 },
      { probe: fake.probe, sleep: noopSleep }
    );
    expect(result.status).toBe(200);
    expect(fake.calls()).toBe(1);
  });
});

// --- doctorCommand (sondas + logger inyectados) ---------------------------

/** Captura las líneas logueadas por el comando. */
function captureLogger(): { logger: (line: string) => void; lines: () => string[] } {
  const out: string[] = [];
  return { logger: (line: string) => out.push(line), lines: () => out };
}

const once = (r: HttpProbeResult) => async (): Promise<HttpProbeResult> => r;

describe('doctorCommand', () => {
  it('devuelve 0 para un target sano', async () => {
    const cap = captureLogger();
    const code = await doctorCommand(
      'example.com',
      {},
      { probeHttps: once({ ok: true, status: 200, body: 'ok' }), logger: cap.logger }
    );
    expect(code).toBe(DOCTOR_EXIT.HEALTHY);
  });

  it('devuelve 2 cuando HTTPS no responde', async () => {
    const cap = captureLogger();
    const code = await doctorCommand(
      'example.com',
      {},
      { probeHttps: once({ ok: false, errorCode: 'ECONNREFUSED' }), logger: cap.logger }
    );
    expect(code).toBe(DOCTOR_EXIT.HTTPS_UNREACHABLE);
  });

  it('devuelve 3 para un 404', async () => {
    const cap = captureLogger();
    const code = await doctorCommand(
      'example.com',
      {},
      { probeHttps: once({ ok: true, status: 404, body: '' }), logger: cap.logger }
    );
    expect(code).toBe(DOCTOR_EXIT.BASE_PAGE_FAILED);
  });

  it('devuelve 4 para un 503', async () => {
    const cap = captureLogger();
    const code = await doctorCommand(
      'example.com',
      {},
      { probeHttps: once({ ok: true, status: 503, body: '' }), logger: cap.logger }
    );
    expect(code).toBe(DOCTOR_EXIT.APP_NOT_UP);
  });

  it('devuelve 5 cuando la redirección falla', async () => {
    const cap = captureLogger();
    const code = await doctorCommand(
      'example.com',
      { checkRedirect: true },
      {
        probeHttps: once({ ok: true, status: 200, body: 'ok' }),
        probeHttp: once({ ok: true, status: 200, body: 'sin redirect' }),
        logger: cap.logger,
      }
    );
    expect(code).toBe(DOCTOR_EXIT.REDIRECT_FAILED);
  });

  it('target inválido → devuelve 1', async () => {
    const cap = captureLogger();
    const code = await doctorCommand('no es una url', {}, { logger: cap.logger });
    expect(code).toBe(DOCTOR_EXIT.USAGE);
  });

  it('--json emite JSON válido con healthy/exitCode/checks', async () => {
    const cap = captureLogger();
    const code = await doctorCommand(
      'example.com',
      { json: true },
      { probeHttps: once({ ok: true, status: 200, body: 'ok' }), logger: cap.logger }
    );
    expect(code).toBe(DOCTOR_EXIT.HEALTHY);
    const parsed = JSON.parse(cap.lines().join('\n'));
    expect(parsed.healthy).toBe(true);
    expect(parsed.exitCode).toBe(0);
    expect(Array.isArray(parsed.checks)).toBe(true);
    expect(parsed.target).toBe('https://example.com/');
  });

  it('snapshot del reporte humano: caso sano', async () => {
    const cap = captureLogger();
    await doctorCommand(
      'example.com',
      {},
      { probeHttps: once({ ok: true, status: 200, body: 'ok' }), logger: cap.logger }
    );
    expect(cap.lines().join('\n')).toMatchSnapshot();
  });

  it('snapshot del reporte humano: caso con fallo (503)', async () => {
    const cap = captureLogger();
    await doctorCommand(
      'example.com',
      {},
      { probeHttps: once({ ok: true, status: 503, body: '' }), logger: cap.logger }
    );
    expect(cap.lines().join('\n')).toMatchSnapshot();
  });
});
