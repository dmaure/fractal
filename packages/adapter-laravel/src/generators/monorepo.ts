/**
 * Generador de proyecto Laravel en topología monorepo desacoplado.
 * 
 * Un repositorio con api/ (Laravel) y web/ (SPA Vite) como packages,
 * orquestados con Turborepo.
 * 
 * @see ADR-0010 — topología monorepo desacoplado
 * @see ADR-0005 — frontend React + Vite + Sanctum Bearer
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateComposerJson } from '../stubs/composer.js';
import { generatePackageJson } from '../stubs/package.js';
import { generateEnvExample } from '../stubs/env.js';
import { generateGitignore } from '../stubs/gitignore.js';
import { generateReadme } from '../stubs/readme.js';

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

  const appPath = join(apiPath, 'app');
  await mkdir(join(appPath, 'Http', 'Controllers', 'Api'), {
    recursive: true,
  });

  await writeFile(
    join(appPath, 'Http', 'Controllers', 'Api', 'HealthController.php'),
    generateHealthController()
  );

  const routesPath = join(apiPath, 'routes');
  await mkdir(routesPath, { recursive: true });
  await writeFile(join(routesPath, 'api.php'), generateApiRoutes());
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
