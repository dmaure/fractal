/**
 * Bridge Node → toolchain del target
 * 
 * Este módulo implementa el mecanismo de invocación uniforme de adapters,
 * permitiendo al core invocar la toolchain de cualquier target sin conocerla.
 * 
 * Contrato:
 * - El adapter recibe un payload JSON por stdin
 * - El adapter devuelve un JSON por stdout con la forma: {success: boolean, data?: any, error?: {message: string, step?: string}}
 * - El proceso hijo debe terminar con exit code 0 para indicar éxito
 * 
 * @see docs/specs/0002-bridge-node-toolchain.md
 * @see docs/adr/0001-cli-hibrido-node-toolchain.md
 */

import { spawn } from 'node:child_process';

/**
 * Resultado exitoso de la invocación del adapter
 */
export interface AdapterSuccess {
  success: true;
  data: unknown;
}

/**
 * Resultado fallido de la invocación del adapter
 */
export interface AdapterFailure {
  success: false;
  error: {
    message: string;
    step?: string;
    exitCode?: number;
  };
}

/**
 * Resultado de la invocación del adapter
 */
export type AdapterResult = AdapterSuccess | AdapterFailure;

/**
 * Opciones para la invocación del adapter
 */
export interface InvokeAdapterOptions {
  /**
   * Timeout en milisegundos (por defecto: 60000 = 1 minuto)
   */
  timeout?: number;
  
  /**
   * Directorio de trabajo para el proceso hijo
   */
  cwd?: string;
  
  /**
   * Variables de entorno adicionales
   */
  env?: Record<string, string>;
}

/**
 * Invoca un adapter pasándole un payload JSON por stdin y leyendo su respuesta por stdout.
 * 
 * @param command - Comando a ejecutar (ej: "php", "node", etc.) con sus argumentos como array
 * @param payload - Objeto a serializar como JSON y pasar por stdin
 * @param options - Opciones de invocación (timeout, cwd, env)
 * @returns Promesa con el resultado del adapter
 * 
 * @example
 * ```typescript
 * const result = await invokeAdapter(
 *   ['php', 'adapter.php'],
 *   { action: 'create-project', name: 'mi-proyecto' }
 * );
 * 
 * if (result.success) {
 *   console.log('Éxito:', result.data);
 * } else {
 *   console.error('Error:', result.error.message);
 * }
 * ```
 */
export async function invokeAdapter(
  command: string[],
  payload: unknown,
  options: InvokeAdapterOptions = {}
): Promise<AdapterResult> {
  const {
    timeout = 60000,
    cwd = process.cwd(),
    env = {}
  } = options;

  // Validar que el comando no esté vacío
  if (!command || command.length === 0) {
    return {
      success: false,
      error: {
        message: 'El comando no puede estar vacío',
        step: 'validación'
      }
    };
  }

  let payloadJson: string;
  
  // Serializar el payload
  try {
    payloadJson = JSON.stringify(payload);
  } catch (error) {
    return {
      success: false,
      error: {
        message: `Error al serializar el payload: ${error instanceof Error ? error.message : String(error)}`,
        step: 'serialización'
      }
    };
  }

  return new Promise((resolve) => {
    const [executable, ...args] = command;
    
    // Spawn del proceso hijo
    const child = spawn(executable, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let timeoutHandle: NodeJS.Timeout | null = null;

    // Configurar timeout
    if (timeout > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        
        // Si no termina en 5 segundos, forzar con SIGKILL
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
      }, timeout);
    }

    // Capturar stdout
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    // Capturar stderr
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Manejar errores del proceso
    child.on('error', (error) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      
      resolve({
        success: false,
        error: {
          message: `Error al ejecutar el comando "${command.join(' ')}": ${error.message}`,
          step: 'ejecución'
        }
      });
    });

    // Manejar cierre del proceso
    child.on('close', (exitCode) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);

      // Si hubo timeout
      if (timedOut) {
        resolve({
          success: false,
          error: {
            message: `El proceso no respondió en ${timeout}ms y fue terminado`,
            step: 'timeout',
            exitCode: exitCode || undefined
          }
        });
        return;
      }

      // Si el proceso falló
      if (exitCode !== 0) {
        const errorMessage = stderr.trim() || stdout.trim() || 'El proceso terminó con error';
        resolve({
          success: false,
          error: {
            message: errorMessage,
            step: 'ejecución',
            exitCode: exitCode || undefined
          }
        });
        return;
      }

      // El proceso terminó exitosamente, parsear el stdout
      if (!stdout.trim()) {
        resolve({
          success: false,
          error: {
            message: 'El adapter no devolvió ninguna respuesta por stdout',
            step: 'lectura'
          }
        });
        return;
      }

      // Intentar parsear el JSON
      let response: unknown;
      try {
        response = JSON.parse(stdout);
      } catch (error) {
        resolve({
          success: false,
          error: {
            message: `La respuesta del adapter no es un JSON válido: ${error instanceof Error ? error.message : String(error)}`,
            step: 'parseo'
          }
        });
        return;
      }

      // Validar la forma de la respuesta
      if (typeof response !== 'object' || response === null) {
        resolve({
          success: false,
          error: {
            message: 'La respuesta del adapter debe ser un objeto JSON',
            step: 'validación'
          }
        });
        return;
      }

      const typedResponse = response as Record<string, unknown>;

      // Verificar que tenga el campo success
      if (typeof typedResponse.success !== 'boolean') {
        resolve({
          success: false,
          error: {
            message: 'La respuesta del adapter debe incluir un campo "success" de tipo boolean',
            step: 'validación'
          }
        });
        return;
      }

      // Si el adapter reporta error
      if (typedResponse.success === false) {
        const adapterError = typedResponse.error;
        if (typeof adapterError === 'object' && adapterError !== null && 'message' in adapterError) {
          resolve({
            success: false,
            error: adapterError as { message: string; step?: string }
          });
        } else {
          resolve({
            success: false,
            error: {
              message: 'El adapter reportó un error sin especificar el mensaje',
              step: 'adapter'
            }
          });
        }
        return;
      }

      // Éxito
      resolve({
        success: true,
        data: typedResponse.data
      });
    });

    // Enviar el payload por stdin
    child.stdin.write(payloadJson);
    child.stdin.end();
  });
}
