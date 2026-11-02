/**
 * Tests de los cinco brazos del wizard v2 (SPEC-0032, AC-5, AC-7).
 *
 * Verifica que cada brazo cumple el contrato y tiene la responsabilidad esperada.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  CodeArm,
  FRAMEWORK_OPTIONS,
  DATABASE_OPTIONS,
  FRONTEND_OPTIONS,
  DEFAULT_FRAMEWORK,
  DEFAULT_DATABASE,
  DEFAULT_FRONTEND,
} from './code-arm.js';
import { DomainArm } from './domain-arm.js';
import { InfrastructureArm } from './infrastructure-arm.js';
import { GitHubArm } from './github-arm.js';
import { DatabaseArm } from './database-arm.js';
import type { WizardContext } from '../../types/wizard-arm.js';

describe('CodeArm', () => {
  it('cumple el contrato WizardArm', () => {
    const arm = new CodeArm();

    expect(arm.id).toBe('code');
    expect(arm.name).toBe('Código');
    expect(arm.responsibility).toContain('framework');
    expect(arm.required).toBe(true);
    expect(typeof arm.isEnabled).toBe('function');
    expect(typeof arm.execute).toBe('function');
  });

  it('siempre está habilitado (obligatorio)', () => {
    const arm = new CodeArm();

    expect(arm.isEnabled({})).toBe(true);
    expect(arm.isEnabled({ projectName: 'test' })).toBe(true);
  });

  it('tiene opciones de framework con defaults sensatos (AC-3)', () => {
    expect(FRAMEWORK_OPTIONS).toHaveLength(1);
    expect(FRAMEWORK_OPTIONS[0]?.value).toBe('laravel');
    expect(DEFAULT_FRAMEWORK).toBe('laravel');
  });

  it('tiene opciones de base de datos con defaults sensatos (AC-3)', () => {
    expect(DATABASE_OPTIONS).toHaveLength(1);
    expect(DATABASE_OPTIONS[0]?.value).toBe('postgresql');
    expect(DEFAULT_DATABASE).toBe('postgresql');
  });

  it('tiene opciones de frontend con defaults sensatos (AC-3)', () => {
    expect(FRONTEND_OPTIONS).toHaveLength(1);
    expect(FRONTEND_OPTIONS[0]?.value).toBe('react-vite');
    expect(DEFAULT_FRONTEND).toBe('react-vite');
  });

  it('en modo non-interactive devuelve contexto sin modificar', async () => {
    const arm = new CodeArm();
    const context: WizardContext = { mode: 'non-interactive', projectName: 'test' };

    const result = await arm.execute(context);

    expect(result.success).toBe(true);
    expect(result.context).toEqual(context);
  });

  it('en modo skip devuelve contexto sin modificar', async () => {
    const arm = new CodeArm();
    const context: WizardContext = { mode: 'skip', projectName: 'test' };

    const result = await arm.execute(context);

    expect(result.success).toBe(true);
    expect(result.context).toEqual(context);
  });

  it('los selectores se muestran aunque haya una sola opción (AC-2)', () => {
    // Este test verifica la estructura de las opciones; los prompts
    // reales se prueban en integration tests.
    expect(FRAMEWORK_OPTIONS.length).toBe(1);
    expect(DATABASE_OPTIONS.length).toBe(1);
    expect(FRONTEND_OPTIONS.length).toBe(1);
  });
});

describe('DomainArm', () => {
  it('cumple el contrato WizardArm', () => {
    const arm = new DomainArm();

    expect(arm.id).toBe('domain');
    expect(arm.name).toBe('Dominio (FDL)');
    expect(arm.responsibility).toContain('FDL');
    expect(arm.required).toBe(false);
    expect(typeof arm.isEnabled).toBe('function');
    expect(typeof arm.execute).toBe('function');
  });

  it('está deshabilitado por defecto (placeholder)', () => {
    const arm = new DomainArm();

    expect(arm.isEnabled({})).toBe(false);
  });

  it('ejecuta sin error (placeholder)', async () => {
    const arm = new DomainArm();
    const context: WizardContext = {};

    const result = await arm.execute(context);

    expect(result.success).toBe(true);
  });
});

describe('InfrastructureArm', () => {
  it('cumple el contrato WizardArm', () => {
    const arm = new InfrastructureArm();

    expect(arm.id).toBe('infrastructure');
    expect(arm.name).toBe('Infraestructura');
    expect(arm.responsibility).toContain('IP');
    expect(arm.required).toBe(false);
    expect(typeof arm.isEnabled).toBe('function');
    expect(typeof arm.execute).toBe('function');
  });

  it('está deshabilitado por defecto (placeholder)', () => {
    const arm = new InfrastructureArm();

    expect(arm.isEnabled({})).toBe(false);
  });

  it('ejecuta sin error (placeholder)', async () => {
    const arm = new InfrastructureArm();
    const context: WizardContext = {};

    const result = await arm.execute(context);

    expect(result.success).toBe(true);
  });
});

describe('GitHubArm', () => {
  it('cumple el contrato WizardArm', () => {
    const arm = new GitHubArm();

    expect(arm.id).toBe('github');
    expect(arm.name).toBe('GitHub');
    expect(arm.responsibility).toContain('repo');
    expect(arm.required).toBe(false);
    expect(typeof arm.isEnabled).toBe('function');
    expect(typeof arm.execute).toBe('function');
  });

  it('está deshabilitado por defecto (placeholder)', () => {
    const arm = new GitHubArm();

    expect(arm.isEnabled({})).toBe(false);
  });

  it('ejecuta sin error (placeholder)', async () => {
    const arm = new GitHubArm();
    const context: WizardContext = {};

    const result = await arm.execute(context);

    expect(result.success).toBe(true);
  });
});

describe('DatabaseArm', () => {
  it('cumple el contrato WizardArm', () => {
    const arm = new DatabaseArm();

    expect(arm.id).toBe('database');
    expect(arm.name).toBe('Base de datos');
    expect(arm.responsibility).toContain('contraseña');
    expect(arm.required).toBe(false);
    expect(typeof arm.isEnabled).toBe('function');
    expect(typeof arm.execute).toBe('function');
  });

  it('se habilita solo si hay infraestructura (condicional)', () => {
    const arm = new DatabaseArm();

    expect(arm.isEnabled({})).toBe(false);
    expect(arm.isEnabled({ infrastructure: undefined })).toBe(false);

    const withInfra: WizardContext = {
      infrastructure: {
        serverIp: '1.2.3.4',
        sshUser: 'root',
        authMethod: 'key',
        domain: 'test.com',
        email: 'test@test.com',
        dnsProvider: 'manual',
      },
    };

    expect(arm.isEnabled(withInfra)).toBe(true);
  });

  it('ejecuta sin error (placeholder)', async () => {
    const arm = new DatabaseArm();
    const context: WizardContext = {};

    const result = await arm.execute(context);

    expect(result.success).toBe(true);
  });
});

describe('cinco brazos del wizard v2', () => {
  it('existen los cinco brazos modelados', () => {
    const code = new CodeArm();
    const domain = new DomainArm();
    const infrastructure = new InfrastructureArm();
    const github = new GitHubArm();
    const database = new DatabaseArm();

    const ids = [code.id, domain.id, infrastructure.id, github.id, database.id];

    expect(ids).toEqual(['code', 'domain', 'infrastructure', 'github', 'database']);
  });
});
