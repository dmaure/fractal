import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SshClient } from './client.js';

const execFileAsync = promisify(execFile);

/**
 * Tests de SshClient.uploadDirectory (FRA-70 / FRA-73). ssh2 se mockea por
 * completo: NO se abre ninguna conexión real. El empaquetado local con `tar` sí
 * ocurre de verdad sobre un directorio temporal, para cubrir la ruta completa
 * salvo la red. Desde FRA-73 el tarball se extrae por el canal de ejecución
 * (`tar -xzf -` leyendo de stdin), no por SFTP.
 */

const state = vi.hoisted(() => ({
  lastExecCommand: '',
  execCommands: [] as string[],
  execCloseCode: 0 as number | null,
  // Nº de intentos iniciales que fallan por transporte (cb de exec con error)
  // antes de que uno tenga éxito. Simula una conexión que se cae y se recupera.
  transportFailures: 0,
  // Si es true, el stream nunca emite 'close': simula una transferencia colgada
  // para ejercitar el presupuesto total de la subida.
  hangExec: false,
  // Chunks que el código vuelca por stdin (el tarball gzip). Se capturan para
  // poder inspeccionar qué quedó empaquetado (p.ej. excluir .env).
  writtenChunks: [] as Buffer[],
}));

vi.mock('ssh2', async () => {
  const { EventEmitter } = await import('node:events');

  // Stream dúplex falso: `on`/`emit` vienen de EventEmitter y agregamos
  // `write`/`end` para que `readStream.pipe(stream)` lo acepte como destino.
  // `write` acumula el tarball que el código vuelca por stdin, y `end` emite
  // 'close' recién cuando el pipe terminó de escribir (comportamiento más
  // realista: el canal cierra tras recibir todo el stream).
  class FakeStream extends EventEmitter {
    stderr = new EventEmitter();
    write(chunk: Buffer | string): boolean {
      state.writtenChunks.push(Buffer.from(chunk as Buffer));
      return true;
    }
    end(chunk?: Buffer | string): void {
      if (chunk) {
        state.writtenChunks.push(Buffer.from(chunk as Buffer));
      }
      if (state.hangExec) return; // nunca emite 'close': fuerza el timeout total
      setImmediate(() => this.emit('close', state.execCloseCode));
    }
  }

  class Client extends EventEmitter {
    connect(): void {
      // Simula una conexión exitosa de forma asíncrona.
      setImmediate(() => this.emit('ready'));
    }

    exec(command: string, cb: (err: Error | null, stream?: FakeStream) => void): void {
      state.lastExecCommand = command;
      state.execCommands.push(command);

      if (state.transportFailures > 0) {
        state.transportFailures--;
        cb(new Error('fallo de transporte simulado'));
        return;
      }

      const stream = new FakeStream();
      cb(null, stream);
      // El 'close' lo dispara FakeStream.end() cuando el pipe termina.
    }

    end(): void {}
  }

  // El código importa ssh2 como módulo CommonJS (`import ssh2 from 'ssh2'`),
  // así que el mock debe exponer `Client` en el export default además del
  // export nombrado.
  return { default: { Client }, Client };
});

const TARBALL_RE = /^fractal-upload-.*\.tar\.gz$/;

async function countLocalTarballs(): Promise<number> {
  const entries = await readdir(tmpdir());
  return entries.filter((name) => TARBALL_RE.test(name)).length;
}

