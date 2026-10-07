/**
 * Tests para el contrato del adapter Laravel.
 */

import { describe, it, expect } from 'vitest';
import {
  getAdapterContract,
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
