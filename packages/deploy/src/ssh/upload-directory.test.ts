import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SshClient } from './client.js';

/**
 * Tests de SshClient.uploadDirectory (FRA-70). ssh2 se mockea por completo:
 * NO se abre ninguna conexión real. El empaquetado local con `tar` sí ocurre
 * de verdad sobre un directorio temporal, para cubrir la ruta completa salvo
 * la red.
 */

const state = vi.hoisted(() => ({
  lastExecCommand: '',
  fastPutArgs: [] as Array<{ local: string; remote: string }>,
  execCloseCode: 0,
  sftpError: null as Error | null,
}));

vi.mock('ssh2', async () => {
  const { EventEmitter } = await import('node:events');

  class FakeStream extends EventEmitter {
    stderr = new EventEmitter();
  }

  class Client extends EventEmitter {
    connect(): void {
      // Simula una conexión exitosa de forma asíncrona.
      setImmediate(() => this.emit('ready'));
    }

    sftp(cb: (err: Error | null, sftp?: unknown) => void): void {
      if (state.sftpError) {
        cb(state.sftpError);
        return;
      }
      const sftp = {
        fastPut: (local: string, remote: string, done: (err: Error | null) => void) => {
          state.fastPutArgs.push({ local, remote });
          done(null);
        },
      };
      cb(null, sftp);
    }

    exec(command: string, cb: (err: Error | null, stream?: FakeStream) => void): void {
      state.lastExecCommand = command;
      const stream = new FakeStream();
      cb(null, stream);
      setImmediate(() => stream.emit('close', state.execCloseCode));
    }

    end(): void {}
  }

  // El código importa ssh2 como módulo CommonJS (`import ssh2 from 'ssh2'`),
  // así que el mock debe exponer `Client` en el export default además del
  // export nombrado.
  return { default: { Client }, Client };
});

describe('SshClient.uploadDirectory', () => {
  let localDir: string;

  beforeEach(async () => {
    state.lastExecCommand = '';
    state.fastPutArgs = [];
    state.execCloseCode = 0;
    state.sftpError = null;

    localDir = await mkdtemp(join(tmpdir(), 'fractal-upload-src-'));
    await writeFile(join(localDir, 'app.txt'), 'contenido');
  });

  const makeClient = () =>
    new SshClient({
      host: '192.168.1.10',
      username: 'deploy',
      password: 'secret',
      timeout: 5000,
    });

  it('empaqueta, transfiere por SFTP y extrae el directorio en el servidor', async () => {
    const client = makeClient();
    const result = await client.uploadDirectory(localDir, '/home/deploy');

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();

    // Se transfirió exactamente un tarball.
    expect(state.fastPutArgs).toHaveLength(1);
    expect(state.fastPutArgs[0].remote).toMatch(/^\/tmp\/fractal-upload-.*\.tar\.gz$/);

    // El comando remoto crea el destino, extrae y limpia el temporal.
    expect(state.lastExecCommand).toContain("mkdir -p '/home/deploy'");
    expect(state.lastExecCommand).toContain("tar -xzf '/tmp/fractal-upload-");
    expect(state.lastExecCommand).toContain("-C '/home/deploy'");
    expect(state.lastExecCommand).toContain('rm -f');

    await rm(localDir, { recursive: true, force: true });
  });

  it('devuelve error si la extracción remota falla', async () => {
    state.execCloseCode = 2;
    const client = makeClient();
    const result = await client.uploadDirectory(localDir, '/home/deploy');

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();

    await rm(localDir, { recursive: true, force: true });
  });

  it('propaga un error si no se puede abrir SFTP', async () => {
    state.sftpError = new Error('sftp no disponible');
    const client = makeClient();
    const result = await client.uploadDirectory(localDir, '/home/deploy');

    expect(result.success).toBe(false);
    expect(result.error).toContain('SFTP');

    await rm(localDir, { recursive: true, force: true });
  });
});
