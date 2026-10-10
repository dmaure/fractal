/**
 * Generador de proyecto Laravel en topología monorepo desacoplado.
 * 
 * Un repositorio con api/ (Laravel) y web/ (SPA Vite) como packages,
 * orquestados con Turborepo.
 * 
 * @see ADR-0010 — topología monorepo desacoplado
 * @see ADR-0005 — frontend React + Vite + Sanctum Bearer
 */

import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { generateComposerJson } from '../stubs/composer.js';
import { generatePackageJson } from '../stubs/package.js';
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

/**
 * Genera un proyecto Laravel en topología monorepo desacoplado.
 * 
 * @param name - Nombre del proyecto
 * @param destinationPath - Path absoluto donde generar el proyecto
 * @returns Path del proyecto generado
 */
export async function generateMonorepo(
  name: string,
  destinationPath: string
): Promise<string> {
  const projectPath = join(destinationPath, name);

  try {
    await mkdir(projectPath, { recursive: true });

    await generateRootStructure(projectPath, name);
    await generateApiPackage(projectPath, name);
    await generateWebPackage(projectPath, name);

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
  name: string
): Promise<void> {
  await writeFile(
    join(projectPath, 'package.json'),
    generateRootPackageJson(name)
  );

  await writeFile(
    join(projectPath, 'turbo.json'),
    generateTurboConfig()
  );

  await writeFile(join(projectPath, '.gitignore'), generateGitignore());

  await writeFile(
    join(projectPath, 'README.md'),
    generateReadme(name, 'monorepo')
  );
}

async function generateApiPackage(
  projectPath: string,
  name: string
): Promise<void> {
  const apiPath = join(projectPath, 'api');
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

async function generateWebPackage(
  projectPath: string,
  name: string
): Promise<void> {
  const webPath = join(projectPath, 'web');
  await mkdir(webPath, { recursive: true });

  await writeFile(
    join(webPath, 'package.json'),
    generatePackageJson(`${name}-web`, 'monorepo-web')
  );

  await writeFile(
    join(webPath, 'vite.config.ts'),
    generateViteConfig()
  );

  const srcPath = join(webPath, 'src');
  await mkdir(srcPath, { recursive: true });

  await writeFile(join(srcPath, 'App.tsx'), generateReactApp());
  await writeFile(join(srcPath, 'main.tsx'), generateMainTsx());
  await writeFile(join(srcPath, 'App.css'), generateAppCss());

  await mkdir(join(webPath, 'public'), { recursive: true });
  await writeFile(join(webPath, 'index.html'), generateIndexHtml(name));
}

function generateRootPackageJson(name: string): string {
  return JSON.stringify(
    {
      name,
      version: '0.0.0',
      private: true,
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

function generateViteConfig(): string {
  return `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
});
`;
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

function generateReactApp(): string {
  return `import React from 'react';
import './App.css';

function App() {
  return (
    <div className="container">
      <h1>Fractal Laravel App (Monorepo)</h1>
      <p>Tu aplicación está lista para desarrollar.</p>
    </div>
  );
}

export default App;
`;
}

function generateMainTsx(): string {
  return `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
`;
}

function generateAppCss(): string {
  return `body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
}

.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}
`;
}

function generateIndexHtml(name: string): string {
  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}
