import { Client } from 'ssh2';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import type { SshConfig, SshCommandResult } from './types.js';

/**
 * Cliente SSH para conexión y ejecución de comandos remotos.
 * Framework-agnostic: no asume ningún framework específico.
 */
export class SshClient {
  private config: SshConfig;
  
  constructor(config: SshConfig) {
    this.config = {
      ...config,
      port: config.port || 22,
      timeout: config.timeout || 10000,
    };
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
        resolve({
          success: false,
          error: `Error de conexión SSH: ${err.message}`,
        });
      });

      this.connect(client).catch((err) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          error: `Error al establecer conexión: ${err.message}`,
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
        resolve({
          success: false,
          stdout: '',
          stderr: '',
          exitCode: null,
          error: `Error de conexión: ${err.message}`,
        });
      });

      this.connect(client).catch((err) => {
        resolve({
          success: false,
          stdout: '',
          stderr: '',
          exitCode: null,
          error: `Error al conectar: ${err.message}`,
        });
      });
    });
  }

  /**
   * Establece la conexión SSH con las credenciales configuradas.
   */
  private async connect(client: Client): Promise<void> {
    const connectConfig: any = {
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
      readyTimeout: this.config.timeout,
    };

    if (this.config.password) {
      connectConfig.password = this.config.password;
    } else if (this.config.privateKeyPath) {
      const keyPath = this.config.privateKeyPath.startsWith('~')
        ? resolve(homedir(), this.config.privateKeyPath.slice(2))
        : this.config.privateKeyPath;
      
      try {
        connectConfig.privateKey = await readFile(keyPath, 'utf8');
      } catch (err: any) {
        throw new Error(`No se pudo leer la clave privada en ${keyPath}: ${err.message}`);
      }
    } else {
      throw new Error('Se requiere contraseña o ruta a clave privada');
    }

    client.connect(connectConfig);
  }
}
