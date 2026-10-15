/**
 * Tests para el contrato del adapter Laravel.
 */

import { describe, it, expect } from 'vitest';
import {
  getAdapterContract,
  generateAppKey,
  LARAVEL_APP_KEY_ENV,
  LARAVEL_RUNTIME_REQUIREMENTS,
  LARAVEL_BACKEND_DEPLOY_RUNTIME,
  LARAVEL_FRONTEND_DEPLOY_RUNTIME,
} from './contract.js';

describe('getAdapterContract', () => {
  it('retorna un contrato válido', () => {
    const contract = getAdapterContract();

    expect(contract.version).toBe('0');
    expect(contract.name).toBe('laravel');
    expect(contract.runtimeRequirements).toBeDefined();
    expect(contract.deployRuntime).toBeDefined();
  });

  it('incluye requisitos de runtime correctos', () => {
    const contract = getAdapterContract();

    expect(contract.runtimeRequirements.binaries).toHaveLength(2);

    const php = contract.runtimeRequirements.binaries.find(
      (b) => b.name === 'php'
    );
    expect(php).toBeDefined();
    expect(php?.minVersion).toBe('8.2.0');
    expect(php?.displayName).toBe('PHP');

    const composer = contract.runtimeRequirements.binaries.find(
      (b) => b.name === 'composer'
    );
    expect(composer).toBeDefined();
    expect(composer?.minVersion).toBe('2.5.0');
    expect(composer?.displayName).toBe('Composer');
  });

  it('incluye configuración de deploy runtime', () => {
    const contract = getAdapterContract();

    expect(contract.deployRuntime.services).toBeDefined();
    expect(contract.deployRuntime.port).toBeDefined();
    expect(contract.deployRuntime.healthcheck).toBeDefined();
    expect(contract.deployRuntime.healthcheck.path).toBeTruthy();
  });

  it('por default (sin target) retorna el runtime de backend completo', () => {
    const contract = getAdapterContract();

    expect(contract.deployRuntime.services).toEqual(
      LARAVEL_BACKEND_DEPLOY_RUNTIME.services
    );
    expect(contract.deployRuntime.port).toBe(8000);
  });

  it('con target backend-full retorna el runtime de backend', () => {
    const contract = getAdapterContract('backend-full');

    expect(contract.deployRuntime.services).toEqual(
      LARAVEL_BACKEND_DEPLOY_RUNTIME.services
    );
    expect(contract.deployRuntime.services).toContain('app');
  });

  it('inyecta una APP_KEY fresca con formato base64: en el runtime de backend', () => {
    const contract = getAdapterContract('backend-full');

    expect(contract.deployRuntime.secretEnv).toBeDefined();
    const appKey = contract.deployRuntime.secretEnv?.[LARAVEL_APP_KEY_ENV];
    expect(appKey).toBeDefined();
    expect(appKey).toMatch(/^base64:[A-Za-z0-9+/]+={0,2}$/);
    expect(appKey?.length).toBeGreaterThan('base64:'.length);
  });

  it('genera una APP_KEY distinta en cada invocación (fresca por deploy)', () => {
    const a = getAdapterContract('backend-full');
    const b = getAdapterContract('backend-full');

    expect(a.deployRuntime.secretEnv?.[LARAVEL_APP_KEY_ENV]).not.toBe(
      b.deployRuntime.secretEnv?.[LARAVEL_APP_KEY_ENV]
    );
  });

  it('permite inyectar el generador de APP_KEY (determinismo en tests)', () => {
    const contract = getAdapterContract('backend-full', {
      generateAppKey: () => 'base64:FIXED-TEST-KEY',
    });

    expect(contract.deployRuntime.secretEnv?.[LARAVEL_APP_KEY_ENV]).toBe(
      'base64:FIXED-TEST-KEY'
    );
  });

  it('el frontend estático (nginx-only) no lleva secretEnv', () => {
    const contract = getAdapterContract('frontend-static');

    expect(contract.deployRuntime.secretEnv).toBeUndefined();
  });

  it('con target frontend-static retorna el runtime de frontend (nginx-only)', () => {
    const contract = getAdapterContract('frontend-static');

    expect(contract.deployRuntime).toBe(LARAVEL_FRONTEND_DEPLOY_RUNTIME);
    expect(contract.deployRuntime.services).toEqual(['nginx']);
    expect(contract.deployRuntime.port).toBe(80);
    expect(contract.deployRuntime.healthcheck.path).toBe('/health.txt');
  });
});

