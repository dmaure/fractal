/**
 * Contrato del adapter Laravel.
 * 
 * Declara los requisitos de runtime (PHP, Composer) y la configuración
 * de deploy para proyectos Laravel, cumpliendo con SPEC-0006 AC-2 y AC-3.
 */

import type {
  AdapterContract,
  RuntimeRequirements,
  DeployRuntime,
  DeployTarget,
} from '@fractal/core';

/**
 * Contrato completo del adapter Laravel.
 * 
 * Extensión del contrato base que puede incluir metadatos específicos
 * de Laravel en el futuro.
 */
export interface LaravelAdapterContract extends AdapterContract {
  readonly name: 'laravel';
}

/**
 * Requisitos de runtime para proyectos Laravel.
 * 
 * @see SPEC-0006 AC-2
 */
export const LARAVEL_RUNTIME_REQUIREMENTS: RuntimeRequirements = {
  binaries: [
    {
      name: 'php',
      minVersion: '8.2.0',
      displayName: 'PHP',
    },
    {
      name: 'composer',
      minVersion: '2.5.0',
      displayName: 'Composer',
    },
  ],
};

/**
 * Runtime de deploy para backend Laravel completo (monolith y monorepo).
 * 
 * @see SPEC-0006 AC-3
 * @see ADR-0006 — runtime Docker Compose
 */
export const LARAVEL_BACKEND_DEPLOY_RUNTIME: DeployRuntime = {
  services: ['app', 'nginx', 'db', 'redis', 'worker', 'scheduler'],
  build: {
    context: '.',
    dockerfile: 'Dockerfile',
  },
  buildCommand: 'composer install --no-dev --optimize-autoloader',
  migrateCommand: 'php artisan migrate --force',
  postDeployCommands: [
    'php artisan config:clear',
    'php artisan route:clear',
    'php artisan view:clear',
    'php artisan cache:clear',
  ],
  port: 8000,
  healthcheck: {
    path: '/api/health',
  },
};

/**
 * Runtime de deploy para frontend estático en multirepo (package web/).
 * 
 * @see SPEC-0006 AC-3
 * @see ADR-0013 — runtime nginx-only
 */
export const LARAVEL_FRONTEND_DEPLOY_RUNTIME: DeployRuntime = {
  services: ['nginx'],
  buildCommand: 'npm run build',
  port: 80,
  healthcheck: {
    path: '/health.txt',
  },
};

/**
 * Obtiene el contrato del adapter Laravel para el target de deploy pedido.
 *
 * El `deployRuntime` devuelto corresponde al target solicitado:
 * - 'backend-full' (default): backend Laravel completo
 *   (LARAVEL_BACKEND_DEPLOY_RUNTIME).
 * - 'frontend-static': frontend estático nginx-only del repo web/ en
 *   multirepo (LARAVEL_FRONTEND_DEPLOY_RUNTIME, ADR-0013).
 *
 * @param target Target de deploy cuyo runtime se pide (default 'backend-full')
 * @returns Contrato del adapter Laravel con el runtime del target pedido
 */
export function getAdapterContract(
  target: DeployTarget = 'backend-full'
): LaravelAdapterContract {
  const deployRuntime =
    target === 'frontend-static'
      ? LARAVEL_FRONTEND_DEPLOY_RUNTIME
      : LARAVEL_BACKEND_DEPLOY_RUNTIME;

  return {
    name: 'laravel',
    version: '0',
    runtimeRequirements: LARAVEL_RUNTIME_REQUIREMENTS,
    deployRuntime,
  };
}
