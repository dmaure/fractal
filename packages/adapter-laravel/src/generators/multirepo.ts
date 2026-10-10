/**
 * Generador de proyecto Laravel en topología multirepo.
 * 
 * Dos carpetas de proyecto separadas (api/ y web/), cada una su propio
 * repositorio git. El manifiesto fractal.project.yml es responsabilidad
 * del core (ADR-0012), no del adapter.
 * 
 * @see ADR-0010 — topología multirepo
 * @see ADR-0012 — deploy multirepo: coordinación en el primer deploy
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
 * Genera un proyecto Laravel en topología multirepo.
 * 
 * Crea dos carpetas separadas: {name}-api/ y {name}-web/. El manifiesto
 * fractal.project.yml es generado posteriormente por el core (ADR-0012).
 * 
 * @param name - Nombre del proyecto
 * @param destinationPath - Path absoluto donde generar los proyectos
 * @returns Path base (directorio padre) donde se generaron ambos proyectos.
 *          Nota: a diferencia de monolith/monorepo que devuelven el path del
 *          proyecto generado, multirepo devuelve el directorio padre que contiene
 *          {name}-api/ y {name}-web/
 */
export async function generateMultirepo(
  name: string,
  destinationPath: string
): Promise<string> {
  try {
    const apiPath = join(destinationPath, `${name}-api`);
    const webPath = join(destinationPath, `${name}-web`);

    await generateApiRepo(apiPath, name);
    await generateWebRepo(webPath, name);

    return destinationPath;
  } catch (error) {
    throw {
      message: `Error al generar multirepo: ${error instanceof Error ? error.message : 'desconocido'}`,
      step: 'generación-multirepo',
    };
  }
}

async function generateApiRepo(apiPath: string, name: string): Promise<void> {
  await mkdir(apiPath, { recursive: true });

  await writeFile(
    join(apiPath, 'composer.json'),
    generateComposerJson(`${name}-api`, 'multirepo-api')
  );

  await writeFile(
    join(apiPath, '.env.example'),
    generateEnvExample(`${name}-api`)
  );

  await writeFile(join(apiPath, '.gitignore'), generateGitignore());

  await writeFile(
    join(apiPath, 'README.md'),
    generateReadme(`${name}-api`, 'multirepo-api')
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

async function generateWebRepo(webPath: string, name: string): Promise<void> {
  await mkdir(webPath, { recursive: true });

  await writeFile(
    join(webPath, 'package.json'),
    generatePackageJson(`${name}-web`, 'multirepo-web')
  );

  await writeFile(
    join(webPath, 'vite.config.ts'),
    generateViteConfig()
  );

  await writeFile(join(webPath, '.gitignore'), generateGitignore());

  await writeFile(
    join(webPath, 'README.md'),
    generateReadme(`${name}-web`, 'multirepo-web')
  );

  const srcPath = join(webPath, 'src');
  await mkdir(srcPath, { recursive: true });

  await writeFile(join(srcPath, 'App.tsx'), generateReactApp());
  await writeFile(join(srcPath, 'main.tsx'), generateMainTsx());
  await writeFile(join(srcPath, 'App.css'), generateAppCss());

  await mkdir(join(webPath, 'public'), { recursive: true });
  await writeFile(join(webPath, 'index.html'), generateIndexHtml(name));

  await writeFile(
    join(webPath, 'public', 'health.txt'),
    'ok'
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

function generateViteConfig(): string {
  return `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist',
  },
});
`;
}

function generateReactApp(): string {
  return `import React from 'react';
import './App.css';

function App() {
  return (
    <div className="container">
      <h1>Fractal Laravel App (Multirepo - Web)</h1>
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
