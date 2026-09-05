/**
 * Tests para LockManager
 * Cubre AC-7 y AC-8 de SPEC-0002
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { LockManager, LockError, withLock } from './lock-manager.js';

describe('LockManager', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'fractal-lock-test-'));
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('acquire y release', () => {
    it('debe crear el lock file al adquirir', () => {
      const lock = new LockManager(testDir);
      lock.acquire();

      const lockPath = join(testDir, '.fractal.lock');
      expect(existsSync(lockPath)).toBe(true);
      expect(lock.isAcquired()).toBe(true);

      lock.release();
    });

    it('debe incluir el PID actual en el lock', () => {
      const lock = new LockManager(testDir);
      lock.acquire();

      const lockPath = join(testDir, '.fractal.lock');
      const fs = require('node:fs');
      const content = fs.readFileSync(lockPath, 'utf-8');
      const lockInfo = JSON.parse(content);

      expect(lockInfo.pid).toBe(process.pid);
      expect(typeof lockInfo.timestamp).toBe('number');

      lock.release();
    });

    it('debe eliminar el lock file al liberar', () => {
      const lock = new LockManager(testDir);
      lock.acquire();

      const lockPath = join(testDir, '.fractal.lock');
      expect(existsSync(lockPath)).toBe(true);

      lock.release();
      expect(existsSync(lockPath)).toBe(false);
      expect(lock.isAcquired()).toBe(false);
    });

    it('debe ser idempotente al liberar múltiples veces', () => {
      const lock = new LockManager(testDir);
      lock.acquire();
      lock.release();
      
      expect(() => lock.release()).not.toThrow();
    });
  });

  describe('AC-7: bloqueo de ejecución concurrente', () => {
    it('debe fallar si ya existe un lock con proceso vivo', () => {
      const lock1 = new LockManager(testDir);
      lock1.acquire();

      const lock2 = new LockManager(testDir);
      
      expect(() => lock2.acquire()).toThrow(LockError);
      expect(() => lock2.acquire()).toThrow(/Ya hay un comando de Fractal corriendo/);

      lock1.release();
    });

    it('debe incluir el PID en el mensaje de error', () => {
      const lock1 = new LockManager(testDir);
      lock1.acquire();

      const lock2 = new LockManager(testDir);
      
      try {
        lock2.acquire();
        expect.fail('Debería haber lanzado LockError');
      } catch (error) {
        expect(error).toBeInstanceOf(LockError);
        if (error instanceof LockError) {
          expect(error.message).toContain(`PID ${process.pid}`);
          expect(error.code).toBe('LOCK_HELD');
        }
      }

      lock1.release();
    });
  });

  describe('AC-8: detección de lock huérfano', () => {
    it('debe liberar un lock huérfano y continuar', async () => {
      // Simulamos un lock con PID inexistente
      const fakePid = 999999; // PID muy alto, improbable que exista
      const lockPath = join(testDir, '.fractal.lock');
      const fs = require('node:fs');
      
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ pid: fakePid, timestamp: Date.now() }),
        'utf-8'
      );

      expect(existsSync(lockPath)).toBe(true);

      // Debería detectarlo como huérfano y continuar
      const lock = new LockManager(testDir);
      expect(() => lock.acquire()).not.toThrow();
      expect(lock.isAcquired()).toBe(true);

      lock.release();
    });

    it('debe manejar lock corrupto', () => {
      const lockPath = join(testDir, '.fractal.lock');
      const fs = require('node:fs');
      
      // Lock con JSON inválido
      fs.writeFileSync(lockPath, 'not valid json', 'utf-8');

      const lock = new LockManager(testDir);
      expect(() => lock.acquire()).not.toThrow();
      expect(lock.isAcquired()).toBe(true);

      lock.release();
    });

    it('debe manejar lock con estructura inválida', () => {
      const lockPath = join(testDir, '.fractal.lock');
      const fs = require('node:fs');
      
      // Lock con campos faltantes
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ invalid: 'data' }),
        'utf-8'
      );

      const lock = new LockManager(testDir);
      expect(() => lock.acquire()).not.toThrow();
      expect(lock.isAcquired()).toBe(true);

      lock.release();
    });
  });

  describe('withLock helper', () => {
    it('debe adquirir y liberar el lock automáticamente', async () => {
      let executed = false;

      await withLock(testDir, async () => {
        executed = true;
        const lockPath = join(testDir, '.fractal.lock');
        expect(existsSync(lockPath)).toBe(true);
      });

      expect(executed).toBe(true);
      const lockPath = join(testDir, '.fractal.lock');
      expect(existsSync(lockPath)).toBe(false);
    });

    it('debe liberar el lock incluso si la función falla', async () => {
      const lockPath = join(testDir, '.fractal.lock');

      try {
        await withLock(testDir, async () => {
          expect(existsSync(lockPath)).toBe(true);
          throw new Error('Test error');
        });
        expect.fail('Debería haber propagado el error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        if (error instanceof Error) {
          expect(error.message).toBe('Test error');
        }
      }

      // El lock debe estar liberado
      expect(existsSync(lockPath)).toBe(false);
    });

    it('debe propagar el valor de retorno', async () => {
      const result = await withLock(testDir, async () => {
        return 42;
      });

      expect(result).toBe(42);
    });
  });

  describe('integración con proceso real', () => {
    it('debe detectar correctamente un proceso hijo vivo', async () => {
      // Crear un proceso hijo de larga duración
      const child = spawn('sleep', ['10'], {
        detached: false,
        stdio: 'ignore',
      });

      const childPid = child.pid!;
      expect(childPid).toBeGreaterThan(0);

      try {
        // Crear lock con el PID del hijo
        const lockPath = join(testDir, '.fractal.lock');
        const fs = require('node:fs');
        fs.writeFileSync(
          lockPath,
          JSON.stringify({ pid: childPid, timestamp: Date.now() }),
          'utf-8'
        );

        // Intentar adquirir el lock debe fallar porque el proceso está vivo
        const lock = new LockManager(testDir);
        
        try {
          lock.acquire();
          expect.fail('Debería haber lanzado LockError');
        } catch (error) {
          expect(error).toBeInstanceOf(LockError);
          if (error instanceof LockError) {
            expect(error.code).toBe('LOCK_HELD');
            expect(error.message).toContain(`PID ${childPid}`);
          }
        }
      } finally {
        // Limpiar el proceso hijo
        child.kill('SIGTERM');
        
        // Esperar a que el proceso termine
        await new Promise<void>((resolve) => {
          child.on('exit', () => resolve());
        });
      }
    }, 15000); // Timeout de 15s para este test

    it('debe detectar correctamente un proceso muerto', async () => {
      // Crear un proceso hijo que termina inmediatamente
      const child = spawn('echo', ['test'], {
        detached: false,
        stdio: 'ignore',
      });

      const childPid = child.pid!;
      expect(childPid).toBeGreaterThan(0);

      // Esperar a que el proceso termine
      await new Promise<void>((resolve) => {
        child.on('exit', () => resolve());
      });

      // Crear lock con el PID del proceso ya terminado
      const lockPath = join(testDir, '.fractal.lock');
      const fs = require('node:fs');
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ pid: childPid, timestamp: Date.now() }),
        'utf-8'
      );

      // Debe detectarlo como huérfano y continuar
      const lock = new LockManager(testDir);
      expect(() => lock.acquire()).not.toThrow();
      expect(lock.isAcquired()).toBe(true);

      lock.release();
    }, 10000);
  });
});
