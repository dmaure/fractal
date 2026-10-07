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
  services: ['app', 'nginx', 'db', 'cache', 'worker', 'scheduler'],
  buildCommand: 'composer install --no-dev --optimize-autoloader',
  migrateCommand: 'php artisan migrate --force',
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
 * Obtiene el contrato del adapter Laravel.
 * 
 * En v0, retorna el contrato para backend completo como default.
 * El runtime específico por topología se resuelve en el momento de
 * generar el proyecto.
 * 
 * @returns Contrato del adapter Laravel
 */
export function getAdapterContract(): LaravelAdapterContract {
  return {
    name: 'laravel',
    version: '0',
    runtimeRequirements: LARAVEL_RUNTIME_REQUIREMENTS,
    deployRuntime: LARAVEL_BACKEND_DEPLOY_RUNTIME,
  };
}
