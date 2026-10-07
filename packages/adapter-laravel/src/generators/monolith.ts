/**
 * Generador de proyecto Laravel en topología monolito.
 * 
 * Un repositorio sin packages separados. El SPA (React + Vite) vive
 * en resources/js y consume rutas bajo /api del mismo Laravel.
 * 
 * @see ADR-0010 — topología monolito
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
 * Genera un proyecto Laravel en topología monolito.
 * 
 * @param name - Nombre del proyecto
 * @param destinationPath - Path absoluto donde generar el proyecto
 * @returns Path del proyecto generado
 */
export async function generateMonolith(
  name: string,
  destinationPath: string
): Promise<string> {
  const projectPath = join(destinationPath, name);

  try {
    await mkdir(projectPath, { recursive: true });

    await generateBaseStructure(projectPath, name);
    await generateAppDirectory(projectPath);
    await generateResourcesDirectory(projectPath);
    await generatePublicDirectory(projectPath);
    await generateRoutesDirectory(projectPath);

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
  name: string
): Promise<void> {
  await writeFile(
    join(projectPath, 'composer.json'),
    generateComposerJson(name, 'monolith')
  );

  await writeFile(
    join(projectPath, 'package.json'),
    generatePackageJson(name, 'monolith')
  );

  await writeFile(join(projectPath, '.env.example'), generateEnvExample(name));

  await writeFile(join(projectPath, '.gitignore'), generateGitignore());

  await writeFile(
    join(projectPath, 'README.md'),
    generateReadme(name, 'monolith')
  );
}

async function generateAppDirectory(projectPath: string): Promise<void> {
  const appPath = join(projectPath, 'app');
  await mkdir(appPath, { recursive: true });

  await mkdir(join(appPath, 'Http', 'Controllers', 'Api'), {
    recursive: true,
  });
  await mkdir(join(appPath, 'Models'), { recursive: true });
  await mkdir(join(appPath, 'Providers'), { recursive: true });

  await writeFile(
    join(appPath, 'Http', 'Controllers', 'Api', 'HealthController.php'),
    generateHealthController()
  );
}

async function generateResourcesDirectory(projectPath: string): Promise<void> {
  const resourcesPath = join(projectPath, 'resources');
  await mkdir(join(resourcesPath, 'js'), { recursive: true });
  await mkdir(join(resourcesPath, 'css'), { recursive: true });

  await writeFile(
    join(resourcesPath, 'js', 'app.tsx'),
    generateReactApp()
  );

  await writeFile(
    join(resourcesPath, 'css', 'app.css'),
    generateAppCss()
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

function generateReactApp(): string {
  return `import React from 'react';
import ReactDOM from 'react-dom/client';
import '../css/app.css';

function App() {
  return (
    <div className="container">
      <h1>Fractal Laravel App</h1>
      <p>Tu aplicación está lista para desarrollar.</p>
    </div>
  );
}

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(<App />);
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

function generateIndexPhp(): string {
  return `<?php

define('LARAVEL_START', microtime(true));

require __DIR__.'/../vendor/autoload.php';

$app = require_once __DIR__.'/../bootstrap/app.php';

$kernel = $app->make(Illuminate\\Contracts\\Http\\Kernel::class);

$response = $kernel->handle(
    $request = Illuminate\\Http\\Request::capture()
);

$response->send();

$kernel->terminate($request, $response);
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

Route::get('/{any}', function () {
    return view('app');
})->where('any', '.*');
`;
}
