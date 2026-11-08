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

    // Regresión FRA-91: `npm run build` (vite build) corre desde la raíz del
    // proyecto (cwd = projectPath) y Vite resuelve su módulo de entrada desde
    // el index.html ubicado en esa raíz (su `root` por defecto). Sin index.html
    // el build abortaba con "Could not resolve entry module index.html".
    // Este test asegura que el scaffold emita el index.html en la raíz de Vite,
    // apuntando al entry del SPA, y un vite.config.ts que compile JSX/TSX.
    describe('build del frontend (FRA-91)', () => {
      it('emite index.html en la raíz (root de Vite) apuntando al entry del SPA', async () => {
        const payload: CreateProjectPayload = {
          name: 'test-vite-entry',
          topology: 'monolith',
          destinationPath: testDir,
          target: 'laravel',
        };

        await createProject(payload);

        const projectPath = join(testDir, 'test-vite-entry');
        const files = await readdir(projectPath);
        // El index.html vive junto al package.json (root por defecto de Vite),
        // que es el cwd desde el que corre `npm run build`.
        expect(files).toContain('index.html');
        expect(files).toContain('package.json');

        const indexHtml = await readFile(
          join(projectPath, 'index.html'),
          'utf-8'
        );
        // El módulo de entrada que Vite debe resolver.
        expect(indexHtml).toContain('src="/resources/js/app.tsx"');
        expect(indexHtml).toContain('<div id="root"></div>');

        // El entry referenciado existe realmente en el scaffold.
        const entryStat = await readFile(
          join(projectPath, 'resources', 'js', 'app.tsx'),
          'utf-8'
        );
        expect(entryStat).toContain('document.getElementById');
      });

      it('emite vite.config.ts que compila JSX/TSX y preserva el web root de Laravel', async () => {
        const payload: CreateProjectPayload = {
          name: 'test-vite-config',
          topology: 'monolith',
          destinationPath: testDir,
          target: 'laravel',
        };

        await createProject(payload);

        const projectPath = join(testDir, 'test-vite-config');
        const files = await readdir(projectPath);
        expect(files).toContain('vite.config.ts');

        const viteConfig = await readFile(
          join(projectPath, 'vite.config.ts'),
          'utf-8'
        );
        // plugin-react (ya declarado en devDependencies) compila el JSX/TSX.
        expect(viteConfig).toContain('@vitejs/plugin-react');
        // publicDir desactivado: public/ es el web root de Laravel, no los
        // assets estáticos de Vite; evita que Vite copie public/index.php.
        expect(viteConfig).toContain('publicDir: false');

        // La dependencia que usa el vite.config está declarada en package.json.
        const pkg = JSON.parse(
          await readFile(join(projectPath, 'package.json'), 'utf-8')
        );
        expect(pkg.devDependencies).toHaveProperty('@vitejs/plugin-react');
        expect(pkg.devDependencies).toHaveProperty('vite');
        expect(pkg.scripts.build).toBe('vite build');
      });

      it('preserva las rutas PHP / y /api/health (topología monolito intacta)', async () => {
        const payload: CreateProjectPayload = {
          name: 'test-php-routes',
          topology: 'monolith',
          destinationPath: testDir,
          target: 'laravel',
        };

        await createProject(payload);

        const projectPath = join(testDir, 'test-php-routes');
        const apiRoutes = await readFile(
          join(projectPath, 'routes', 'api.php'),
          'utf-8'
        );
        expect(apiRoutes).toContain("Route::get('/health'");

        const webRoutes = await readFile(
          join(projectPath, 'routes', 'web.php'),
          'utf-8'
        );
        expect(webRoutes).toContain("view('app')");
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
