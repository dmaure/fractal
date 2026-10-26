import ssh2 from 'ssh2';
import type { Client as SshClientInstance, ConnectConfig } from 'ssh2';
const { Client } = ssh2;
import { readFile, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { SshConfig, SshCommandResult } from './types.js';
import {
  verifyHostKeyAgainstKnownHosts,
  parsePresentedKey,
  formatKnownHostsLine,
} from './host-key.js';

/**
 * Directorios/archivos excluidos por defecto al subir un proyecto: se
 * regeneran dentro de la imagen o no deben viajar al servidor.
 *
 * `.env` y `.env.*` (p.ej. `.env.production`, `.env.local`) se excluyen SIEMPRE
 * (FRA-76): los archivos de entorno locales del desarrollador no deben
 * empaquetarse ni extraerse sobre el servidor. Incluye `.env.example`, que a
 * propósito tampoco se envía: el `.env` de producción —que contiene
 * `DB_PASSWORD`— vive solo en `/home/deploy/.env`, lo genera
 * `runtime-manager.ts` (`ensureDbPasswordEnv`) DESPUÉS de la subida, y al no
 * viajar en el tar la subida nunca lo pisa.
 */
const DEFAULT_UPLOAD_EXCLUDES = [
  '.git',
  'node_modules',
  'vendor',
  'dist',
  '.env',
  '.env.*',
];

/**
 * Cliente SSH para conexión y ejecución de comandos remotos.
 * Framework-agnostic: no asume ningún framework específico.
 */
export class SshClient {
  private config: SshConfig;
  private hostKeyError?: string;
  /**
   * Línea estilo known_hosts (equivalente a la salida de ssh-keyscan) de la
   * clave del host verificada en la última conexión aceptada. La consume el
   * CLI para imprimir el valor real del secret SSH_KNOWN_HOSTS (FRA-76).
   */
  private knownHostsLine?: string;

  constructor(config: SshConfig) {
    this.config = {
      ...config,
      port: config.port || 22,
      timeout: config.timeout || 10000,
      knownHostsPath:
        config.knownHostsPath || join(homedir(), '.ssh', 'known_hosts'),
    };
  }

  private consumeHostKeyError(): string | undefined {
    const error = this.hostKeyError;
    this.hostKeyError = undefined;
    return error;
  }

  /**
   * Devuelve la línea known_hosts (formato ssh-keyscan: `host tipo base64`) de
   * la clave del host verificada en la última conexión aceptada, o `undefined`
   * si todavía no se verificó ninguna. El CLI la usa para imprimir el valor
   * real del secret SSH_KNOWN_HOSTS en vez de solo describirlo (FRA-76).
   */
  getKnownHostsLine(): string | undefined {
    return this.knownHostsLine;
  }

  /**
   * Verifica la conectividad SSH sin ejecutar ningún comando.
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const client = new Client();
      let connected = false;

      const timeout = setTimeout(() => {
        if (!connected) {
          client.end();
          resolve({
            success: false,
            error: 'Timeout: no se pudo conectar al servidor en el tiempo esperado',
          });
        }
      }, this.config.timeout);

      client.on('ready', () => {
        connected = true;
        clearTimeout(timeout);
        client.end();
        resolve({ success: true });
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        const hostKeyError = this.consumeHostKeyError();
        resolve({
          success: false,
          error: hostKeyError ?? `Error de conexión SSH: ${err.message}`,
        });
      });

      this.connect(client).catch((err) => {
        clearTimeout(timeout);
        const hostKeyError = this.consumeHostKeyError();
        resolve({
          success: false,
          error: hostKeyError ?? `Error al establecer conexión: ${err.message}`,
        });
      });
    });
  }

  /**
   * Ejecuta un comando en el servidor remoto.
   * @param command Comando a ejecutar
   * @param options Opciones adicionales (timeout por comando)
   */
  async executeCommand(
    command: string,
    options?: { timeoutMs?: number }
  ): Promise<SshCommandResult> {
    return new Promise((resolve) => {
      const client = new Client();
      let stdout = '';
      let stderr = '';
      let exitCode: number | null = null;
      let timeoutHandle: NodeJS.Timeout | null = null;
      let commandCompleted = false;

      // Configurar timeout del comando si se especificó
      if (options?.timeoutMs) {
        timeoutHandle = setTimeout(() => {
          if (!commandCompleted) {
            commandCompleted = true;
            client.end();
            resolve({
              success: false,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              exitCode: null,
              error: `Comando excedió el tiempo límite de ${options.timeoutMs}ms`,
            });
          }
        }, options.timeoutMs);
      }

      client.on('ready', () => {
        client.exec(command, (err, stream) => {
          if (err) {
            commandCompleted = true;
            if (timeoutHandle) clearTimeout(timeoutHandle);
            client.end();
            resolve({
              success: false,
              stdout: '',
              stderr: '',
              exitCode: null,
              error: `Error al ejecutar comando: ${err.message}`,
            });
            return;
          }

          stream.on('data', (data: Buffer) => {
            stdout += data.toString();
          });

          stream.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });

          stream.on('close', (code: number) => {
            if (!commandCompleted) {
              commandCompleted = true;
              if (timeoutHandle) clearTimeout(timeoutHandle);
              exitCode = code;
              client.end();
              resolve({
                success: code === 0,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                exitCode,
              });
            }
          });
        });
      });

      client.on('error', (err) => {
        if (!commandCompleted) {
          commandCompleted = true;
          if (timeoutHandle) clearTimeout(timeoutHandle);
          const hostKeyError = this.consumeHostKeyError();
          resolve({
            success: false,
            stdout: '',
            stderr: '',
            exitCode: null,
            error: hostKeyError ?? `Error de conexión: ${err.message}`,
          });
        }
      });

      this.connect(client).catch((err) => {
        if (!commandCompleted) {
          commandCompleted = true;
          if (timeoutHandle) clearTimeout(timeoutHandle);
          const hostKeyError = this.consumeHostKeyError();
          resolve({
            success: false,
            stdout: '',
            stderr: '',
            exitCode: null,
            error: hostKeyError ?? `Error al conectar: ${err.message}`,
          });
        }
      });
    });
  }

  /**
   * Sube un directorio local al servidor remoto.
   *
   * Empaqueta el directorio en un tarball gzip local (excluyendo artefactos
   * que se regeneran, p.ej. node_modules/vendor/.git) y lo extrae en el
   * servidor transmitiéndolo por el canal de ejecución (`tar -xzf -` leyendo de
   * stdin), sin dejar ningún temporal remoto. Se evita `sftp.fastPut` porque se
   * cuelga indefinidamente si la conexión muere a mitad de la transferencia.
   * Framework-agnostic: no asume ningún framework ni tipo de proyecto.
   *
   * Robustez del transporte: la conexión usa keepalive (ver `connect`) para
   * detectar un peer muerto, y la subida se reintenta hasta 3 veces ante fallos
   * de transporte (backoff 2s/4s). Un fallo determinístico de `tar` (código de
   * salida ≠ 0) NO se reintenta. Todos los intentos comparten el mismo
   * presupuesto total `timeoutMs`.
   *
   * @param localPath Ruta del directorio local a subir
   * @param remotePath Ruta destino en el servidor (se crea si no existe)
   * @param options.exclude Patrones a excluir (default: .git, node_modules, vendor, dist)
   * @param options.timeoutMs Presupuesto de tiempo para TODA la subida (pack+transfer+extract,
   *   incluidos todos los reintentos). Si no se especifica, usa `this.config.timeout`
   *   (el readyTimeout de conexión).
   */
  async uploadDirectory(
    localPath: string,
    remotePath: string,
    options?: { exclude?: string[]; timeoutMs?: number }
  ): Promise<{ success: boolean; error?: string }> {
    const excludes = options?.exclude ?? DEFAULT_UPLOAD_EXCLUDES;
    const uploadTimeout = options?.timeoutMs ?? this.config.timeout;

    let tarballPath: string;
    try {
      tarballPath = await this.createTarball(localPath, excludes);
    } catch (err) {
      return {
        success: false,
        error: `No se pudo empaquetar el directorio local: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // El tarball se extrae directamente desde stdin del canal de ejecución, así
    // que no queda ningún temporal remoto que limpiar. Mismo quoting de
    // `remotePath` que la versión por SFTP.
    const extractCmd =
      `mkdir -p '${remotePath}' && ` +
      `tar -xzf - -C '${remotePath}'`;

    try {
      return await new Promise((resolvePromise) => {
        let settled = false;

        const finish = (result: { success: boolean; error?: string }): void => {
          if (settled) return;
          settled = true;
          resolvePromise(result);
        };

        // Presupuesto total para TODA la subida (todos los reintentos incluidos).
        const timeout = setTimeout(() => {
          finish({
            success: false,
            error: 'Timeout: la subida del directorio excedió el tiempo esperado',
          });
        }, uploadTimeout);

        void this.uploadWithRetries(tarballPath, extractCmd, () => settled).then(
          (result) => {
            clearTimeout(timeout);
            finish(result);
          },
          (err) => {
            clearTimeout(timeout);
            finish({
              success: false,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        );
      });
    } finally {
      await rm(tarballPath, { force: true }).catch(() => {});
    }
  }

  /**
   * Sube el tarball reintentando solo ante fallos de transporte, dentro del
   * presupuesto total que controla `uploadDirectory`. Un intento que termina
   * con un código de salida de `tar` ≠ 0 es un fallo determinístico y NO se
   * reintenta. `isSettled` indica que el presupuesto total ya venció: en ese
   * caso no se inician nuevos intentos.
   */
  private async uploadWithRetries(
    tarballPath: string,
    remoteCommand: string,
    isSettled: () => boolean
  ): Promise<{ success: boolean; error?: string }> {
    const maxAttempts = 3;
    const backoffsMs = [2_000, 4_000];
    let lastTransportError = 'error de transporte desconocido';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (isSettled()) break;

      try {
        // Un intento resuelve (éxito o fallo determinístico de tar) o rechaza
        // (fallo de transporte, reintentable).
        return await this.uploadAttempt(tarballPath, remoteCommand);
      } catch (err) {
        lastTransportError = err instanceof Error ? err.message : String(err);
        const backoff = backoffsMs[attempt - 1];
        if (attempt < maxAttempts && backoff !== undefined && !isSettled()) {
          await new Promise<void>((resolveBackoff) => setTimeout(resolveBackoff, backoff));
        }
      }
    }

    return {
      success: false,
      error: `Error de transporte al subir el proyecto tras ${maxAttempts} intentos: ${lastTransportError}`,
    };
  }

  /**
   * Un único intento de subida: conecta, abre un canal de ejecución que corre
   * `tar -xzf -` y le vuelca el tarball por stdin. Resuelve con el resultado
   * cuando `tar` termina (éxito o código ≠ 0, ambos determinísticos) y rechaza
   * ante cualquier fallo de transporte (error del cliente, del canal, de lectura
   * local, o un cierre sin código de salida limpio) para que el reintento lo
   * capture.
   */
  private uploadAttempt(
    tarballPath: string,
    remoteCommand: string
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolveAttempt, rejectAttempt) => {
      const client = new Client();
      let settled = false;

      const resolveOnce = (result: { success: boolean; error?: string }): void => {
        if (settled) return;
        settled = true;
        client.end();
        resolveAttempt(result);
      };

      const rejectOnce = (error: string): void => {
        if (settled) return;
        settled = true;
        client.end();
        rejectAttempt(new Error(error));
      };

      client.on('ready', () => {
        client.exec(remoteCommand, (execErr, stream) => {
          if (execErr) {
            rejectOnce(`Error al abrir el canal de ejecución: ${execErr.message}`);
            return;
          }

          let stderr = '';
          stream.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });
          // Drenar stdout para que el stream fluya hasta el cierre.
          stream.on('data', () => {});

          stream.on('close', (code: number | null) => {
            if (typeof code !== 'number') {
              // Cierre sin código de salida: el canal murió, es transporte.
              rejectOnce('La conexión se cerró antes de terminar la transferencia');
              return;
            }
            resolveOnce({
              success: code === 0,
              error:
                code === 0
                  ? undefined
                  : stderr.trim() || `La extracción remota terminó con código ${code}`,
            });
          });

          const readStream = createReadStream(tarballPath);
          readStream.on('error', (readErr) => {
            rejectOnce(`Error al leer el tarball local: ${readErr.message}`);
          });
          // El pipe cierra stdin al terminar, así `tar -xzf -` recibe EOF.
          readStream.pipe(stream);
        });
      });

      client.on('error', (err) => {
        const hostKeyError = this.consumeHostKeyError();
        rejectOnce(hostKeyError ?? `Error de conexión: ${err.message}`);
      });

      this.connect(client).catch((err) => {
        rejectOnce(`Error al conectar: ${err.message}`);
      });
    });
  }

  /**
   * Crea un tarball gzip del directorio local usando el `tar` del sistema.
   * Devuelve la ruta del tarball temporal creado.
   */
  private async createTarball(localPath: string, excludes: string[]): Promise<string> {
    const tarballPath = join(tmpdir(), `fractal-upload-${Date.now()}.tar.gz`);
    const excludeArgs = excludes.map((pattern) => `--exclude=./${pattern}`);
    const args = ['-czf', tarballPath, '-C', localPath, ...excludeArgs, '.'];

    await new Promise<void>((resolveTar, rejectTar) => {
      const proc = spawn('tar', args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      proc.on('error', (err) => rejectTar(err));
      proc.on('close', (code) => {
        if (code === 0) {
          resolveTar();
        } else {
          rejectTar(new Error(stderr.trim() || `tar terminó con código ${code}`));
        }
      });
    });

    return tarballPath;
  }

  /**
   * Establece la conexión SSH con las credenciales configuradas.
   * Siempre verifica la clave del host: ssh2 auto-acepta si hostVerifier falta.
   */
  private async connect(client: SshClientInstance): Promise<void> {
    const connectConfig: ConnectConfig = {
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
      readyTimeout: this.config.timeout,
      keepaliveInterval: 15_000,
      keepaliveCountMax: 8,
      // ssh2 ejecuta `hostVerifier` durante el handshake del transporte, ANTES
      // de la fase de autenticación: la verificación de la host key ocurre al
      // recibir el SSH_MSG_KEXINIT/host key del servidor, y recién cuando
      // `verify(true)` confirma la clave ssh2 pasa a autenticar. Por eso
      // resolver con `false` aborta la conexión antes de que se transmita
      // cualquier credencial (contraseña o clave). Es la garantía que sostiene
      // la política `onUnknownHost => false` de deploy-host-key.ts: la
      // contraseña nunca viaja a un host sin verificar (FRA-75).
      hostVerifier: (key: Buffer, verify: (valid: boolean) => void) => {
        void this.verifyHostKey(key).then(verify, () => verify(false));
      },
    };

    if (this.config.password) {
      connectConfig.password = this.config.password;
    } else if (this.config.privateKeyPath) {
      const keyPath = this.config.privateKeyPath.startsWith('~')
        ? resolve(homedir(), this.config.privateKeyPath.slice(2))
        : this.config.privateKeyPath;
      
      try {
        connectConfig.privateKey = await readFile(keyPath, 'utf8');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`No se pudo leer la clave privada en ${keyPath}: ${message}`);
      }
    } else {
      throw new Error('Se requiere contraseña o ruta a clave privada');
    }

    client.connect(connectConfig);
  }

  private async verifyHostKey(key: Buffer): Promise<boolean> {
    try {
      const result = await verifyHostKeyAgainstKnownHosts({
        key,
        host: this.config.host,
        port: this.config.port ?? 22,
        knownHostsPath: this.config.knownHostsPath ?? join(homedir(), '.ssh', 'known_hosts'),
        onUnknownHost: this.config.onUnknownHost,
        unknownHostRejectError: this.config.unknownHostRejectError,
      });

      if (result.accepted) {
        // Capturar la línea known_hosts de la clave aceptada (TOFU o match), el
        // mismo valor que ssh-keyscan produciría, para surtir el secret
        // SSH_KNOWN_HOSTS (FRA-76). Si no se puede formatear, no es fatal.
        try {
          const presented = parsePresentedKey(key);
          this.knownHostsLine = formatKnownHostsLine(
            this.config.host,
            this.config.port ?? 22,
            presented
          );
        } catch {
          // Ignorar: la línea es best-effort; la conexión ya fue aceptada.
        }
      } else {
        this.hostKeyError = result.error;
      }

      return result.accepted;
    } catch (err) {
      this.hostKeyError =
        `Error al verificar la clave del host: ` +
        (err instanceof Error ? err.message : String(err));
      return false;
    }
  }
}
