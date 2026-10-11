import { describe, it, expect } from 'vitest';
import { ComposeGenerator } from './compose-generator.js';
import type { ComposeConfig } from './types.js';
import type { DeployRuntime } from '@fractal/core';

/**
 * Snapshots del docker-compose.yml generado para los runtimes del contrato
 * del adapter (FRA-51). Paralelo a workflow-snapshots.test.ts. Verifica que
 * el `port` del contrato se consume vía `expose` (DECISION 1) y que el set de
 * servicios/puertos publicados se mantiene estable.
 *
 * El header del compose no lleva timestamp, así que no hace falta normalizar.
 */
const BACKEND_RUNTIME: DeployRuntime = {
  services: ['app', 'nginx', 'db', 'redis', 'worker', 'scheduler'],
  buildCommand: 'composer install --no-dev --optimize-autoloader',
  migrateCommand: 'php artisan migrate --force',
  postDeployCommands: [
    'php artisan config:clear',
    'php artisan route:clear',
    'php artisan view:clear',
    'php artisan cache:clear',
  ],
  port: 8000,
  healthcheck: { path: '/api/health' },
};

const FRONTEND_RUNTIME: DeployRuntime = {
  services: ['nginx'],
  buildCommand: 'npm run build',
  port: 80,
  healthcheck: { path: '/health.txt' },
};

describe('Compose Snapshots', () => {
  const generator = new ComposeGenerator();

  it('should generate consistent docker-compose for backend-full', () => {
    const config: ComposeConfig = {
      runtime: BACKEND_RUNTIME,
      projectName: 'myapi',
      outputPath: '/home/deploy/docker-compose.yml',
    };

    const result = generator.generate(config);
    expect(result.success).toBe(true);
    expect(result.content).toMatchSnapshot();
  });

  it('should generate consistent docker-compose for frontend-static', () => {
    const config: ComposeConfig = {
      runtime: FRONTEND_RUNTIME,
      projectName: 'myweb',
      outputPath: '/home/deploy/docker-compose.yml',
    };

    const result = generator.generate(config);
    expect(result.success).toBe(true);
    expect(result.content).toMatchSnapshot();
  });

  it('should generate consistent docker-compose for multirepo api (backend)', () => {
    const config: ComposeConfig = {
      runtime: BACKEND_RUNTIME,
      projectName: 'project-api',
      outputPath: '/home/deploy/docker-compose.yml',
    };

    const result = generator.generate(config);
    expect(result.success).toBe(true);
    expect(result.content).toMatchSnapshot();
  });

  it('should generate consistent docker-compose for multirepo web (frontend)', () => {
    const config: ComposeConfig = {
      runtime: FRONTEND_RUNTIME,
      projectName: 'project-web',
      outputPath: '/home/deploy/docker-compose.yml',
    };

    const result = generator.generate(config);
    expect(result.success).toBe(true);
    expect(result.content).toMatchSnapshot();
  });
});
