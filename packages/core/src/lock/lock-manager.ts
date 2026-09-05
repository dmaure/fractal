/**
 * Gestión de lock de concurrencia para prevenir ejecuciones simultáneas
 * de Fractal sobre el mismo proyecto.
 * 
 * Implementa AC-7 y AC-8 de SPEC-0002.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export interface LockInfo {
  pid: number;
  timestamp: number;
}

export class LockError extends Error {
  constructor(
    message: string,
    public readonly code: 'LOCK_HELD' | 'LOCK_FAILED'
  ) {
    super(message);
    this.name = 'LockError';
  }
}

/**
 * Verifica si un proceso está vivo sin matarlo.
 * En Node.js, process.kill(pid, 0) no envía señal, solo verifica existencia.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    // ESRCH = proceso no existe
    // EPERM = proceso existe pero no tenemos permiso para matarlo
    if (err.code === 'ESRCH') {
      return false;
    }
    if (err.code === 'EPERM') {
      return true;
    }
    // Otro error, asumimos que el proceso existe por seguridad
    return true;
  }
}

export class LockManager {
  private readonly lockPath: string;
  private acquired = false;

  constructor(projectRoot: string) {
    this.lockPath = join(projectRoot, '.fractal.lock');
  }

  /**
   * Intenta adquirir el lock. Si ya existe, verifica si es huérfano.
   * 
   * @throws {LockError} Si hay otro proceso de Fractal corriendo
   */
  acquire(): void {
    if (existsSync(this.lockPath)) {
      const existingLock = this.readLock();
      
      if (existingLock && isProcessAlive(existingLock.pid)) {
        // Lock activo, proceso vivo
        throw new LockError(
          `Ya hay un comando de Fractal corriendo sobre este proyecto (PID ${existingLock.pid})`,
          'LOCK_HELD'
        );
      }
      
      // Lock huérfano (proceso muerto), lo liberamos
      this.release();
    }

    // Escribir nuestro lock
    const lockInfo: LockInfo = {
      pid: process.pid,
      timestamp: Date.now(),
    };

    try {
      writeFileSync(this.lockPath, JSON.stringify(lockInfo, null, 2), 'utf-8');
      this.acquired = true;
    } catch (error) {
      throw new LockError(
        `No se pudo crear el lock: ${error instanceof Error ? error.message : String(error)}`,
        'LOCK_FAILED'
      );
    }
  }

  /**
   * Libera el lock si fue adquirido por este proceso.
   */
  release(): void {
    if (!existsSync(this.lockPath)) {
      return;
    }

    // Verificar que el lock es nuestro antes de borrarlo
    const currentLock = this.readLock();
    if (currentLock && currentLock.pid === process.pid) {
      try {
        unlinkSync(this.lockPath);
        this.acquired = false;
      } catch (error) {
        // Silencioso en release - mejor dejar el lock que fallar la limpieza
      }
    } else if (!currentLock) {
      // Lock corrupto o ilegible, lo borramos
      try {
        unlinkSync(this.lockPath);
      } catch {
        // Silencioso
      }
    }
  }

  /**
   * Lee el lock existente. Retorna null si no existe o está corrupto.
   */
  private readLock(): LockInfo | null {
    try {
      const content = readFileSync(this.lockPath, 'utf-8');
      const lock = JSON.parse(content) as LockInfo;
      
      if (typeof lock.pid !== 'number' || typeof lock.timestamp !== 'number') {
        return null;
      }
      
      return lock;
    } catch {
      return null;
    }
  }

  /**
   * Retorna si este proceso tiene el lock adquirido.
   */
  isAcquired(): boolean {
    return this.acquired;
  }
}

/**
 * Helper para usar el lock con try/finally automático.
 */
export async function withLock<T>(
  projectRoot: string,
  fn: () => Promise<T>
): Promise<T> {
  const lock = new LockManager(projectRoot);
  
  try {
    lock.acquire();
    return await fn();
  } finally {
    lock.release();
  }
}
