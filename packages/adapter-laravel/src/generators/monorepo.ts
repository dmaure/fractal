/**
 * Generador de proyecto Laravel en topología monorepo desacoplado.
 * 
 * Un repositorio con api/ (Laravel) y web/ (generado por el adapter frontend) como packages,
 * orquestados con Turborepo.
 * 
 * @see ADR-0010 — topología monorepo desacoplado
 * @see ADR-0005 — frontend React + Vite + Sanctum Bearer
 */

import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { computeLayout, type BackendFrontendRef, type ProjectLayout } from '@fractal/core';
import { generateComposerJson } from '../stubs/composer.js';
import { generateEnvExample } from '../stubs/env.js';
import { generateGitignore } from '../stubs/gitignore.js';
import { generateReadme } from '../stubs/readme.js';
import { generateArtisan } from '../stubs/artisan.js';
import { generateBootstrapApp, generateBootstrapProviders, generateBootstrapCacheGitignore } from '../stubs/bootstrap.js';
import { generateConfigApp, generateConfigDatabase } from '../stubs/config.js';
import { generateAppServiceProvider } from '../stubs/providers.js';
import { generateDatabaseGitignore } from '../stubs/database.js';
import {
  generateStorageAppGitignore,
  generateStorageAppPublicGitignore,
  generateStorageFrameworkGitignore,
  generateStorageFrameworkCacheGitignore,
  generateStorageFrameworkCacheDataGitignore,
  generateStorageFrameworkSessionsGitignore,
  generateStorageFrameworkTestingGitignore,
  generateStorageFrameworkViewsGitignore,
  generateStorageLogsGitignore,
} from '../stubs/storage.js';
import { generateConsoleRoutes, generateApiWebRoutes } from '../stubs/routes.js';
import { generateIndexPhp } from '../stubs/public-index.js';
import { writeDockerAssets } from './docker-assets.js';

/**
 * Genera un proyecto Laravel en topología monorepo desacoplado.
 * 
 * @param name - Nombre del proyecto
 * @param destinationPath - Path absoluto donde generar el proyecto
 * @param layout - Layout de core (computeLayout); el frontend lo genera su adapter
 * @param frontends - Contratos de los frontends (FRA-116): el Dockerfile de
 *   api/ compila el frontend estático y nginx lo sirve en `/` (FRA-114)
 * @returns Path del proyecto generado
 */
export async function generateMonorepo(
  name: string,
  destinationPath: string,
  layout: ProjectLayout = computeLayout('monorepo', name),
  frontends: BackendFrontendRef[] = []
): Promise<string> {
  const projectPath = join(destinationPath, name);

  try {
    await mkdir(projectPath, { recursive: true });

    await generateRootStructure(projectPath, name, layout, frontends);
    await generateApiPackage(join(projectPath, layout.backend.path), name);
    await writeDockerAssets(projectPath, frontends, layout.backend.path);

    return projectPath;
  } catch (error) {
    throw {
      message: `Error al generar monorepo: ${error instanceof Error ? error.message : 'desconocido'}`,
      step: 'generación-monorepo',
    };
  }
}

async function generateRootStructure(
  projectPath: string,
  name: string,
  layout: ProjectLayout,
  frontends: BackendFrontendRef[]
): Promise<void> {
  // Los frontends son los packages del workspace (api/ es PHP, sin package.json).
  const workspaces = layout.frontends.map((f) => f.path);

  await writeFile(
    join(projectPath, 'package.json'),
    generateRootPackageJson(name, workspaces)
  );

  // turbo con pnpm lee los packages de pnpm-workspace.yaml.
  await writeFile(
    join(projectPath, 'pnpm-workspace.yaml'),
    `packages:\n${workspaces.map((w) => `  - '${w}'`).join('\n')}\n`
  );

  await writeFile(
    join(projectPath, 'turbo.json'),
    generateTurboConfig()
  );

  await writeFile(
    join(projectPath, '.gitignore'),
    generateGitignore({ frontends, backendDir: layout.backend.path })
  );

  await writeFile(
    join(projectPath, 'README.md'),
    generateReadme(name, 'monorepo')
  );
}

async function generateApiPackage(
  apiPath: string,
  name: string
): Promise<void> {
  await mkdir(apiPath, { recursive: true });

  await writeFile(
    join(apiPath, 'composer.json'),
    generateComposerJson(`${name}-api`, 'monorepo')
  );

  await writeFile(
    join(apiPath, '.env.example'),
    generateEnvExample(`${name}-api`)
  );

  const artisanPath = join(apiPath, 'artisan');
  await writeFile(artisanPath, generateArtisan());
  await chmod(artisanPath, 0o755);

  await generateBootstrapDirectory(apiPath);
  await generateConfigDirectory(apiPath);
  await generateDatabaseDirectory(apiPath);
  await generateStorageDirectory(apiPath);

  // Front controller: nginx le pasa /api/* a php-fpm vía public/index.php.
  await mkdir(join(apiPath, 'public'), { recursive: true });
  await writeFile(join(apiPath, 'public', 'index.php'), generateIndexPhp());

  const appPath = join(apiPath, 'app');
  await mkdir(join(appPath, 'Http', 'Controllers', 'Api'), {
    recursive: true,
  });
  
  const providersPath = join(appPath, 'Providers');
  await mkdir(providersPath, { recursive: true });
  await writeFile(
    join(providersPath, 'AppServiceProvider.php'),
    generateAppServiceProvider()
  );

  await writeFile(
    join(appPath, 'Http', 'Controllers', 'Api', 'HealthController.php'),
    generateHealthController()
  );

  const routesPath = join(apiPath, 'routes');
  await mkdir(routesPath, { recursive: true });
  await writeFile(join(routesPath, 'api.php'), generateApiRoutes());
  await writeFile(join(routesPath, 'web.php'), generateApiWebRoutes());
  await writeFile(join(routesPath, 'console.php'), generateConsoleRoutes());
}

