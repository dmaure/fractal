/**
 * Tests para timeout del bridge
 * Cubre AC-5 de SPEC-0002
 */

import { describe, it, expect, vi } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import {
  withTimeout,
  createTimeoutWrapper,
  TimeoutError,
  DEFAULT_TIMEOUT_MS,
} from './timeout.js';

describe('timeout', () => {
  describe('DEFAULT_TIMEOUT_MS', () => {
    it('debe ser 5 minutos (300,000 ms)', () => {
      expect(DEFAULT_TIMEOUT_MS).toBe(5 * 60 * 1000);
    });
  });

  describe('withTimeout', () => {
    it('debe completar operaciones rápidas sin timeout', async () => {
      const child = spawn('echo', ['test']);
      
      const result = await withTimeout(
        () => ({
          promise: new Promise<string>((resolve) => {
            setTimeout(() => resolve('success'), 10);
          }),
          childProcess: child,
        }),
        { timeoutMs: 1000 }
      );

      expect(result).toBe('success');
    });

    it('debe lanzar TimeoutError si se excede el timeout', async () => {
      const child = spawn('sleep', ['10']);
      
      const startTime = Date.now();
      
      await expect(
        withTimeout(
          () => ({
            promise: new Promise<string>((resolve) => {
              // Nunca se resuelve
              setTimeout(() => resolve('should not happen'), 60000);
            }),
            childProcess: child,
          }),
          { timeoutMs: 100 }
        )
      ).rejects.toThrow(TimeoutError);

      const elapsed = Date.now() - startTime;
      
      // Debe haber tardado aproximadamente 100ms (con margen)
      expect(elapsed).toBeGreaterThanOrEqual(100);
      expect(elapsed).toBeLessThan(500);

      // Limpiar el proceso
      if (child.pid && !child.killed) {
        child.kill('SIGKILL');
      }
    }, 10000);

    it('debe incluir el PID en el TimeoutError', async () => {
      const child = spawn('sleep', ['10']);
      const childPid = child.pid;
      
      try {
        await withTimeout(
          () => ({
            promise: new Promise<string>(() => {
              // Nunca se resuelve
            }),
            childProcess: child,
          }),
          { timeoutMs: 100 }
        );
        expect.fail('Debería haber lanzado TimeoutError');
      } catch (error) {
        expect(error).toBeInstanceOf(TimeoutError);
        if (error instanceof TimeoutError) {
          expect(error.pid).toBe(childPid);
          expect(error.message).toContain('100ms');
        }
      } finally {
        // Limpiar el proceso
        if (child.pid && !child.killed) {
          child.kill('SIGKILL');
        }
      }
    }, 10000);

    it('debe usar DEFAULT_TIMEOUT_MS si no se especifica timeout', async () => {
      const child = spawn('echo', ['test']);
      
      // Mock de setTimeout para verificar que se usa el timeout correcto
      const originalSetTimeout = global.setTimeout;
      let capturedTimeout = 0;

      global.setTimeout = ((fn: () => void, ms: number) => {
        capturedTimeout = ms;
        return originalSetTimeout(fn, ms);
      }) as typeof setTimeout;

      try {
        await withTimeout(
          () => ({
            promise: Promise.resolve('success'),
            childProcess: child,
          })
          // Sin especificar timeoutMs
        );

        expect(capturedTimeout).toBe(DEFAULT_TIMEOUT_MS);
      } finally {
        global.setTimeout = originalSetTimeout;
      }
    });

    it('debe matar el proceso hijo con SIGTERM al timeout', async () => {
      const child = spawn('sleep', ['10']);
      const childPid = child.pid!;

      let killSignal: NodeJS.Signals | undefined;
      const originalKill = child.kill.bind(child);
      child.kill = vi.fn((signal?: NodeJS.Signals) => {
        if (!killSignal) {
          killSignal = signal ?? 'SIGTERM';
        }
        return originalKill(signal);
      });

      try {
        await withTimeout(
          () => ({
            promise: new Promise<void>(() => {
              // Nunca se resuelve
            }),
            childProcess: child,
          }),
          { timeoutMs: 100 }
        );
      } catch (error) {
        expect(error).toBeInstanceOf(TimeoutError);
      }

      // Debe haber llamado a kill con SIGTERM
      expect(child.kill).toHaveBeenCalled();
      expect(killSignal).toBe('SIGTERM');

      // Limpiar
      if (!child.killed) {
        originalKill('SIGKILL');
      }
    }, 10000);

    it('debe propagar errores de la promesa original', async () => {
      const child = spawn('echo', ['test']);
      
      await expect(
        withTimeout(
          () => ({
            promise: Promise.reject(new Error('Test error')),
            childProcess: child,
          }),
          { timeoutMs: 1000 }
        )
      ).rejects.toThrow('Test error');
    });
  });

  describe('createTimeoutWrapper', () => {
    it('debe resolver cuando el proceso termina con código 0', async () => {
      const child = spawn('echo', ['test']);
      
      await expect(
        createTimeoutWrapper(child, { timeoutMs: 5000 })
      ).resolves.toBeUndefined();
    });

    it('debe rechazar cuando el proceso termina con código no-cero', async () => {
      const child = spawn('sh', ['-c', 'exit 1']);
      
      await expect(
        createTimeoutWrapper(child, { timeoutMs: 5000 })
      ).rejects.toThrow('El proceso terminó con código 1');
    });

    it('debe rechazar con TimeoutError si excede el timeout', async () => {
      const child = spawn('sleep', ['10']);
      
      await expect(
        createTimeoutWrapper(child, { timeoutMs: 100 })
      ).rejects.toThrow(TimeoutError);

      // Limpiar
      if (child.pid && !child.killed) {
        child.kill('SIGKILL');
      }
    }, 10000);

    it('debe rechazar en error del proceso', async () => {
      // Comando que no existe
      const child = spawn('comando-inexistente-12345', []);
      
      await expect(
        createTimeoutWrapper(child, { timeoutMs: 5000 })
      ).rejects.toThrow();
    });
  });

  describe('AC-5: timeout sin configuración obligatoria', () => {
    it('debe funcionar sin especificar timeoutMs', async () => {
      const child = spawn('echo', ['test']);
      
      const result = await withTimeout(() => ({
        promise: Promise.resolve('success'),
        childProcess: child,
      }));

      expect(result).toBe('success');
    });

    it('debe permitir override del timeout', async () => {
      const child = spawn('sleep', ['1']);
      
      // Con timeout muy corto
      await expect(
        createTimeoutWrapper(child, { timeoutMs: 50 })
      ).rejects.toThrow(TimeoutError);

      // Limpiar
      if (child.pid && !child.killed) {
        child.kill('SIGKILL');
      }
    }, 10000);
  });

  describe('integración: proceso que nunca responde', () => {
    it('debe cortar el proceso y reportar timeout sin dejar huérfanos', async () => {
      // Proceso que corre por mucho tiempo
      const child = spawn('sleep', ['300']);
      const childPid = child.pid!;

      expect(childPid).toBeGreaterThan(0);

      // Verificar que el proceso está vivo
      expect(() => process.kill(childPid, 0)).not.toThrow();

      try {
        await createTimeoutWrapper(child, { timeoutMs: 200 });
        expect.fail('Debería haber lanzado TimeoutError');
      } catch (error) {
        expect(error).toBeInstanceOf(TimeoutError);
      }

      // Esperar un poco para que el proceso sea matado
      await new Promise((resolve) => setTimeout(resolve, 500));

      // El proceso debe estar muerto
      try {
        process.kill(childPid, 0);
        // Si llegamos aquí, el proceso todavía está vivo - matarlo
        process.kill(childPid, 'SIGKILL');
        expect.fail('El proceso debería estar muerto');
      } catch (error: unknown) {
        const err = error as NodeJS.ErrnoException;
        expect(err.code).toBe('ESRCH'); // Proceso no existe
      }
    }, 15000);
  });

  describe('race condition entre timeout y completion', () => {
    it('debe manejar correctamente cuando el proceso termina justo antes del timeout', async () => {
      // Proceso que termina justo antes del timeout
      const child = spawn('sh', ['-c', 'sleep 0.05 && echo done']);
      
      await expect(
        createTimeoutWrapper(child, { timeoutMs: 100 })
      ).resolves.toBeUndefined();
    });

    it('debe manejar correctamente cuando el proceso termina justo después del timeout', async () => {
      const child = spawn('sh', ['-c', 'sleep 0.15 && echo done']);
      
      await expect(
        createTimeoutWrapper(child, { timeoutMs: 100 })
      ).rejects.toThrow(TimeoutError);

      // Limpiar
      if (child.pid && !child.killed) {
        child.kill('SIGKILL');
      }
    }, 10000);
  });
});
