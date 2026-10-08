/**
 * Tests del resolver de adapters.
 * 
 * Verifica la resolución de adapters por convención de nombre y metadata,
 * manteniendo la agnosticidad de framework (Artículo II).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveAdapters, resolveSingleAdapter } from './adapter-resolver.js';

describe('adapter-resolver', () => {
  let testDir: string;
  let fractalDir: string;

  beforeEach(() => {
    // Crear directorio temporal de prueba
    testDir = join(tmpdir(), `fractal-test-${Date.now()}`);
    fractalDir = join(testDir, 'node_modules', '@fractal');
    mkdirSync(fractalDir, { recursive: true });
  });

  afterEach(() => {
    // Limpiar
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('resolveAdapters', () => {
    it('encuentra un adapter válido con metadata correcta', () => {
      // Crear adapter-test con metadata válida
      const adapterDir = join(fractalDir, 'adapter-test');
      mkdirSync(adapterDir, { recursive: true });

      const packageJson = {
        name: '@fractal/adapter-test',
        version: '1.0.0',
        fractal: {
          adapter: true,
          target: 'test-framework',
          bridge: 'dist/bridge.js',
        },
      };

      writeFileSync(
        join(adapterDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      // Crear el archivo bridge (necesario para que pase la validación)
      mkdirSync(join(adapterDir, 'dist'), { recursive: true });
      writeFileSync(join(adapterDir, 'dist', 'bridge.js'), '// bridge');

      const result = resolveAdapters(testDir);

      expect(result.adapters).toHaveLength(1);
      expect(result.adapters[0]).toMatchObject({
        packageName: '@fractal/adapter-test',
        target: 'test-framework',
        packagePath: adapterDir,
        command: [process.execPath, join(adapterDir, 'dist', 'bridge.js')],
      });
    });

    it('ignora paquetes sin metadata fractal', () => {
      // Crear adapter-test sin metadata
      const adapterDir = join(fractalDir, 'adapter-test');
      mkdirSync(adapterDir, { recursive: true });

      const packageJson = {
        name: '@fractal/adapter-test',
        version: '1.0.0',
      };

      writeFileSync(
        join(adapterDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      const result = resolveAdapters(testDir);

      expect(result.adapters).toHaveLength(0);
    });

    it('ignora paquetes con metadata incompleta', () => {
      // Crear adapter-test con metadata incompleta
      const adapterDir = join(fractalDir, 'adapter-test');
      mkdirSync(adapterDir, { recursive: true });

      const packageJson = {
        name: '@fractal/adapter-test',
        version: '1.0.0',
        fractal: {
          adapter: true,
          // Falta target y bridge
        },
      };

      writeFileSync(
        join(adapterDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      const result = resolveAdapters(testDir);

      expect(result.adapters).toHaveLength(0);
    });

    it('ignora adapters cuyo bridge-entry no existe', () => {
      // Crear adapter-test con metadata válida pero sin bridge-entry
      const adapterDir = join(fractalDir, 'adapter-test');
      mkdirSync(adapterDir, { recursive: true });

      const packageJson = {
        name: '@fractal/adapter-test',
        version: '1.0.0',
        fractal: {
          adapter: true,
          target: 'test-framework',
          bridge: 'dist/bridge.js',
        },
      };

      writeFileSync(
        join(adapterDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      // No crear el archivo bridge

      const result = resolveAdapters(testDir);

      expect(result.adapters).toHaveLength(0);
    });

    it('encuentra múltiples adapters válidos', () => {
      // Crear adapter-one
      const adapterOneDir = join(fractalDir, 'adapter-one');
      mkdirSync(adapterOneDir, { recursive: true });
      mkdirSync(join(adapterOneDir, 'dist'), { recursive: true });

      writeFileSync(
        join(adapterOneDir, 'package.json'),
        JSON.stringify({
          name: '@fractal/adapter-one',
          fractal: {
            adapter: true,
            target: 'framework-one',
            bridge: 'dist/bridge.js',
          },
        })
      );
      writeFileSync(join(adapterOneDir, 'dist', 'bridge.js'), '// bridge');

      // Crear adapter-two
      const adapterTwoDir = join(fractalDir, 'adapter-two');
      mkdirSync(adapterTwoDir, { recursive: true });
      mkdirSync(join(adapterTwoDir, 'dist'), { recursive: true });

      writeFileSync(
        join(adapterTwoDir, 'package.json'),
        JSON.stringify({
          name: '@fractal/adapter-two',
          fractal: {
            adapter: true,
            target: 'framework-two',
            bridge: 'dist/bridge.js',
          },
        })
      );
      writeFileSync(join(adapterTwoDir, 'dist', 'bridge.js'), '// bridge');

      const result = resolveAdapters(testDir);

      expect(result.adapters).toHaveLength(2);
      expect(result.adapters.map((a) => a.target)).toContain('framework-one');
      expect(result.adapters.map((a) => a.target)).toContain('framework-two');
    });

    it('retorna error si no encuentra el directorio @fractal', () => {
      // Usar un directorio que no tenga node_modules/@fractal
      const invalidDir = join(tmpdir(), `fractal-invalid-${Date.now()}`);
      mkdirSync(invalidDir, { recursive: true });

      const result = resolveAdapters(invalidDir);

      expect(result.error).toBeDefined();
      expect(result.error).toContain('directorio de paquetes @fractal');

      // Limpiar
      rmSync(invalidDir, { recursive: true, force: true });
    });
  });

  describe('resolveSingleAdapter', () => {
    it('retorna el adapter si hay exactamente uno', () => {
      // Crear un adapter válido
      const adapterDir = join(fractalDir, 'adapter-test');
      mkdirSync(adapterDir, { recursive: true });
      mkdirSync(join(adapterDir, 'dist'), { recursive: true });

      writeFileSync(
        join(adapterDir, 'package.json'),
        JSON.stringify({
          name: '@fractal/adapter-test',
          fractal: {
            adapter: true,
            target: 'test-framework',
            bridge: 'dist/bridge.js',
          },
        })
      );
      writeFileSync(join(adapterDir, 'dist', 'bridge.js'), '// bridge');

      const adapter = resolveSingleAdapter(testDir);

      expect(adapter.target).toBe('test-framework');
    });

    it('lanza error si no hay adapters', () => {
      expect(() => resolveSingleAdapter(testDir)).toThrow(
        'No se encontró ningún adapter'
      );
    });

    it('lanza error si hay múltiples adapters', () => {
      // Crear dos adapters
      for (const name of ['adapter-one', 'adapter-two']) {
        const adapterDir = join(fractalDir, name);
        mkdirSync(adapterDir, { recursive: true });
        mkdirSync(join(adapterDir, 'dist'), { recursive: true });

        writeFileSync(
          join(adapterDir, 'package.json'),
          JSON.stringify({
            name: `@fractal/${name}`,
            fractal: {
              adapter: true,
              target: name.replace('adapter-', ''),
              bridge: 'dist/bridge.js',
            },
          })
        );
        writeFileSync(join(adapterDir, 'dist', 'bridge.js'), '// bridge');
      }

      expect(() => resolveSingleAdapter(testDir)).toThrow(
        'múltiples adapters'
      );
    });
  });
});
