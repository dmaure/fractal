/**
 * Gestión de timeout para invocaciones del bridge.
 * Implementa AC-5 de SPEC-0002.
 */

import { ChildProcess } from 'node:child_process';

export interface TimeoutOptions {
  /**
   * Timeout en milisegundos. Por defecto 5 minutos.
   */
  timeoutMs?: number;
}

export class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly pid?: number
  ) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Timeout por defecto: 5 minutos (300,000 ms).
 * Artículo IV: valor fijo por defecto, sin configuración obligatoria.
 */
export const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Ejecuta una función con timeout. Si excede el tiempo, mata el proceso hijo.
 * 
 * @param fn Función que retorna una promesa y el proceso hijo
 * @param options Opciones de timeout
 * @returns El resultado de la función
 * @throws {TimeoutError} Si se excede el timeout
 */
export async function withTimeout<T>(
  fn: () => { promise: Promise<T>; childProcess: ChildProcess },
  options: TimeoutOptions = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  
  const { promise, childProcess } = fn();
  
  let timeoutId: NodeJS.Timeout | undefined;
  let timedOut = false;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      
      // Intentar matar el proceso hijo
      try {
        if (childProcess.pid && !childProcess.killed) {
          // SIGTERM primero (permite cleanup)
          childProcess.kill('SIGTERM');
          
          // Si no muere en 2 segundos, SIGKILL
          setTimeout(() => {
            if (childProcess.pid && !childProcess.killed) {
              childProcess.kill('SIGKILL');
            }
          }, 2000);
        }
      } catch (error) {
        // Si falla el kill, el proceso ya está muerto o no es accesible
      }
      
      reject(
        new TimeoutError(
          `La operación excedió el timeout de ${timeoutMs}ms`,
          childProcess.pid
        )
      );
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    if (timeoutId && !timedOut) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Crea un wrapper simple para procesos hijo con timeout automático.
 */
export function createTimeoutWrapper(
  childProcess: ChildProcess,
  options: TimeoutOptions = {}
): Promise<void> {
  return withTimeout(
    () => ({
      promise: new Promise<void>((resolve, reject) => {
        childProcess.on('exit', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`El proceso terminó con código ${code ?? 'unknown'}`));
          }
        });

        childProcess.on('error', (error) => {
          reject(error);
        });
      }),
      childProcess,
    }),
    options
  );
}
