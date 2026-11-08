import { describe, it, expect, vi } from 'vitest';
import {
  APT_LOCK_TIMEOUT_OPT,
  APT_LOCK_PROBE_COMMAND,
  CLOUD_INIT_WAIT_COMMAND,
  isAptLockContention,
  waitForAptLock,
  withAptLockRetry,
  type AptExec,
  type AptExecResult,
} from './apt-lock.js';

const ok = (stdout = '', stderr = '', exitCode = 0): AptExecResult => ({
  stdout,
  stderr,
  exitCode,
});

describe('apt-lock', () => {
  describe('constantes', () => {
    it('usa el valor exacto de DPkg::Lock::Timeout de FRA-76', () => {
      expect(APT_LOCK_TIMEOUT_OPT).toBe('-o DPkg::Lock::Timeout=300');
    });

    it('el probe reutiliza las strings fuser/flock verbatim del allowlist', () => {
      expect(APT_LOCK_PROBE_COMMAND).toContain(
        'sudo fuser /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock'
      );
      expect(APT_LOCK_PROBE_COMMAND).toContain(
        'sudo flock -n /var/lib/dpkg/lock-frontend -c true'
      );
    });

    it('la espera de cloud-init usa la forma permitida por sudoers', () => {
      expect(CLOUD_INIT_WAIT_COMMAND).toContain('sudo cloud-init status --wait');
    });
  });

  describe('isAptLockContention', () => {
    it('matchea mensajes conocidos de lock de apt/dpkg', () => {
      expect(
        isAptLockContention({
          stderr: 'E: Could not get lock /var/lib/dpkg/lock-frontend',
          exitCode: 1,
        })
      ).toBe(true);
      expect(
        isAptLockContention({
          stderr: 'Could not get lock /var/lib/dpkg/lock. It is held by process 1234',
          exitCode: 100,
        })
      ).toBe(true);
      expect(
        isAptLockContention({
          stderr: 'dpkg frontend lock is locked by another process',
          exitCode: 1,
        })
      ).toBe(true);
      expect(
        isAptLockContention({
          stderr: 'E: Unable to acquire the dpkg frontend lock',
          exitCode: 1,
        })
      ).toBe(true);
    });

    it('no matchea errores no relacionados con el lock', () => {
      expect(
        isAptLockContention({
          stderr: 'E: Unable to locate package certbot',
          exitCode: 100,
        })
      ).toBe(false);
      expect(
        isAptLockContention({ stderr: 'DNS validation failed', exitCode: 1 })
      ).toBe(false);
    });

    it('nunca considera contención un exitCode 0', () => {
      expect(
        isAptLockContention({ stderr: 'Could not get lock', exitCode: 0 })
      ).toBe(false);
    });
  });

  describe('waitForAptLock', () => {
    it('retorna pronto cuando el lock está libre (un solo probe)', async () => {
      const exec = vi
        .fn<AptExec>()
        .mockResolvedValueOnce(ok()) // cloud-init
        .mockResolvedValueOnce(ok('FREE')); // probe -> libre
      const sleep = vi.fn().mockResolvedValue(undefined);

      await waitForAptLock(exec, { sleep });

      expect(exec).toHaveBeenCalledTimes(2);
      expect(sleep).not.toHaveBeenCalled();
      // El probe pasado a exec contiene las strings fuser/flock exactas.
      const probeCmd = exec.mock.calls[1][0];
      expect(probeCmd).toContain('sudo fuser /var/lib/dpkg/lock-frontend');
      expect(probeCmd).toContain('sudo flock -n /var/lib/dpkg/lock-frontend -c true');
    });

    it('hace polling y procede cuando el lock se libera', async () => {
      const exec = vi
        .fn<AptExec>()
        .mockResolvedValueOnce(ok()) // cloud-init
        .mockResolvedValueOnce(ok('')) // probe -> tomado
        .mockResolvedValueOnce(ok('')) // probe -> tomado
        .mockResolvedValueOnce(ok('FREE')); // probe -> libre
      const sleep = vi.fn().mockResolvedValue(undefined);

      await waitForAptLock(exec, { sleep });

      // cloud-init + 3 probes
      expect(exec).toHaveBeenCalledTimes(4);
      expect(sleep).toHaveBeenCalledTimes(2);
    });

    it('espera cloud-init antes del polling', async () => {
      const exec = vi
        .fn<AptExec>()
        .mockResolvedValueOnce(ok()) // cloud-init
        .mockResolvedValueOnce(ok('FREE'));
      const sleep = vi.fn().mockResolvedValue(undefined);

      await waitForAptLock(exec, { sleep });

      expect(exec.mock.calls[0][0]).toContain('sudo cloud-init status --wait');
    });

    it('degrada con elegancia tras el deadline (no lanza)', async () => {
      // El lock nunca se libera (siempre tomado). `now` avanza más allá del
      // deadline para no esperar de verdad.
      let t = 0;
      const now = vi.fn(() => {
        const current = t;
        t += 200; // cada lectura avanza 200ms
        return current;
      });
      const exec = vi.fn<AptExec>().mockResolvedValue(ok('')); // siempre tomado
      const sleep = vi.fn().mockResolvedValue(undefined);
      const warn = vi.fn();

      await expect(
        waitForAptLock(exec, {
          sleep,
          now,
          deadlineMs: 500,
          logger: { warn },
        })
      ).resolves.toBeUndefined();

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('apt/dpkg');
    });

    it('no bloquea el deploy si el propio probe falla', async () => {
      const exec = vi
        .fn<AptExec>()
        .mockResolvedValueOnce(ok()) // cloud-init
        .mockRejectedValueOnce(new Error('ssh caído')); // probe falla
      const sleep = vi.fn().mockResolvedValue(undefined);

      await expect(waitForAptLock(exec, { sleep })).resolves.toBeUndefined();
      expect(sleep).not.toHaveBeenCalled();
    });
  });

  describe('withAptLockRetry', () => {
    it('tiene éxito al primer intento sin reintentar', async () => {
      const fn = vi.fn().mockResolvedValue('ok');
      const sleep = vi.fn().mockResolvedValue(undefined);

      const result = await withAptLockRetry(fn, { sleep });

      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it('reintenta ante contención del lock y luego tiene éxito', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(
          new Error('E: Could not get lock /var/lib/dpkg/lock-frontend')
        )
        .mockRejectedValueOnce(
          new Error('E: Could not get lock /var/lib/dpkg/lock-frontend')
        )
        .mockResolvedValueOnce('ok');
      const sleep = vi.fn().mockResolvedValue(undefined);

      const result = await withAptLockRetry(fn, {
        sleep,
        baseDelayMs: 1000,
      });

      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(3);
      // Backoff exponencial creciente: 1000ms, 2000ms.
      expect(sleep).toHaveBeenCalledTimes(2);
      expect(sleep.mock.calls[0][0]).toBe(1000);
      expect(sleep.mock.calls[1][0]).toBe(2000);
    });

    it('respeta el tope de backoff (maxDelayMs)', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Could not get lock'))
        .mockRejectedValueOnce(new Error('Could not get lock'))
        .mockRejectedValueOnce(new Error('Could not get lock'))
        .mockResolvedValueOnce('ok');
      const sleep = vi.fn().mockResolvedValue(undefined);

      await withAptLockRetry(fn, {
        sleep,
        attempts: 5,
        baseDelayMs: 1000,
        maxDelayMs: 1500,
      });

      // 1000, min(2000,1500)=1500, min(4000,1500)=1500
      expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 1500, 1500]);
    });

    it('se rinde tras agotar los intentos y relanza el último error', async () => {
      const lockError = new Error('Could not get lock /var/lib/dpkg/lock-frontend');
      const fn = vi.fn().mockRejectedValue(lockError);
      const sleep = vi.fn().mockResolvedValue(undefined);

      await expect(
        withAptLockRetry(fn, { sleep, attempts: 3, baseDelayMs: 1 })
      ).rejects.toBe(lockError);

      expect(fn).toHaveBeenCalledTimes(3);
      expect(sleep).toHaveBeenCalledTimes(2);
    });

    it('no reintenta ante un error que no es de lock (relanza de inmediato)', async () => {
      const otherError = new Error('E: Unable to locate package certbot');
      const fn = vi.fn().mockRejectedValue(otherError);
      const sleep = vi.fn().mockResolvedValue(undefined);

      await expect(withAptLockRetry(fn, { sleep })).rejects.toBe(otherError);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    });
  });
});