describe('SshClient.uploadDirectory', () => {
  let localDir: string;

  beforeEach(async () => {
    state.lastExecCommand = '';
    state.execCommands = [];
    state.execCloseCode = 0;
    state.transportFailures = 0;
    state.hangExec = false;
    state.writtenChunks = [];

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

  it('empaqueta y extrae el directorio por el canal de ejecución (tar -xzf -)', async () => {
    const tarballsBefore = await countLocalTarballs();

    const client = makeClient();
    const result = await client.uploadDirectory(localDir, '/home/deploy');

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();

    // Un solo intento, sin reintentos.
    expect(state.execCommands).toHaveLength(1);

    // El comando remoto crea el destino y extrae desde stdin; ya no hay un
    // temporal remoto ni un `rm -f`.
    expect(state.lastExecCommand).toContain("mkdir -p '/home/deploy'");
    expect(state.lastExecCommand).toContain("tar -xzf - -C '/home/deploy'");
    expect(state.lastExecCommand).not.toContain('rm -f');

    // El tarball local se limpió al terminar.
    expect(await countLocalTarballs()).toBe(tarballsBefore);

    await rm(localDir, { recursive: true, force: true });
  });

  it('devuelve error y NO reintenta si tar termina con código ≠ 0', async () => {
    state.execCloseCode = 2;
    const client = makeClient();
    const result = await client.uploadDirectory(localDir, '/home/deploy');

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    // Fallo determinístico: un solo intento.
    expect(state.execCommands).toHaveLength(1);

    await rm(localDir, { recursive: true, force: true });
  });

  it('reintenta ante un fallo de transporte y tiene éxito en el segundo intento', async () => {
    state.transportFailures = 1; // el primer intento falla por transporte
    const client = makeClient();
    const result = await client.uploadDirectory(localDir, '/home/deploy');

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    // Se reintentó: exec se llamó dos veces.
    expect(state.execCommands).toHaveLength(2);

    await rm(localDir, { recursive: true, force: true });
  }, 10_000);

  it('agota los reintentos (máx 3) ante fallos de transporte persistentes', async () => {
    state.transportFailures = 99; // siempre falla por transporte
    const client = makeClient();
    // Presupuesto amplio para que los backoffs (2s + 4s) no lo corten.
    const result = await client.uploadDirectory(localDir, '/home/deploy', {
      timeoutMs: 20_000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('transporte');
    expect(state.execCommands).toHaveLength(3);

    await rm(localDir, { recursive: true, force: true });
  }, 15_000);

  it('excluye .env y .env.* del tarball para no pisar el .env del servidor (FRA-76)', async () => {
    // El dev tiene archivos de entorno locales: no deben viajar al servidor.
    await writeFile(join(localDir, '.env'), 'DB_PASSWORD=local-secret');
    await writeFile(join(localDir, '.env.production'), 'DB_PASSWORD=prod-local');
    await writeFile(join(localDir, '.env.local'), 'FOO=bar');

    const client = makeClient();
    const result = await client.uploadDirectory(localDir, '/home/deploy');

    expect(result.success).toBe(true);

    // Reconstruir el tarball que el código volcó por stdin y listar sus miembros.
    const tarball = join(await mkdtemp(join(tmpdir(), 'fractal-upload-out-')), 'upload.tar.gz');
    await writeFile(tarball, Buffer.concat(state.writtenChunks));
    const { stdout } = await execFileAsync('tar', ['-tzf', tarball]);
    const members = stdout.split('\n').map((m) => m.trim()).filter(Boolean);

    // app.txt sí viaja; ningún .env lo hace.
    expect(members).toContain('./app.txt');
    const envMembers = members.filter((m) => /(^|\/)\.env(\.|$)/.test(m));
    expect(envMembers).toEqual([]);

    await rm(join(tarball, '..'), { recursive: true, force: true });
    await rm(localDir, { recursive: true, force: true });
  });

  it('respeta el timeoutMs propio de la subida (independiente del readyTimeout)', async () => {
    // La transferencia se cuelga; el presupuesto de la subida (10ms) debe
    // disparar el timeout antes que el readyTimeout de conexión (5000ms).
    state.hangExec = true;
    const client = makeClient();
    const result = await client.uploadDirectory(localDir, '/home/deploy', {
      timeoutMs: 10,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Timeout');

    await rm(localDir, { recursive: true, force: true });
  });
});
