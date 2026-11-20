/**
 * Tests para el comando create-project.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readdir, readFile, writeFile } from 'node:fs/promises';
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
      expect(files).toContain('public');
      expect(files).toContain('routes');
    });

    // El frontend ya no lo genera este adapter (FRA-116): lo crea el adapter
    // frontend en web/. Acá solo se verifica que no haya nada en la raíz.
    describe('sin frontend propio (FRA-116)', () => {
      it('no emite web/ ni archivos del frontend en la raíz', async () => {
        await createProject({
          name: 'test-vite-entry',
          topology: 'monolith',
          destinationPath: testDir,
          target: 'laravel',
        });

        const projectPath = join(testDir, 'test-vite-entry');
        const rootFiles = await readdir(projectPath);
        for (const f of ['index.html', 'vite.config.ts', 'package.json', 'web']) {
          expect(rootFiles).not.toContain(f);
        }
        const dockerfile = await readFile(join(projectPath, 'Dockerfile'), 'utf-8');
        expect(dockerfile).not.toContain('web-build');
      });

      it('con un frontend en el payload arma Dockerfile y nginx desde su contrato', async () => {
        await createProject({
          name: 'test-with-frontend',
          topology: 'monolith',
          destinationPath: testDir,
          target: 'laravel',
          frontends: [
            {
              dir: 'web',
              contract: {
                version: '0',
                kind: 'frontend',
                target: 'x',
                platform: 'web',
                runtimeRequirements: { binaries: [] },
                build: { image: 'node:22-alpine', installCommand: 'npm ci', buildCommand: 'npm run build', outputDir: 'dist' },
                serve: 'static',
                dev: { command: 'npm run dev', port: 3000 },
                apiBaseEnv: 'API_URL',
              },
            },
          ],
        });

        const projectPath = join(testDir, 'test-with-frontend');
        const dockerfile = await readFile(join(projectPath, 'Dockerfile'), 'utf-8');
        expect(dockerfile).toContain('FROM node:22-alpine AS web-build');
        expect(dockerfile).toContain('COPY --from=web-build /app/web/dist /var/www/html/public/spa');
        const nginx = await readFile(join(projectPath, 'docker', 'nginx', 'nginx.conf'), 'utf-8');
        expect(nginx).toContain('root /var/www/html/public/spa;');
        const gitignore = await readFile(join(projectPath, '.gitignore'), 'utf-8');
        expect(gitignore).toContain('/web/dist');
      });

      it('/ responde sin vista Blade y conserva /api/health', async () => {
        await createProject({
          name: 'test-php-routes',
          topology: 'monolith',
          destinationPath: testDir,
          target: 'laravel',
        });

        const projectPath = join(testDir, 'test-php-routes');
        const apiRoutes = await readFile(join(projectPath, 'routes', 'api.php'), 'utf-8');
        expect(apiRoutes).toContain("Route::get('/health'");

        const webRoutes = await readFile(join(projectPath, 'routes', 'web.php'), 'utf-8');
        expect(webRoutes).not.toContain('view(');
        expect(webRoutes).toContain('Laravel configurado y funcionando');
        const files = await readdir(projectPath);
        expect(files).not.toContain('resources');
      });
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

    it('NO incluye manifiestos fractal.project.yml (responsabilidad del core)', async () => {
      const payload: CreateProjectPayload = {
        name: 'test-manifest',
        topology: 'multirepo',
        destinationPath: testDir,
        target: 'laravel',
      };

      await createProject(payload);

      const apiFiles = await readdir(join(testDir, 'test-manifest-api'));
      const webFiles = await readdir(join(testDir, 'test-manifest-web'));

      // El adapter ya no escribe fractal.project.yml (ADR-0012)
      expect(apiFiles).not.toContain('fractal.project.yml');
      expect(webFiles).not.toContain('fractal.project.yml');
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

    it('propaga errores de generación con step y mensaje legible', async () => {
      const invalidPath = join(testDir, 'file-not-dir');
      await writeFile(invalidPath, 'content');

      const payload: CreateProjectPayload = {
        name: 'test-error',
        topology: 'monolith',
        destinationPath: invalidPath,
        target: 'laravel',
      };

      const response = await createProject(payload);

      expect(response.success).toBe(false);
      if (!response.success) {
        expect(response.error.message).toContain('Error al generar monolito');
        expect(response.error.step).toBe('generación-monolito');
      }
    });
  });
});
