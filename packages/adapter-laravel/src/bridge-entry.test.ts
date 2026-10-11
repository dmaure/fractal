/**
 * Tests del entry point del bridge de adapter-laravel.
 * 
 * Verifica que el bridge-entry responde correctamente a las acciones
 * get-contract y create-project según el formato del bridge (SPEC-0002).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bridgeEntryPath = resolve(__dirname, '../dist/bridge-entry.js');

/**
 * Helper para invocar el bridge-entry con un payload y obtener la respuesta.
 */
async function invokeBridgeEntry(payload: unknown): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  response?: unknown;
}> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bridgeEntryPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (exitCode) => {
      let response: unknown;
      try {
        if (stdout.trim()) {
          response = JSON.parse(stdout);
        }
      } catch {
        // Ignorar errores de parseo
      }

      resolve({
        exitCode: exitCode || 0,
        stdout,
        stderr,
        response,
      });
    });

    // Enviar payload por stdin
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

describe('bridge-entry', () => {
  describe('get-contract', () => {
    it('retorna el contrato del adapter con success: true', async () => {
      const result = await invokeBridgeEntry({ action: 'get-contract' });

      expect(result.exitCode).toBe(0);
      expect(result.response).toMatchObject({
        success: true,
        data: {
          version: '0',
          runtimeRequirements: {
            binaries: expect.any(Array),
          },
          deployRuntime: expect.any(Object),
        },
      });
    });

    it('sin target retorna el runtime de backend (con postDeployCommands)', async () => {
      const result = await invokeBridgeEntry({ action: 'get-contract' });

      expect(result.exitCode).toBe(0);
      const response = result.response as {
        success: boolean;
        data: { deployRuntime: { services: string[]; port: number; postDeployCommands?: string[] } };
      };
      expect(response.success).toBe(true);
      expect(response.data.deployRuntime.services).toContain('app');
      expect(response.data.deployRuntime.port).toBe(8000);
      expect(response.data.deployRuntime.postDeployCommands).toEqual([
        'php artisan config:clear',
        'php artisan route:clear',
        'php artisan view:clear',
        'php artisan cache:clear',
      ]);
    });

    it('con target frontend-static retorna el runtime nginx-only', async () => {
      const result = await invokeBridgeEntry({
        action: 'get-contract',
        target: 'frontend-static',
      });

      expect(result.exitCode).toBe(0);
      const response = result.response as {
        success: boolean;
        data: { deployRuntime: { services: string[]; port: number; healthcheck: { path: string } } };
      };
      expect(response.success).toBe(true);
      expect(response.data.deployRuntime.services).toEqual(['nginx']);
      expect(response.data.deployRuntime.port).toBe(80);
      expect(response.data.deployRuntime.healthcheck.path).toBe('/health.txt');
    });

    it('con target backend-full retorna el runtime de backend', async () => {
      const result = await invokeBridgeEntry({
        action: 'get-contract',
        target: 'backend-full',
      });

      expect(result.exitCode).toBe(0);
      const response = result.response as {
        success: boolean;
        data: { deployRuntime: { services: string[] } };
      };
      expect(response.success).toBe(true);
      expect(response.data.deployRuntime.services).toContain('scheduler');
    });

    it('con target inválido retorna success: false', async () => {
      const result = await invokeBridgeEntry({
        action: 'get-contract',
        target: 'invalid-target',
      });

      expect(result.exitCode).toBe(1);
      expect(result.response).toMatchObject({
        success: false,
        error: {
          message: expect.stringContaining('target'),
          step: 'validación',
        },
      });
    });
  });

  describe('create-project', () => {
    it('retorna error si falta el campo name', async () => {
      const result = await invokeBridgeEntry({
        action: 'create-project',
        topology: 'monolith',
        destinationPath: '/tmp/test',
        target: 'laravel',
      });

      expect(result.exitCode).toBe(1);
      expect(result.response).toMatchObject({
        success: false,
        error: {
          message: expect.stringContaining('name'),
          step: 'validación',
        },
      });
    });

    it('retorna error si falta el campo topology', async () => {
      const result = await invokeBridgeEntry({
        action: 'create-project',
        name: 'test-project',
        destinationPath: '/tmp/test',
        target: 'laravel',
      });

      expect(result.exitCode).toBe(1);
      expect(result.response).toMatchObject({
        success: false,
        error: {
          message: expect.stringContaining('topology'),
          step: 'validación',
        },
      });
    });

    it('retorna error si falta el campo destinationPath', async () => {
      const result = await invokeBridgeEntry({
        action: 'create-project',
        name: 'test-project',
        topology: 'monolith',
        target: 'laravel',
      });

      expect(result.exitCode).toBe(1);
      expect(result.response).toMatchObject({
        success: false,
        error: {
          message: expect.stringContaining('destinationPath'),
          step: 'validación',
        },
      });
    });

    it('retorna error si falta el campo target', async () => {
      const result = await invokeBridgeEntry({
        action: 'create-project',
        name: 'test-project',
        topology: 'monolith',
        destinationPath: '/tmp/test',
      });

      expect(result.exitCode).toBe(1);
      expect(result.response).toMatchObject({
        success: false,
        error: {
          message: expect.stringContaining('target'),
          step: 'validación',
        },
      });
    });
  });

  describe('acción desconocida', () => {
    it('retorna error para acción no soportada', async () => {
      const result = await invokeBridgeEntry({ action: 'unknown-action' });

      expect(result.exitCode).toBe(1);
      expect(result.response).toMatchObject({
        success: false,
        error: {
          message: expect.stringContaining('desconocida'),
          step: 'validación',
        },
      });
    });
  });

  describe('JSON inválido', () => {
    it('retorna error si el payload no es JSON válido', async () => {
      const child = spawn(process.execPath, [bridgeEntryPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      await new Promise<void>((resolve) => {
        child.on('close', () => {
          resolve();
        });

        child.stdin.write('invalid json{');
        child.stdin.end();
      });

      const response = JSON.parse(stdout);
      expect(response).toMatchObject({
        success: false,
        error: {
          message: expect.stringContaining('JSON inválido'),
          step: 'parseo',
        },
      });
    });
  });

  describe('payload vacío', () => {
    it('retorna error si no se recibe payload', async () => {
      const child = spawn(process.execPath, [bridgeEntryPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      await new Promise<void>((resolve) => {
        child.on('close', () => {
          resolve();
        });

        child.stdin.end(); // Cerrar sin escribir nada
      });

      const response = JSON.parse(stdout);
      expect(response).toMatchObject({
        success: false,
        error: {
          message: expect.stringContaining('No se recibió ningún payload'),
          step: 'lectura',
        },
      });
    });
  });

  describe('payload sin action', () => {
    it('retorna error si el payload no tiene campo action', async () => {
      const result = await invokeBridgeEntry({ name: 'test' });

      expect(result.exitCode).toBe(1);
      expect(result.response).toMatchObject({
        success: false,
        error: {
          message: expect.stringContaining('action'),
          step: 'validación',
        },
      });
    });
  });
});
