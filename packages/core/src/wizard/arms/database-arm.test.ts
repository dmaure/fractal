/**
 * Tests del DatabaseArm (FRA-87).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { password, select } from '@inquirer/prompts';
import { DatabaseArm } from './database-arm.js';
import { orchestrateWizard } from '../orchestrator.js';
import type { WizardArm, WizardContext } from '../../types/wizard-arm.js';

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  select: vi.fn(),
  password: vi.fn(),
  confirm: vi.fn(),
}));

const INFRASTRUCTURE: NonNullable<WizardContext['infrastructure']> = {
  serverIp: '1.2.3.4',
  sshUser: 'root',
  authMethod: 'key',
  domain: 'app.example.com',
  email: 'ops@example.com',
  dnsProvider: 'manual',
};

const DB_ENV_KEYS = ['FRACTAL_NEW_DB_PASSWORD', 'FRACTAL_DEPLOY_DB_PASSWORD'] as const;

describe('DatabaseArm', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    for (const key of DB_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of DB_ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  describe('condicional: solo con deploy', () => {
    it('sin deploy el orquestador saltea el brazo: no se pide ni se genera contraseña', async () => {
      const result = await orchestrateWizard({
        arms: [new DatabaseArm()],
        initialContext: { mode: 'interactive' },
      });

      expect(result.success).toBe(true);
      expect(result.skippedArms).toEqual(['database']);
      expect(result.context.databasePassword).toBeUndefined();
      expect(select).not.toHaveBeenCalled();
      expect(password).not.toHaveBeenCalled();
    });

    it('con deploy (infraestructura en el contexto) el brazo corre', async () => {
      vi.mocked(select).mockResolvedValue('generate');
      const infraStub: WizardArm = {
        id: 'infrastructure',
        name: 'Infraestructura',
        responsibility: 'stub',
        required: false,
        isEnabled: () => true,
        execute: async (context) => ({
          success: true,
          context: { ...context, infrastructure: INFRASTRUCTURE },
        }),
      };

      const result = await orchestrateWizard({
        arms: [infraStub, new DatabaseArm()],
        initialContext: { mode: 'interactive' },
      });

      expect(result.executedArms).toEqual(['infrastructure', 'database']);
      expect(result.context.databasePassword?.password).toMatch(/^[0-9a-f]{48}$/);
    });
  });

  describe('interactivo: generate-or-ask', () => {
    it('generate produce 48 hex y marca passwordGenerated', async () => {
      vi.mocked(select).mockResolvedValue('generate');

      const result = await new DatabaseArm().execute({ mode: 'interactive', infrastructure: INFRASTRUCTURE });

      expect(result.success).toBe(true);
      expect(result.context.databasePassword).toEqual({
        password: expect.stringMatching(/^[0-9a-f]{48}$/),
        passwordGenerated: true,
      });
      expect(password).not.toHaveBeenCalled();
    });

    it('ask toma el valor ingresado', async () => {
      vi.mocked(select).mockResolvedValue('ask');
      vi.mocked(password).mockResolvedValue('manual-secret');

      const result = await new DatabaseArm().execute({ mode: 'interactive', infrastructure: INFRASTRUCTURE });

      expect(result.context.databasePassword).toEqual({
        password: 'manual-secret',
        passwordGenerated: false,
      });
    });

    it('un error del prompt se reporta como fallo del brazo', async () => {
      vi.mocked(select).mockRejectedValue(new Error('cancelado'));

      const result = await new DatabaseArm().execute({ mode: 'interactive', infrastructure: INFRASTRUCTURE });

      expect(result.success).toBe(false);
      expect(result.error).toContain('cancelado');
    });
  });

  describe('no interactivo: precedencia flags/env', () => {
    const run = (options: ConstructorParameters<typeof DatabaseArm>[0] = {}) =>
      new DatabaseArm(options).execute({ mode: 'non-interactive', infrastructure: INFRASTRUCTURE });

    it('sin valor provisto genera la contraseña (default)', async () => {
      const result = await run();

      expect(result.context.databasePassword?.password).toMatch(/^[0-9a-f]{48}$/);
      expect(result.context.databasePassword?.passwordGenerated).toBe(true);
    });

    it('--generate-db-password genera', async () => {
      const result = await run({ generateDbPassword: true });

      expect(result.context.databasePassword?.passwordGenerated).toBe(true);
    });

    it('FRACTAL_DEPLOY_DB_PASSWORD se usa como fallback', async () => {
      process.env.FRACTAL_DEPLOY_DB_PASSWORD = 'deploy-pass';

      const result = await run();

      expect(result.context.databasePassword).toEqual({ password: 'deploy-pass', passwordGenerated: false });
    });

    it('FRACTAL_NEW_DB_PASSWORD gana sobre FRACTAL_DEPLOY_DB_PASSWORD', async () => {
      process.env.FRACTAL_NEW_DB_PASSWORD = 'new-pass';
      process.env.FRACTAL_DEPLOY_DB_PASSWORD = 'deploy-pass';

      const result = await run();

      expect(result.context.databasePassword?.password).toBe('new-pass');
    });

    it('--db-password gana sobre las variables de entorno', async () => {
      process.env.FRACTAL_NEW_DB_PASSWORD = 'new-pass';

      const result = await run({ dbPassword: 'flag-pass' });

      expect(result.context.databasePassword?.password).toBe('flag-pass');
    });

    it('un valor provisto gana aunque se pida --generate-db-password', async () => {
      const result = await run({ dbPassword: 'flag-pass', generateDbPassword: true });

      expect(result.context.databasePassword).toEqual({ password: 'flag-pass', passwordGenerated: false });
    });

    it('sin valor y con la generación desactivada, falla', async () => {
      const result = await run({ generateDbPassword: false });

      expect(result.success).toBe(false);
      expect(result.error).toContain('FRACTAL_NEW_DB_PASSWORD');
    });

    it('rechaza contraseñas con saltos de línea', async () => {
      const result = await run({ dbPassword: 'a\nb' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('saltos de línea');
    });
  });
});