describe('generateAppKey', () => {
  it('genera una clave con prefijo base64: y 32 bytes', () => {
    const key = generateAppKey();
    expect(key.startsWith('base64:')).toBe(true);
    const raw = Buffer.from(key.slice('base64:'.length), 'base64');
    expect(raw).toHaveLength(32);
  });

  it('genera claves distintas en invocaciones sucesivas', () => {
    expect(generateAppKey()).not.toBe(generateAppKey());
  });

  it('usa la fuente de aleatoriedad inyectada (determinismo)', () => {
    const fixed = generateAppKey(() => Buffer.alloc(32, 7));
    expect(fixed).toBe(`base64:${Buffer.alloc(32, 7).toString('base64')}`);
  });
});

describe('LARAVEL_RUNTIME_REQUIREMENTS', () => {
  it('declara PHP 8.2+ como requisito', () => {
    const php = LARAVEL_RUNTIME_REQUIREMENTS.binaries.find(
      (b) => b.name === 'php'
    );

    expect(php).toBeDefined();
    expect(php?.minVersion).toBe('8.2.0');
  });

  it('declara Composer 2.5+ como requisito', () => {
    const composer = LARAVEL_RUNTIME_REQUIREMENTS.binaries.find(
      (b) => b.name === 'composer'
    );

    expect(composer).toBeDefined();
    expect(composer?.minVersion).toBe('2.5.0');
  });
});

describe('LARAVEL_BACKEND_DEPLOY_RUNTIME', () => {
  it('incluye todos los servicios de backend completo', () => {
    expect(LARAVEL_BACKEND_DEPLOY_RUNTIME.services).toEqual([
      'app',
      'nginx',
      'db',
      'redis',
      'worker',
      'scheduler',
    ]);
  });

  it('declara comando de build', () => {
    expect(LARAVEL_BACKEND_DEPLOY_RUNTIME.buildCommand).toContain(
      'composer install'
    );
  });

  it('declara comando de migración', () => {
    expect(LARAVEL_BACKEND_DEPLOY_RUNTIME.migrateCommand).toContain(
      'php artisan migrate'
    );
  });

  it('expone puerto 8000', () => {
    expect(LARAVEL_BACKEND_DEPLOY_RUNTIME.port).toBe(8000);
  });

  it('declara healthcheck en /api/health', () => {
    expect(LARAVEL_BACKEND_DEPLOY_RUNTIME.healthcheck.path).toBe(
      '/api/health'
    );
  });

  it('declara los comandos post-deploy de limpieza de caché (FRA-51)', () => {
    expect(LARAVEL_BACKEND_DEPLOY_RUNTIME.postDeployCommands).toEqual([
      'php artisan config:clear',
      'php artisan route:clear',
      'php artisan view:clear',
      'php artisan cache:clear',
    ]);
  });
});

describe('LARAVEL_FRONTEND_DEPLOY_RUNTIME', () => {
  it('incluye solo nginx como servicio', () => {
    expect(LARAVEL_FRONTEND_DEPLOY_RUNTIME.services).toEqual(['nginx']);
  });

  it('declara comando de build npm', () => {
    expect(LARAVEL_FRONTEND_DEPLOY_RUNTIME.buildCommand).toBe('npm run build');
  });

  it('no declara comando de migración', () => {
    expect(LARAVEL_FRONTEND_DEPLOY_RUNTIME.migrateCommand).toBeUndefined();
  });

  it('expone puerto 80', () => {
    expect(LARAVEL_FRONTEND_DEPLOY_RUNTIME.port).toBe(80);
  });

  it('declara healthcheck en /health.txt', () => {
    expect(LARAVEL_FRONTEND_DEPLOY_RUNTIME.healthcheck.path).toBe(
      '/health.txt'
    );
  });
});
