import { describe, it, expect, vi } from 'vitest';
import {
  isTransientSshError,
  reconnectWithRetry,
  SSH_RECONNECT_DEADLINE_MS,
  SSH_RECONNECT_BASE_DELAY_MS,
  SSH_RECONNECT_MAX_DELAY_MS,
  type SshReconnectResult,
} from './reconnect.js';

const ok = (): SshReconnectResult => ({ success: true });
const fail = (error: string): SshReconnectResult => ({ success: false, error });

describe('reconnect', () => {
  describe('constantes', () => {
    it('usa un presupuesto por defecto de ~90s y backoff acotado', () => {
      expect(SSH_RECONNECT_DEADLINE_MS).toBe(90_000);
      expect(SSH_RECONNECT_BASE_DELAY_MS).toBe(2_000);
      expect(SSH_RECONNECT_MAX_DELAY_MS).toBe(10_000);
    });
  });

  describe('isTransientSshError', () => {
    it('es transitorio para los errores de rechazo/corte/timeout durante el reinicio de sshd', () => {
      expect(
        isTransientSshError('Error de conexión SSH: connect ECONNREFUSED 1.2.3.4:22'),
      ).toBe(true);
      expect(
        isTransientSshError('Error de conexión SSH: read ECONNRESET'),
      ).toBe(true);
      expect(
        isTransientSshError('Error de conexión SSH: connect ETIMEDOUT 1.2.3.4:22'),
      ).toBe(true);
      expect(
        isTransientSshError('Timed out while waiting for handshake'),
      ).toBe(true);
      expect(
        isTransientSshError('Timeout: no se pudo conectar al servidor en el tiempo esperado'),
      ).toBe(true);
    });

    it('no es transitorio para undefined', () => {
      expect(isTransientSshError(undefined)).toBe(false);
    });

    it('NO es transitorio para un error de autenticación', () => {
      expect(
        isTransientSshError(
          'Error de conexión SSH: All configured authentication methods failed',
        ),
      ).toBe(false);
    });

    it('no es transitorio para un error desconocido/no relacionado', () => {
      expect(
        isTransientSshError('Error de conexión SSH: clave del host no coincide'),
      ).toBe(false);
    });

    it('da precedencia a la autenticación aunque aparezca una palabra transitoria', () => {
      expect(
        isTransientSshError(
          'All configured authentication methods failed (Timeout)',
        ),
      ).toBe(false);
    });
  });

  describe('reconnectWithRetry', () => {
    it('devuelve de inmediato al primer intento exitoso sin dormir', async () => {
      const connect = vi.fn<() => Promise<SshReconnectResult>>().mockResolvedValue(ok());
      const sleep = vi.fn().mockResolvedValue(undefined);

      const result = await reconnectWithRetry(connect, { sleep });

      expect(result).toEqual({ success: true });
      expect(connect).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it('reintenta ante ECONNREFUSED y luego tiene éxito con backoff exponencial', async () => {
      const connect = vi
        .fn<() => Promise<SshReconnectResult>>()
        .mockResolvedValueOnce(fail('connect ECONNREFUSED 1.2.3.4:22'))
        .mockResolvedValueOnce(fail('connect ECONNREFUSED 1.2.3.4:22'))
        .mockResolvedValueOnce(fail('connect ECONNREFUSED 1.2.3.4:22'))
        .mockResolvedValueOnce(ok());
      const sleep = vi.fn().mockResolvedValue(undefined);
      // `now` constante: el presupuesto nunca vence en este test.
      const now = vi.fn(() => 0);

      const result = await reconnectWithRetry(connect, { sleep, now });

      expect(result).toEqual({ success: true });
      expect(connect).toHaveBeenCalledTimes(4);
      // Backoff exponencial: 2000, 4000, 8000 (todos < maxDelayMs 10000).
      expect(sleep.mock.calls.map((c) => c[0])).toEqual([2000, 4000, 8000]);
    });

    it('acota el backoff al tope maxDelayMs por defecto', async () => {
      const connect = vi
        .fn<() => Promise<SshReconnectResult>>()
        .mockResolvedValueOnce(fail('ECONNREFUSED'))
        .mockResolvedValueOnce(fail('ECONNREFUSED'))
        .mockResolvedValueOnce(fail('ECONNREFUSED'))
        .mockResolvedValueOnce(fail('ECONNREFUSED'))
        .mockResolvedValueOnce(ok());
      const sleep = vi.fn().mockResolvedValue(undefined);
      const now = vi.fn(() => 0);

      await reconnectWithRetry(connect, { sleep, now });

      // 2000, 4000, 8000, min(16000, 10000)=10000.
      expect(sleep.mock.calls.map((c) => c[0])).toEqual([2000, 4000, 8000, 10000]);
    });

    it('NO reintenta ante un error de autenticación (un solo intento)', async () => {
      const authResult = fail(
        'Error de conexión SSH: All configured authentication methods failed',
      );
      const connect = vi
        .fn<() => Promise<SshReconnectResult>>()
        .mockResolvedValue(authResult);
      const sleep = vi.fn().mockResolvedValue(undefined);

      const result = await reconnectWithRetry(connect, { sleep });

      expect(result).toBe(authResult);
      expect(connect).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it('NO reintenta ante un error desconocido/no transitorio (un solo intento)', async () => {
      const unknownResult = fail('Error de conexión SSH: la clave del host no coincide');
      const connect = vi
        .fn<() => Promise<SshReconnectResult>>()
        .mockResolvedValue(unknownResult);
      const sleep = vi.fn().mockResolvedValue(undefined);

      const result = await reconnectWithRetry(connect, { sleep });

      expect(result).toBe(unknownResult);
      expect(connect).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it('se rinde al agotar el presupuesto y devuelve el último fallo', async () => {
      const lastFail = fail('connect ECONNREFUSED 1.2.3.4:22');
      const connect = vi
        .fn<() => Promise<SshReconnectResult>>()
        .mockResolvedValue(lastFail);
      const sleep = vi.fn().mockResolvedValue(undefined);
      // `now` avanza más allá del deadline en la primera comprobación de tiempo.
      let t = 0;
      const now = vi.fn(() => {
        const current = t;
        t += 100_000; // supera el deadline por defecto (90_000) tras la 1ª lectura.
        return current;
      });
      const logger = vi.fn();

      const result = await reconnectWithRetry(connect, { sleep, now, logger });

      expect(result).toEqual({ success: false, error: 'connect ECONNREFUSED 1.2.3.4:22' });
      // 1er intento falla, se comprueba el tiempo (ya vencido) y se rinde: nunca duerme.
      expect(connect).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
      expect(logger).toHaveBeenCalledWith(expect.stringContaining('presupuesto'));
    });

    it('respeta el override de isRetryable', async () => {
      const connect = vi
        .fn<() => Promise<SshReconnectResult>>()
        .mockResolvedValueOnce(fail('error raro propio del dominio'))
        .mockResolvedValueOnce(ok());
      const sleep = vi.fn().mockResolvedValue(undefined);
      const now = vi.fn(() => 0);
      // isRetryable a medida: reintenta ante "error raro", que el default ignoraría.
      const isRetryable = (error: string | undefined): boolean =>
        !!error && error.includes('raro');

      const result = await reconnectWithRetry(connect, { sleep, now, isRetryable });

      expect(result).toEqual({ success: true });
      expect(connect).toHaveBeenCalledTimes(2);
      expect(sleep).toHaveBeenCalledTimes(1);
    });

    it('usa deadlineMs/baseDelayMs/maxDelayMs personalizados y respeta el tope', async () => {
      const connect = vi
        .fn<() => Promise<SshReconnectResult>>()
        .mockResolvedValueOnce(fail('ECONNREFUSED'))
        .mockResolvedValueOnce(fail('ECONNREFUSED'))
        .mockResolvedValueOnce(fail('ECONNREFUSED'))
        .mockResolvedValueOnce(ok());
      const sleep = vi.fn().mockResolvedValue(undefined);
      const now = vi.fn(() => 0);

      await reconnectWithRetry(connect, {
        sleep,
        now,
        deadlineMs: 60_000,
        baseDelayMs: 1_000,
        maxDelayMs: 1_500,
      });

      // 1000, min(2000,1500)=1500, min(4000,1500)=1500.
      expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 1500, 1500]);
    });
  });
});
