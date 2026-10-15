import { Client, type ConnectConfig } from 'ssh2';
import { readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { SshConfig, SshCommandResult } from './types.js';
import { verifyHostKeyAgainstKnownHosts } from './host-key.js';

/**
 * Directorios/archivos excluidos por defecto al subir un proyecto: se
 * regeneran dentro de la imagen o no deben viajar al servidor.
 */
const DEFAULT_UPLOAD_EXCLUDES = ['.git', 'node_modules', 'vendor', 'dist'];

/**
 * Cliente SSH para conexión y ejecución de comandos remotos.
 * Framework-agnostic: no asume ningún framework específico.
 */
export class SshClient {
  private config: SshConfig;
  private hostKeyError?: string;
  
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
   * que se regeneran, p.ej. node_modules/vendor/.git), lo transfiere por SFTP
   * y lo extrae en el directorio destino del servidor. Framework-agnostic: no
   * asume ningún framework ni tipo de proyecto.
   *
   * @param localPath Ruta del directorio local a subir
   * @param remotePath Ruta destino en el servidor (se crea si no existe)
   * @param options.exclude Patrones a excluir (default: .git, node_modules, vendor, dist)
   */
  async uploadDirectory(
    localPath: string,
    remotePath: string,
    options?: { exclude?: string[] }
  ): Promise<{ success: boolean; error?: string }> {
    const excludes = options?.exclude ?? DEFAULT_UPLOAD_EXCLUDES;

    let tarballPath: string;
    try {
      tarballPath = await this.createTarball(localPath, excludes);
    } catch (err) {
      return {
        success: false,
        error: `No se pudo empaquetar el directorio local: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const remoteTmp = `/tmp/fractal-upload-${Date.now()}.tar.gz`;

    try {
      return await new Promise((resolvePromise) => {
        const client = new Client();
        let settled = false;

        const finish = (result: { success: boolean; error?: string }): void => {
          if (settled) return;
          settled = true;
          client.end();
          resolvePromise(result);
        };

        const timeout = setTimeout(() => {
          finish({
            success: false,
            error: 'Timeout: la subida del directorio excedió el tiempo esperado',
          });
        }, this.config.timeout);

        client.on('ready', () => {
          client.sftp((sftpErr, sftp) => {
            if (sftpErr) {
              clearTimeout(timeout);
              finish({ success: false, error: `Error al abrir SFTP: ${sftpErr.message}` });
              return;
            }

            sftp.fastPut(tarballPath, remoteTmp, (putErr) => {
              if (putErr) {
                clearTimeout(timeout);
                finish({ success: false, error: `Error al transferir el archivo: ${putErr.message}` });
                return;
              }

              const extractCmd =
                `mkdir -p '${remotePath}' && ` +
                `tar -xzf '${remoteTmp}' -C '${remotePath}' && ` +
                `rm -f '${remoteTmp}'`;

              client.exec(extractCmd, (execErr, stream) => {
                if (execErr) {
                  clearTimeout(timeout);
                  finish({ success: false, error: `Error al extraer en el servidor: ${execErr.message}` });
                  return;
                }

                let stderr = '';
                stream.stderr.on('data', (data: Buffer) => {
                  stderr += data.toString();
                });

                stream.on('close', (code: number) => {
                  clearTimeout(timeout);
                  finish({
                    success: code === 0,
                    error: code === 0 ? undefined : stderr.trim() || `La extracción terminó con código ${code}`,
                  });
                });
              });
            });
          });
        });

        client.on('error', (err) => {
          clearTimeout(timeout);
          const hostKeyError = this.consumeHostKeyError();
          finish({ success: false, error: hostKeyError ?? `Error de conexión: ${err.message}` });
        });

        this.connect(client).catch((err) => {
          clearTimeout(timeout);
          const hostKeyError = this.consumeHostKeyError();
          finish({ success: false, error: hostKeyError ?? `Error al conectar: ${err.message}` });
        });
      });
    } finally {
      await rm(tarballPath, { force: true }).catch(() => {});
    }
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
  private async connect(client: Client): Promise<void> {
    const connectConfig: ConnectConfig = {
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
      readyTimeout: this.config.timeout,
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
      });

      if (!result.accepted) {
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
