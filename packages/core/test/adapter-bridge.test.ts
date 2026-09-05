/**
 * Tests para adapter-bridge
 * 
 * Verifica que el bridge invoque correctamente los adapters y maneje
 * todos los casos de error de forma legible.
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { invokeAdapter } from '../src/adapter-bridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesDir = join(__dirname, 'fixtures');

describe('adapter-bridge', () => {
  describe('invokeAdapter - happy path', () => {
    it('debe invocar un adapter exitosamente y recibir su respuesta', async () => {
      const adapterPath = join(fixturesDir, 'adapter-success.js');
      const payload = { action: 'test', name: 'proyecto-prueba' };
      
      const result = await invokeAdapter(['node', adapterPath], payload);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeDefined();
        expect((result.data as any).received).toEqual(payload);
        expect((result.data as any).message).toBe('Operación exitosa');
      }
    });

    it('debe pasar correctamente el payload por stdin', async () => {
      const adapterPath = join(fixturesDir, 'adapter-success.js');
      const payload = {
        action: 'create-project',
        name: 'mi-proyecto',
        config: {
          database: 'postgresql',
          auth: true
        }
      };
      
      const result = await invokeAdapter(['node', adapterPath], payload);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as any).received).toEqual(payload);
      }
    });
  });

  describe('invokeAdapter - errores del adapter', () => {
    it('debe manejar un adapter que reporta error (success: false)', async () => {
      const adapterPath = join(fixturesDir, 'adapter-error.js');
      const payload = { action: 'test' };
      
      const result = await invokeAdapter(['node', adapterPath], payload);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('Error de validación en el adapter');
        expect(result.error.step).toBe('validación');
      }
    });

    it('debe manejar un adapter que termina con exit code != 0', async () => {
      const adapterPath = join(fixturesDir, 'adapter-exit-error.js');
      const payload = { action: 'test' };
      
      const result = await invokeAdapter(['node', adapterPath], payload);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Error fatal en el adapter');
        expect(result.error.step).toBe('ejecución');
        expect(result.error.exitCode).toBe(1);
      }
    });

    it('debe manejar un adapter que devuelve JSON inválido', async () => {
      const adapterPath = join(fixturesDir, 'adapter-invalid-json.js');
      const payload = { action: 'test' };
      
      const result = await invokeAdapter(['node', adapterPath], payload);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('no es un JSON válido');
        expect(result.error.step).toBe('parseo');
      }
    });

    it('debe manejar un adapter que no devuelve nada por stdout', async () => {
      const adapterPath = join(fixturesDir, 'adapter-no-output.js');
      const payload = { action: 'test' };
      
      const result = await invokeAdapter(['node', adapterPath], payload);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('no devolvió ninguna respuesta');
        expect(result.error.step).toBe('lectura');
      }
    });

    it('debe manejar un adapter que devuelve JSON sin el campo success', async () => {
      const adapterPath = join(fixturesDir, 'adapter-invalid-shape.js');
      const payload = { action: 'test' };
      
      const result = await invokeAdapter(['node', adapterPath], payload);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('debe incluir un campo "success"');
        expect(result.error.step).toBe('validación');
      }
    });
  });

  describe('invokeAdapter - errores de invocación', () => {
    it('debe manejar un comando que no existe', async () => {
      const payload = { action: 'test' };
      
      const result = await invokeAdapter(['comando-inexistente-xyz'], payload);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Error al ejecutar el comando');
        expect(result.error.step).toBe('ejecución');
      }
    });

    it('debe manejar un comando vacío', async () => {
      const payload = { action: 'test' };
      
      const result = await invokeAdapter([], payload);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('no puede estar vacío');
        expect(result.error.step).toBe('validación');
      }
    });

    it('debe manejar un payload que no se puede serializar', async () => {
      const adapterPath = join(fixturesDir, 'adapter-success.js');
      
      // Crear un objeto circular que no se puede serializar
      const circularPayload: any = { action: 'test' };
      circularPayload.self = circularPayload;
      
      const result = await invokeAdapter(['node', adapterPath], circularPayload);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Error al serializar el payload');
        expect(result.error.step).toBe('serialización');
      }
    });
  });

  describe('invokeAdapter - timeout', () => {
    it('debe manejar un adapter que no termina (timeout)', async () => {
      const adapterPath = join(fixturesDir, 'adapter-timeout.js');
      const payload = { action: 'test' };
      
      // Timeout de 1 segundo
      const result = await invokeAdapter(['node', adapterPath], payload, {
        timeout: 1000
      });
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('no respondió');
        expect(result.error.message).toContain('1000ms');
        expect(result.error.step).toBe('timeout');
      }
    }, 10000); // Test timeout de 10 segundos
  });

  describe('invokeAdapter - opciones', () => {
    it('debe respetar el directorio de trabajo (cwd)', async () => {
      const adapterPath = join(fixturesDir, 'adapter-success.js');
      const payload = { action: 'test' };
      
      const result = await invokeAdapter(['node', adapterPath], payload, {
        cwd: fixturesDir
      });
      
      expect(result.success).toBe(true);
    });

    it('debe pasar variables de entorno al proceso hijo', async () => {
      const adapterPath = join(fixturesDir, 'adapter-success.js');
      const payload = { action: 'test' };
      
      const result = await invokeAdapter(['node', adapterPath], payload, {
        env: { TEST_VAR: 'test-value' }
      });
      
      expect(result.success).toBe(true);
    });
  });
});
