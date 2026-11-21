/**
 * Contrato del adapter Laravel.
 * 
 * Declara los requisitos de runtime (PHP, Composer) y la configuración
 * de deploy para proyectos Laravel, cumpliendo con SPEC-0006 AC-2 y AC-3.
 */

import { randomBytes } from 'node:crypto';
import {
  computeLayout,
  type AdapterContract,
  type RuntimeRequirements,
  type DeployRuntime,
  type ProjectTopology,
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
 * Obtiene el contrato del adapter Laravel (target 'backend-full': backend
 * Laravel completo, LARAVEL_BACKEND_DEPLOY_RUNTIME). El runtime del frontend estático (`frontend-static`) lo declara el adapter
 * frontend (FRA-117); el deploy del rol web le pide el contrato a él.
 *
 * El runtime de backend incluye además una `secretEnv` con una APP_KEY
 * generada fresca en cada invocación (una por deploy), inyectada luego por la
 * capa de deploy en los servicios de aplicación. El frontend estático
 * (nginx-only) no corre la app, por lo que no lleva secretEnv.
 *
 * @param options.generateAppKey Generador de APP_KEY inyectable (para tests);
 *   por default genera una clave aleatoria fresca.
 * @returns Contrato del adapter Laravel con el runtime del backend
 */
/**
 * Construye las variables de entorno de producción del backend Laravel que la
 * capa de deploy inyecta en los servicios de aplicación (app/worker/scheduler).
 *
 * Incluye la APP_KEY fresca, el modo de producción, la URL pública (si se
 * conoce el dominio) y la conexión a la base de datos PostgreSQL del compose.
 * Los valores de base de datos usan sustitución de docker compose
 * (`${VAR:-default}`) para coincidir con el servicio `db` del compose sin
 * hornear secretos en el archivo; el default de nombre/usuario replica el del
 * servicio `db` (el projectName).
 */
function buildBackendSecretEnv(
  appKey: string,
  domain?: string,
  projectName?: string,
  webDomain?: string
): Record<string, string> {
  const dbName = projectName && projectName.trim() !== '' ? projectName : 'app';
  const secretEnv: Record<string, string> = {
    [LARAVEL_APP_KEY_ENV]: appKey,
    APP_ENV: 'production',
    APP_DEBUG: 'false',
    // Laravel 12 defaulta sesión/cache/queue a \`database\`. El primer
    // fractal deploy no corre migrate; sin estas overrides \`/\` da 500
    // (sessions/cache tables inexistentes). file/sync igualan .env.example.
    SESSION_DRIVER: 'file',
    CACHE_STORE: 'file',
    QUEUE_CONNECTION: 'sync',
    DB_CONNECTION: 'pgsql',
    DB_PORT: '5432',
    DB_DATABASE: `\${DB_DATABASE:-${dbName}}`,
    DB_USERNAME: `\${DB_USERNAME:-${dbName}}`,
    DB_PASSWORD: '${DB_PASSWORD}',
  };
  if (domain && domain.trim() !== '') {
    secretEnv.APP_URL = `https://${domain}`;
  }
  // FRA-112 (multirepo): el origen del frontend hermano. config/cors.php lo lee.
  if (webDomain && webDomain.trim() !== '') {
    secretEnv.CORS_ALLOWED_ORIGIN = `https://${webDomain}`;
    secretEnv.SANCTUM_STATEFUL_DOMAINS = webDomain;
  }
  return secretEnv;
}

/**
 * Build del backend según la topología (FRA-114). El contexto es siempre la
 * raíz del repo (la etapa Node compila el frontend desde ahí); en monorepo el
 * Dockerfile vive en el directorio del backend (`api/Dockerfile`).
 */
export function backendBuildFor(
  topology?: ProjectTopology
): NonNullable<DeployRuntime['build']> {
  if (topology === 'monorepo') {
    const backendDir = computeLayout('monorepo', 'app').backend.path;
    return { context: '.', dockerfile: `${backendDir}/Dockerfile` };
  }
  return LARAVEL_BACKEND_DEPLOY_RUNTIME.build!;
}

export function getAdapterContract(
  options: {
    generateAppKey?: () => string;
    domain?: string;
    projectName?: string;
    /** Topología del proyecto desplegado (de fractal/manifest.json). */
    topology?: ProjectTopology;
    /** Dominio del frontend hermano (multirepo): se permite en CORS. */
    siblingDomain?: string;
  } = {}
): LaravelAdapterContract {
  const appKey = (options.generateAppKey ?? generateAppKey)();
  const deployRuntime: DeployRuntime = {
    ...LARAVEL_BACKEND_DEPLOY_RUNTIME,
    build: backendBuildFor(options.topology),
    secretEnv: buildBackendSecretEnv(appKey, options.domain, options.projectName, options.siblingDomain),
  };

  return {
    name: 'laravel',
    version: '0',
    runtimeRequirements: LARAVEL_RUNTIME_REQUIREMENTS,
    deployRuntime,
  };
}
