/**
 * Tests del InfrastructureArm (FRA-85).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InfrastructureArm } from './infrastructure-arm.js';
import type { WizardContext } from '../../types/wizard-arm.js';

vi.mock('../../utils/deploy-prompts.js');

describe('InfrastructureArm', () => {
  let arm: InfrastructureArm;

  beforeEach(() => {
    arm = new InfrastructureArm();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('contrato básico', () => {
    it('tiene id "infrastructure"', () => {
      expect(arm.id).toBe('infrastructure');
    });

    it('no es requerido (brazo opcional)', () => {
      expect(arm.required).toBe(false);
    });
  });

  describe('isEnabled', () => {
    it('está habilitado si el checklist indica hasServer=yes', () => {
      const context: WizardContext = {
        checklist: {
          hasServer: 'yes',
          hasDomain: 'no',
          hasGitHubToken: 'no',
        },
      };

      expect(arm.isEnabled(context)).toBe(true);
    });

    it('está deshabilitado si el checklist indica hasServer=no', () => {
      const context: WizardContext = {
        checklist: {
          hasServer: 'no',
          hasDomain: 'no',
          hasGitHubToken: 'no',
        },
      };

      expect(arm.isEnabled(context)).toBe(false);
    });

    it('está deshabilitado si el checklist indica hasServer=later', () => {
      const context: WizardContext = {
        checklist: {
          hasServer: 'later',
          hasDomain: 'no',
          hasGitHubToken: 'no',
        },
      };

      expect(arm.isEnabled(context)).toBe(false);
    });

    it('está deshabilitado si no hay checklist', () => {
      const context: WizardContext = {};

      expect(arm.isEnabled(context)).toBe(false);
    });
  });

  describe('modo interactivo', () => {
    it('ejecuta promptDeployParams y almacena los datos en context.infrastructure', async () => {
      const { promptDeployParams } = await import('../../utils/deploy-prompts.js');
      const mockPromptDeploy = vi.mocked(promptDeployParams);

      mockPromptDeploy.mockResolvedValueOnce({
        serverIp: '192.168.1.100',
        sshUser: 'root',
        authMethod: 'key',
        sshKeyPath: '/home/user/.ssh/id_ed25519',
        domain: 'example.com',
        email: 'admin@example.com',
        dnsProvider: 'cloudflare',
        dnsApiToken: 'cf-token-abc',
        productionBranch: 'main',
        gitRepository: 'https://github.com/owner/repo.git',
      });

      const context: WizardContext = {
        mode: 'interactive',
        checklist: {
          hasServer: 'yes',
          hasDomain: 'yes',
          hasGitHubToken: 'no',
        },
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(true);
      expect(result.context.infrastructure).toEqual({
        serverIp: '192.168.1.100',
        sshUser: 'root',
        authMethod: 'key',
        sshKeyPath: '/home/user/.ssh/id_ed25519',
        sshPassword: undefined,
        domain: 'example.com',
        email: 'admin@example.com',
        dnsProvider: 'cloudflare',
        dnsApiToken: 'cf-token-abc',
      });

      // Verificar que se llamó con skipGitRepository: true
      expect(mockPromptDeploy).toHaveBeenCalledWith(false, undefined, {
        skipGitRepository: true,
      });
    });

    it('maneja autenticación por contraseña', async () => {
      const { promptDeployParams } = await import('../../utils/deploy-prompts.js');
      const mockPromptDeploy = vi.mocked(promptDeployParams);

      mockPromptDeploy.mockResolvedValueOnce({
        serverIp: '10.0.0.5',
        sshUser: 'deploy',
        authMethod: 'password',
        sshPassword: 'secret123',
        domain: 'app.test',
        email: 'ops@test.com',
        dnsProvider: 'manual',
        productionBranch: 'main',
        gitRepository: '',
      });

      const context: WizardContext = {
        mode: 'interactive',
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(true);
      expect(result.context.infrastructure).toEqual({
        serverIp: '10.0.0.5',
        sshUser: 'deploy',
        authMethod: 'password',
        sshKeyPath: undefined,
        sshPassword: 'secret123',
        domain: 'app.test',
        email: 'ops@test.com',
        dnsProvider: 'manual',
        dnsApiToken: undefined,
      });
    });

    it('maneja errores en los prompts', async () => {
      const { promptDeployParams } = await import('../../utils/deploy-prompts.js');
      const mockPromptDeploy = vi.mocked(promptDeployParams);

      mockPromptDeploy.mockRejectedValueOnce(new Error('Usuario canceló'));

      const context: WizardContext = {
        mode: 'interactive',
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Usuario canceló');
    });
  });

  describe('modo no-interactivo', () => {
    it('usa los datos de infraestructura del contexto cuando están presentes', async () => {
      const context: WizardContext = {
        mode: 'non-interactive',
        infrastructure: {
          serverIp: '1.2.3.4',
          sshUser: 'deploy',
          authMethod: 'key',
          sshKeyPath: '/key/path',
          domain: 'prod.example.com',
          email: 'devops@example.com',
          dnsProvider: 'route53',
          dnsApiToken: 'aws-token',
        },
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(true);
      expect(result.context.infrastructure).toEqual(context.infrastructure);
    });

    it('falla si no hay datos de infraestructura en el contexto', async () => {
      const context: WizardContext = {
        mode: 'non-interactive',
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Datos de infraestructura requeridos');
    });
  });

  describe('modo skip', () => {
    it('usa los datos de infraestructura del contexto', async () => {
      const context: WizardContext = {
        mode: 'skip',
        infrastructure: {
          serverIp: '5.6.7.8',
          sshUser: 'ubuntu',
          authMethod: 'password',
          sshPassword: 'pass',
          domain: 'skip.example.com',
          email: 'skip@example.com',
          dnsProvider: 'manual',
        },
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(true);
      expect(result.context.infrastructure).toEqual(context.infrastructure);
    });

    it('falla si no hay datos de infraestructura', async () => {
      const context: WizardContext = {
        mode: 'skip',
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Datos de infraestructura requeridos');
    });
  });

  describe('camino local-only (FRA-85 AC-3)', () => {
    it('no se ejecuta cuando hasServer=no (deshabilitado)', () => {
      const context: WizardContext = {
        checklist: {
          hasServer: 'no',
          hasDomain: 'no',
          hasGitHubToken: 'no',
        },
      };

      expect(arm.isEnabled(context)).toBe(false);
    });

    it('no se ejecuta cuando hasServer=later (deshabilitado)', () => {
      const context: WizardContext = {
        checklist: {
          hasServer: 'later',
          hasDomain: 'no',
          hasGitHubToken: 'no',
        },
      };

      expect(arm.isEnabled(context)).toBe(false);
    });
  });
});