async function generateBootstrapDirectory(apiPath: string): Promise<void> {
  const bootstrapPath = join(apiPath, 'bootstrap');
  await mkdir(bootstrapPath, { recursive: true });

  await writeFile(
    join(bootstrapPath, 'app.php'),
    generateBootstrapApp()
  );

  await writeFile(
    join(bootstrapPath, 'providers.php'),
    generateBootstrapProviders()
  );

  await mkdir(join(bootstrapPath, 'cache'), { recursive: true });
  await writeFile(
    join(bootstrapPath, 'cache', '.gitignore'),
    generateBootstrapCacheGitignore()
  );
}

async function generateConfigDirectory(apiPath: string): Promise<void> {
  const configPath = join(apiPath, 'config');
  await mkdir(configPath, { recursive: true });

  await writeFile(
    join(configPath, 'app.php'),
    generateConfigApp()
  );

  await writeFile(
    join(configPath, 'database.php'),
    generateConfigDatabase()
  );
}

async function generateDatabaseDirectory(apiPath: string): Promise<void> {
  const databasePath = join(apiPath, 'database');
  await mkdir(join(databasePath, 'migrations'), { recursive: true });
  await mkdir(join(databasePath, 'seeders'), { recursive: true });

  await writeFile(
    join(databasePath, '.gitignore'),
    generateDatabaseGitignore()
  );
}

async function generateStorageDirectory(apiPath: string): Promise<void> {
  const storagePath = join(apiPath, 'storage');

  await mkdir(join(storagePath, 'app', 'public'), { recursive: true });
  await writeFile(
    join(storagePath, 'app', '.gitignore'),
    generateStorageAppGitignore()
  );
  await writeFile(
    join(storagePath, 'app', 'public', '.gitignore'),
    generateStorageAppPublicGitignore()
  );

  await mkdir(join(storagePath, 'framework', 'cache', 'data'), { recursive: true });
  await mkdir(join(storagePath, 'framework', 'sessions'), { recursive: true });
  await mkdir(join(storagePath, 'framework', 'testing'), { recursive: true });
  await mkdir(join(storagePath, 'framework', 'views'), { recursive: true });
  await writeFile(
    join(storagePath, 'framework', '.gitignore'),
    generateStorageFrameworkGitignore()
  );
  await writeFile(
    join(storagePath, 'framework', 'cache', '.gitignore'),
    generateStorageFrameworkCacheGitignore()
  );
  await writeFile(
    join(storagePath, 'framework', 'cache', 'data', '.gitignore'),
    generateStorageFrameworkCacheDataGitignore()
  );
  await writeFile(
    join(storagePath, 'framework', 'sessions', '.gitignore'),
    generateStorageFrameworkSessionsGitignore()
  );
  await writeFile(
    join(storagePath, 'framework', 'testing', '.gitignore'),
    generateStorageFrameworkTestingGitignore()
  );
  await writeFile(
    join(storagePath, 'framework', 'views', '.gitignore'),
    generateStorageFrameworkViewsGitignore()
  );

  await mkdir(join(storagePath, 'logs'), { recursive: true });
  await writeFile(
    join(storagePath, 'logs', '.gitignore'),
    generateStorageLogsGitignore()
  );
}

function generateRootPackageJson(name: string, workspaces: string[]): string {
  return JSON.stringify(
    {
      name,
      version: '0.0.0',
      private: true,
      workspaces,
      scripts: {
        dev: 'turbo run dev',
        build: 'turbo run build',
        test: 'turbo run test',
      },
      devDependencies: {
        turbo: '^2.0.0',
      },
      packageManager: 'pnpm@9.0.0',
    },
    null,
    2
  );
}

function generateTurboConfig(): string {
  return JSON.stringify(
    {
      $schema: 'https://turbo.build/schema.json',
      tasks: {
        build: {
          dependsOn: ['^build'],
          outputs: ['dist/**', 'public/build/**'],
        },
        dev: {
          cache: false,
          persistent: true,
        },
        test: {
          dependsOn: ['^build'],
        },
      },
    },
    null,
    2
  );
}

function generateHealthController(): string {
  return `<?php

namespace App\\Http\\Controllers\\Api;

use Illuminate\\Http\\JsonResponse;

class HealthController
{
    public function check(): JsonResponse
    {
        return response()->json([
            'status' => 'healthy',
            'timestamp' => now()->toIso8601String(),
        ]);
    }
}
`;
}

function generateApiRoutes(): string {
  return `<?php

use App\\Http\\Controllers\\Api\\HealthController;
use Illuminate\\Support\\Facades\\Route;

Route::get('/health', [HealthController::class, 'check']);
`;
}
