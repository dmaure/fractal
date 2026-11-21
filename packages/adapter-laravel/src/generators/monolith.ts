/**
 * Generador de proyecto Laravel en topología monolito.
 * 
 * Un repositorio sin packages separados. El frontend (adapter frontend,
 * FRA-116) vive en web/ y consume rutas bajo /api del mismo Laravel; este
 * generador solo arma el Dockerfile y el nginx desde el contrato del frontend.
 * 
 * @see ADR-0010 — topología monolito
 * @see ADR-0005 — frontend React + Vite + Sanctum Bearer
 */

import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { generateComposerJson } from '../stubs/composer.js';
import type { BackendFrontendRef } from '@fractal/core';
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
import { generateConsoleRoutes } from '../stubs/routes.js';
import { generateIndexPhp } from '../stubs/public-index.js';
import { writeDockerAssets } from './docker-assets.js';

/**
 * Genera un proyecto Laravel en topología monolito.
 * 
 * @param name - Nombre del proyecto
 * @param destinationPath - Path absoluto donde generar el proyecto
 * @returns Path del proyecto generado
 */
export async function generateMonolith(
  name: string,
  destinationPath: string,
  frontends: BackendFrontendRef[] = []
): Promise<string> {
  const projectPath = join(destinationPath, name);

  try {
    await mkdir(projectPath, { recursive: true });

    await generateBaseStructure(projectPath, name, frontends);
    await generateBootstrapDirectory(projectPath);
    await generateConfigDirectory(projectPath);
    await generateAppDirectory(projectPath);
    await generateDatabaseDirectory(projectPath);
    await generateStorageDirectory(projectPath);
    await generatePublicDirectory(projectPath);
    await generateRoutesDirectory(projectPath);
    await writeDockerAssets(projectPath, frontends);

    return projectPath;
  } catch (error) {
    throw {
      message: `Error al generar monolito: ${error instanceof Error ? error.message : 'desconocido'}`,
      step: 'generación-monolito',
    };
  }
}

async function generateBaseStructure(
  projectPath: string,
  name: string,
  frontends: BackendFrontendRef[]
): Promise<void> {
  await writeFile(
    join(projectPath, 'composer.json'),
    generateComposerJson(name, 'monolith')
  );

  await writeFile(join(projectPath, '.env.example'), generateEnvExample(name));

  await writeFile(join(projectPath, '.gitignore'), generateGitignore({ frontends }));

  await writeFile(
    join(projectPath, 'README.md'),
    generateReadme(name, 'monolith')
  );

  const artisanPath = join(projectPath, 'artisan');
  await writeFile(artisanPath, generateArtisan());
  await chmod(artisanPath, 0o755);
}

async function generateBootstrapDirectory(projectPath: string): Promise<void> {
  const bootstrapPath = join(projectPath, 'bootstrap');
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

async function generateConfigDirectory(projectPath: string): Promise<void> {
  const configPath = join(projectPath, 'config');
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

async function generateDatabaseDirectory(projectPath: string): Promise<void> {
  const databasePath = join(projectPath, 'database');
  await mkdir(join(databasePath, 'migrations'), { recursive: true });
  await mkdir(join(databasePath, 'seeders'), { recursive: true });

  await writeFile(
    join(databasePath, '.gitignore'),
    generateDatabaseGitignore()
  );

  await writeFile(join(databasePath, 'database.sqlite'), '');
}

async function generateStorageDirectory(projectPath: string): Promise<void> {
  const storagePath = join(projectPath, 'storage');

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

async function generateAppDirectory(projectPath: string): Promise<void> {
  const appPath = join(projectPath, 'app');
  await mkdir(appPath, { recursive: true });

  await mkdir(join(appPath, 'Http', 'Controllers', 'Api'), {
    recursive: true,
  });
  await mkdir(join(appPath, 'Models'), { recursive: true });
  
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
}

async function generatePublicDirectory(projectPath: string): Promise<void> {
  const publicPath = join(projectPath, 'public');
  await mkdir(publicPath, { recursive: true });

  await writeFile(join(publicPath, 'index.php'), generateIndexPhp());
}

async function generateRoutesDirectory(projectPath: string): Promise<void> {
  const routesPath = join(projectPath, 'routes');
  await mkdir(routesPath, { recursive: true });

  await writeFile(join(routesPath, 'api.php'), generateApiRoutes());
  await writeFile(join(routesPath, 'web.php'), generateWebRoutes());
  await writeFile(join(routesPath, 'console.php'), generateConsoleRoutes());
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

function generateWebRoutes(): string {
  return `<?php

use Illuminate\\Support\\Facades\\Route;

// Sin vistas (Blade no se usa). El SPA (web/) lo sirve nginx como estático; esta
// respuesta mínima solo se ve cuando no hay SPA servida (p. ej. \`php artisan serve\`).
Route::get('/', function () {
    return response('Laravel configurado y funcionando', 200)
        ->header('Content-Type', 'text/plain; charset=utf-8');
});
`;
}
