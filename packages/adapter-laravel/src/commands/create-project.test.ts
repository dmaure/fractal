/**
 * Tests para el comando create-project.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProject } from './create-project.js';
import type { CreateProjectPayload } from '@fractal/core';

describe('createProject', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `fractal-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('topología monolith', () => {
    it('genera un proyecto monolito exitosamente', async () => {
      const payload: CreateProjectPayload = {
        name: 'test-monolith',
        topology: 'monolith',
        destinationPath: testDir,
        target: 'laravel',
      };

      const response = await createProject(payload);

      expect(response.success).toBe(true);
      if (response.success) {
        expect(response.data.projectPath).toContain('test-monolith');
        expect(response.data.message).toContain('monolith');
      }

      const projectPath = join(testDir, 'test-monolith');
      const files = await readdir(projectPath);
      expect(files).toContain('composer.json');
      expect(files).toContain('package.json');
      expect(files).toContain('.env.example');
      expect(files).toContain('.gitignore');
      expect(files).toContain('README.md');
    });

    it('incluye la estructura de directorios correcta', async () => {
      const payload: CreateProjectPayload = {
        name: 'test-structure',
        topology: 'monolith',
        destinationPath: testDir,
        target: 'laravel',
      };

      await createProject(payload);

      const projectPath = join(testDir, 'test-structure');
      const files = await readdir(projectPath);
      expect(files).toContain('app');
      expect(files).toContain('resources');
      expect(files).toContain('public');
      expect(files).toContain('routes');
    });
  });

  describe('topología monorepo', () => {
    it('genera un proyecto monorepo exitosamente', async () => {
      const payload: CreateProjectPayload = {
        name: 'test-monorepo',
        topology: 'monorepo',
        destinationPath: testDir,
        target: 'laravel',
      };

      const response = await createProject(payload);

      expect(response.success).toBe(true);
      if (response.success) {
        expect(response.data.projectPath).toContain('test-monorepo');
        expect(response.data.message).toContain('monorepo');
      }

      const projectPath = join(testDir, 'test-monorepo');
      const files = await readdir(projectPath);
      expect(files).toContain('api');
      expect(files).toContain('web');
      expect(files).toContain('turbo.json');
      expect(files).toContain('package.json');
    });

    it('genera el package api/ con estructura Laravel', async () => {
      const payload: CreateProjectPayload = {
        name: 'test-monorepo-api',
        topology: 'monorepo',
        destinationPath: testDir,
        target: 'laravel',
      };

      await createProject(payload);

      const apiPath = join(testDir, 'test-monorepo-api', 'api');
      const files = await readdir(apiPath);
      expect(files).toContain('composer.json');
      expect(files).toContain('.env.example');
      expect(files).toContain('app');
      expect(files).toContain('routes');
    });

    it('genera el package web/ con estructura Vite', async () => {
      const payload: CreateProjectPayload = {
        name: 'test-monorepo-web',
        topology: 'monorepo',
        destinationPath: testDir,
        target: 'laravel',
      };

      await createProject(payload);

      const webPath = join(testDir, 'test-monorepo-web', 'web');
      const files = await readdir(webPath);
      expect(files).toContain('package.json');
      expect(files).toContain('vite.config.ts');
      expect(files).toContain('src');
      expect(files).toContain('index.html');
    });
  });

  describe('topología multirepo', () => {
    it('genera dos repositorios separados exitosamente', async () => {
      const payload: CreateProjectPayload = {
        name: 'test-multirepo',
        topology: 'multirepo',
        destinationPath: testDir,
        target: 'laravel',
      };

      const response = await createProject(payload);

      expect(response.success).toBe(true);
      if (response.success) {
        expect(response.data.projectPath).toBe(testDir);
        expect(response.data.message).toContain('multirepo');
      }

      const files = await readdir(testDir);
      expect(files).toContain('test-multirepo-api');
      expect(files).toContain('test-multirepo-web');
    });

    it('incluye manifiestos fractal.project.yml en ambos repos', async () => {
      const payload: CreateProjectPayload = {
        name: 'test-manifest',
        topology: 'multirepo',
        destinationPath: testDir,
        target: 'laravel',
      };

      await createProject(payload);

      const apiFiles = await readdir(join(testDir, 'test-manifest-api'));
      const webFiles = await readdir(join(testDir, 'test-manifest-web'));

      expect(apiFiles).toContain('fractal.project.yml');
      expect(webFiles).toContain('fractal.project.yml');
    });

    it('genera health.txt en el package web/', async () => {
      const payload: CreateProjectPayload = {
        name: 'test-health',
        topology: 'multirepo',
        destinationPath: testDir,
        target: 'laravel',
      };

      await createProject(payload);

      const webPublicFiles = await readdir(
        join(testDir, 'test-health-web', 'public')
      );
      expect(webPublicFiles).toContain('health.txt');
    });
  });

  describe('propagación de errores', () => {
    it('retorna error para topología no soportada', async () => {
      const payload = {
        name: 'test-invalid',
        topology: 'invalid' as any,
        destinationPath: testDir,
        target: 'laravel',
      };

      const response = await createProject(payload);

      expect(response.success).toBe(false);
      if (!response.success) {
        expect(response.error.message).toContain('no soportada');
        expect(response.error.step).toBe('validación');
      }
    });

    it('propaga errores de generación con step', async () => {
      const payload: CreateProjectPayload = {
        name: 'test-error',
        topology: 'monolith',
        destinationPath: '/path/que/no/existe/y/no/se/puede/crear',
        target: 'laravel',
      };

      const response = await createProject(payload);

      expect(response.success).toBe(false);
      if (!response.success) {
        expect(response.error.message).toBeTruthy();
        expect(response.error.step).toBeTruthy();
      }
    });
  });
});
