/**
 * Tests end-to-end con PHP y Composer reales.
 * 
 * Estos tests verifican que el proyecto Laravel generado sea ejecutable
 * con las herramientas estándar de Laravel. Si PHP o Composer no están
 * disponibles, los tests se saltean con mensaje explícito.
 * 
 * En CI, estos tests corren con PHP 8.2+ y Composer 2.5+ instalados
 * (ver .github/workflows/ci.yml).
 */

import { describe, it, expect } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { generateMonolith } from '../generators/monolith.js';
import { generateMonorepo } from '../generators/monorepo.js';
import { generateMultirepo } from '../generators/multirepo.js';

const execAsync = promisify(exec);

async function checkCommand(command: string): Promise<boolean> {
  try {
    await execAsync(`which ${command}`);
    return true;
  } catch {
    return false;
  }
}

async function getPhpVersion(): Promise<string | null> {
  try {
    const { stdout } = await execAsync('php --version');
    return stdout.trim();
  } catch {
    return null;
  }
}

async function getComposerVersion(): Promise<string | null> {
  try {
    const { stdout } = await execAsync('composer --version');
    return stdout.trim();
  } catch {
    return null;
  }
}

// Detectar PHP y Composer a nivel de módulo, antes de la colección de tests
const phpAvailable = await checkCommand('php');
const composerAvailable = await checkCommand('composer');

if (phpAvailable && composerAvailable) {
  const phpVersion = await getPhpVersion();
  const composerVersion = await getComposerVersion();
  console.log('\n✅ PHP y Composer disponibles:');
  console.log(`   ${phpVersion}`);
  console.log(`   ${composerVersion}\n`);
} else {
  console.log('\n⚠️  PHP o Composer no disponibles — tests E2E saltados');
  console.log('   Para ejecutar estos tests localmente, instala PHP 8.2+ y Composer 2.5+');
  console.log('   En CI, estos tests corren en .github/workflows/ci.yml (job e2e-laravel)\n');
}

