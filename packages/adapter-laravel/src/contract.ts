/**
 * Contrato del adapter Laravel.
 * 
 * Declara los requisitos de runtime (PHP, Composer) y la configuración
 * de deploy para proyectos Laravel, cumpliendo con SPEC-0006 AC-2 y AC-3.
 */

import { randomBytes } from 'node:crypto';
import type {
  AdapterContract,
  RuntimeRequirements,
  DeployRuntime,
  DeployTarget,
} from '@fractal/core';

/**
 * Nombre de la variable de entorno de la clave de aplicación de Laravel.
 * La app no arranca sin ella: el middleware web (EncryptCookies) la requiere,
 * por lo que `/` devolvería 500 si falta.
 */
export const LARAVEL_APP_KEY_ENV = 'APP_KEY';

/**
 * Genera una clave de aplicación fresca en el formato que Laravel espera
 * (`base64:` + 32 bytes aleatorios en base64).
 *
 * El origen de aleatoriedad es inyectable para que los tests y snapshots sean
 * deterministas (se pasa una fuente fija); en producción usa `crypto`.
 *
 * @param randomSource Fuente de bytes aleatorios (default: node:crypto)
 */
export function generateAppKey(
  randomSource: (size: number) => Buffer = (size) => randomBytes(size)
): string {
  return `base64:${randomSource(32).toString('base64')}`;
}

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
 * El runtime de backend incluye además una `secretEnv` con una APP_KEY
 * generada fresca en cada invocación (una por deploy), inyectada luego por la
 * capa de deploy en los servicios de aplicación. El frontend estático
 * (nginx-only) no corre la app, por lo que no lleva secretEnv.
 *
 * @param target Target de deploy cuyo runtime se pide (default 'backend-full')
 * @param options.generateAppKey Generador de APP_KEY inyectable (para tests);
 *   por default genera una clave aleatoria fresca.
 * @returns Contrato del adapter Laravel con el runtime del target pedido
 */
export function getAdapterContract(
  target: DeployTarget = 'backend-full',
  options: { generateAppKey?: () => string } = {}
): LaravelAdapterContract {
  if (target === 'frontend-static') {
    return {
      name: 'laravel',
      version: '0',
      runtimeRequirements: LARAVEL_RUNTIME_REQUIREMENTS,
      deployRuntime: LARAVEL_FRONTEND_DEPLOY_RUNTIME,
    };
  }

  const appKey = (options.generateAppKey ?? generateAppKey)();
  const deployRuntime: DeployRuntime = {
    ...LARAVEL_BACKEND_DEPLOY_RUNTIME,
    secretEnv: {
      [LARAVEL_APP_KEY_ENV]: appKey,
    },
  };

  return {
    name: 'laravel',
    version: '0',
    runtimeRequirements: LARAVEL_RUNTIME_REQUIREMENTS,
    deployRuntime,
  };
}
