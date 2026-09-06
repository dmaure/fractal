import { Client, type ConnectConfig } from 'ssh2';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { SshConfig, SshCommandResult } from './types.js';
import { verifyHostKeyAgainstKnownHosts } from './host-key.js';

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
   */
  async executeCommand(command: string): Promise<SshCommandResult> {
    return new Promise((resolve) => {
      const client = new Client();
      let stdout = '';
      let stderr = '';
      let exitCode: number | null = null;

      client.on('ready', () => {
        client.exec(command, (err, stream) => {
          if (err) {
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
            exitCode = code;
            client.end();
            resolve({
              success: code === 0,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              exitCode,
            });
          });
        });
      });

      client.on('error', (err) => {
        const hostKeyError = this.consumeHostKeyError();
        resolve({
          success: false,
          stdout: '',
          stderr: '',
          exitCode: null,
          error: hostKeyError ?? `Error de conexión: ${err.message}`,
        });
      });

      this.connect(client).catch((err) => {
        const hostKeyError = this.consumeHostKeyError();
        resolve({
          success: false,
          stdout: '',
          stderr: '',
          exitCode: null,
          error: hostKeyError ?? `Error al conectar: ${err.message}`,
        });
      });
    });
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