describe('E2E con PHP y Composer reales', () => {
  const tempDir = join(tmpdir(), `fractal-e2e-${Date.now()}`);

  describe('Monolito', () => {
    it('genera proyecto Laravel ejecutable', { timeout: 120000 }, async (ctx) => {
      if (!phpAvailable || !composerAvailable) {
        ctx.skip();
        return;
      }

      await mkdir(tempDir, { recursive: true });
      const projectPath = await generateMonolith('test-monolith', tempDir);

        // Configurar git para composer install (laravel/framework requiere git)
        await execAsync('git config --global user.email "test@fractal.test"', {
          cwd: projectPath,
        });
        await execAsync('git config --global user.name "Fractal Test"', {
          cwd: projectPath,
        });

        // composer install
        console.log('   Ejecutando composer install...');
        const { stdout: composerOut } = await execAsync('composer install --no-interaction', {
          cwd: projectPath,
          env: { ...process.env, COMPOSER_NO_INTERACTION: '1', COMPOSER_AUDIT_BLOCK: '0' },
        });
        expect(composerOut).toContain('Generating optimized autoload files');

        // Crear .env
        await execAsync('cp .env.example .env', { cwd: projectPath });

        // php artisan key:generate
        console.log('   Ejecutando php artisan key:generate...');
        const { stdout: keyGen } = await execAsync('php artisan key:generate', {
          cwd: projectPath,
        });
        expect(keyGen).toContain('Application key set successfully');

        // php artisan --version
        console.log('   Ejecutando php artisan --version...');
        const { stdout: version, code: versionCode } = await execAsync(
          'php artisan --version',
          { cwd: projectPath }
        );
        expect(version).toContain('Laravel Framework');
        expect(versionCode).toBeFalsy();

        // php artisan route:list incluye api/health
        console.log('   Ejecutando php artisan route:list...');
        const { stdout: routeList } = await execAsync('php artisan route:list --json', {
          cwd: projectPath,
        });
        expect(routeList).toContain('api/health');

        // Iniciar servidor en background y probar /api/health
        console.log('   Iniciando servidor Laravel...');
        const serverProcess = exec('php artisan serve --port=8765', {
          cwd: projectPath,
        });

        // Esperar a que el servidor levante
        await new Promise((resolve) => setTimeout(resolve, 3000));

        try {
          // Probar /api/health con curl
          console.log('   Probando GET /api/health...');
          const { stdout: healthResponse } = await execAsync(
            'curl -s http://localhost:8765/api/health'
          );
          const health = JSON.parse(healthResponse);
          expect(health.status).toBe('healthy');
          expect(health.timestamp).toBeDefined();
          console.log('   ✅ /api/health respondió 200 con payload correcto');
        } finally {
          serverProcess.kill();
        }

        // Limpiar
        await rm(projectPath, { recursive: true, force: true });
      });
  });

  describe('Monorepo', () => {
    it('genera proyecto Laravel ejecutable en api/', { timeout: 120000 }, async (ctx) => {
      if (!phpAvailable || !composerAvailable) {
        ctx.skip();
        return;
      }

      await mkdir(tempDir, { recursive: true });
      const projectPath = await generateMonorepo('test-monorepo', tempDir);
        const apiPath = join(projectPath, 'api');

        await execAsync('git config --global user.email "test@fractal.test"', {
          cwd: apiPath,
        });
        await execAsync('git config --global user.name "Fractal Test"', {
          cwd: apiPath,
        });

        console.log('   Ejecutando composer install en api/...');
        await execAsync('composer install --no-interaction --no-audit', {
          cwd: apiPath,
          env: { ...process.env, COMPOSER_NO_INTERACTION: '1' },
        });

        await execAsync('cp .env.example .env', { cwd: apiPath });

        console.log('   Ejecutando php artisan key:generate...');
        await execAsync('php artisan key:generate', { cwd: apiPath });

        console.log('   Ejecutando php artisan --version...');
        const { stdout: version } = await execAsync('php artisan --version', {
          cwd: apiPath,
        });
        expect(version).toContain('Laravel Framework');

        console.log('   Ejecutando php artisan route:list...');
        const { stdout: routeList } = await execAsync('php artisan route:list --json', {
          cwd: apiPath,
        });
        expect(routeList).toContain('api/health');

        await rm(projectPath, { recursive: true, force: true });
      });
  });

  describe('Multirepo', () => {
    it('genera proyecto Laravel ejecutable en {nombre}-api/', { timeout: 120000 }, async (ctx) => {
      if (!phpAvailable || !composerAvailable) {
        ctx.skip();
        return;
      }

      await mkdir(tempDir, { recursive: true });
      await generateMultirepo('test-multirepo', tempDir);
        const apiPath = join(tempDir, 'test-multirepo-api');

        await execAsync('git config --global user.email "test@fractal.test"', {
          cwd: apiPath,
        });
        await execAsync('git config --global user.name "Fractal Test"', {
          cwd: apiPath,
        });

        console.log('   Ejecutando composer install en test-multirepo-api/...');
        await execAsync('composer install --no-interaction --no-audit', {
          cwd: apiPath,
          env: { ...process.env, COMPOSER_NO_INTERACTION: '1' },
        });

        await execAsync('cp .env.example .env', { cwd: apiPath });

        console.log('   Ejecutando php artisan key:generate...');
        await execAsync('php artisan key:generate', { cwd: apiPath });

        console.log('   Ejecutando php artisan --version...');
        const { stdout: version } = await execAsync('php artisan --version', {
          cwd: apiPath,
        });
        expect(version).toContain('Laravel Framework');

        console.log('   Ejecutando php artisan route:list...');
        const { stdout: routeList } = await execAsync('php artisan route:list --json', {
          cwd: apiPath,
        });
        expect(routeList).toContain('api/health');

        await rm(apiPath, { recursive: true, force: true });
        await rm(join(tempDir, 'test-multirepo-web'), { recursive: true, force: true });
      });
  });
});
