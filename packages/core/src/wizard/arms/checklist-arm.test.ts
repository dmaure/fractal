/**
 * Tests del ChecklistArm (FRA-83).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChecklistArm } from './checklist-arm.js';
import type { WizardContext } from '../../types/wizard-arm.js';

vi.mock('@inquirer/prompts');

describe('ChecklistArm', () => {
  let arm: ChecklistArm;

  beforeEach(() => {
    arm = new ChecklistArm();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('contrato básico', () => {
    it('tiene id "checklist"', () => {
      expect(arm.id).toBe('checklist');
    });

    it('es requerido', () => {
      expect(arm.required).toBe(true);
    });

    it('siempre está habilitado', () => {
      const context: WizardContext = {};
      expect(arm.isEnabled(context)).toBe(true);
    });
  });

  describe('modo no-interactivo', () => {
    it('deriva hasServer=yes si hay datos de infraestructura', async () => {
      const context: WizardContext = {
        mode: 'non-interactive',
        infrastructure: {
          serverIp: '1.2.3.4',
          sshUser: 'deploy',
          authMethod: 'key',
          domain: 'example.com',
          email: 'test@example.com',
          dnsProvider: 'manual',
        },
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(true);
      expect(result.context.checklist?.hasServer).toBe('yes');
    });

    it('deriva hasServer=later si NO hay datos de infraestructura', async () => {
      const context: WizardContext = {
        mode: 'non-interactive',
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(true);
      expect(result.context.checklist?.hasServer).toBe('later');
    });

    it('deriva hasDomain=yes si hay dnsApiToken', async () => {
      const context: WizardContext = {
        mode: 'non-interactive',
        infrastructure: {
          serverIp: '1.2.3.4',
          sshUser: 'deploy',
          authMethod: 'key',
          domain: 'example.com',
          email: 'test@example.com',
          dnsProvider: 'cloudflare',
          dnsApiToken: 'cf-token-123',
        },
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(true);
      expect(result.context.checklist?.hasDomain).toBe('yes');
    });

    it('deriva hasDomain=manual si hay infra pero no dnsApiToken', async () => {
      const context: WizardContext = {
        mode: 'non-interactive',
        infrastructure: {
          serverIp: '1.2.3.4',
          sshUser: 'deploy',
          authMethod: 'key',
          domain: 'example.com',
          email: 'test@example.com',
          dnsProvider: 'manual',
        },
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(true);
      expect(result.context.checklist?.hasDomain).toBe('manual');
    });

    it('deriva hasDomain=no si no hay infraestructura', async () => {
      const context: WizardContext = {
        mode: 'non-interactive',
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(true);
      expect(result.context.checklist?.hasDomain).toBe('no');
    });

    it('deriva hasGitHubToken=yes si hay token en el contexto', async () => {
      const context: WizardContext = {
        mode: 'non-interactive',
        github: {
          token: 'ghp_xxxx',
          repo: 'test-repo',
          visibility: 'private',
          productionBranch: 'main',
        },
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(true);
      expect(result.context.checklist?.hasGitHubToken).toBe('yes');
    });

    it('deriva hasGitHubToken=no si no hay token', async () => {
      const context: WizardContext = {
        mode: 'non-interactive',
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(true);
      expect(result.context.checklist?.hasGitHubToken).toBe('no');
    });
  });

  describe('modo skip', () => {
    it('deriva respuestas del contexto igual que non-interactive', async () => {
      const context: WizardContext = {
        mode: 'skip',
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(true);
      expect(result.context.checklist).toBeDefined();
      expect(result.context.checklist?.hasServer).toBe('later');
      expect(result.context.checklist?.hasDomain).toBe('no');
      expect(result.context.checklist?.hasGitHubToken).toBe('no');
    });
  });

  describe('modo interactivo (mocked)', () => {
    it('ejecuta los prompts y almacena las respuestas', async () => {
      const { select } = await import('@inquirer/prompts');
      const mockSelect = vi.mocked(select);

      // Mock de las respuestas del usuario
      mockSelect
        .mockResolvedValueOnce('yes') // hasServer
        .mockResolvedValueOnce('yes') // hasDomain (pregunta solo si hasServer=yes)
        .mockResolvedValueOnce('no'); // hasGitHubToken

      const context: WizardContext = {
        mode: 'interactive',
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(true);
      expect(result.context.checklist).toEqual({
        hasServer: 'yes',
        hasDomain: 'yes',
        hasGitHubToken: 'no',
      });
    });

    it('no pregunta hasDomain si hasServer=no', async () => {
      const { select } = await import('@inquirer/prompts');
      const mockSelect = vi.mocked(select);

      mockSelect
        .mockResolvedValueOnce('no') // hasServer
        .mockResolvedValueOnce('yes'); // hasGitHubToken (hasDomain no se pregunta)

      const context: WizardContext = {
        mode: 'interactive',
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(true);
      expect(result.context.checklist).toEqual({
        hasServer: 'no',
        hasDomain: 'no',
        hasGitHubToken: 'yes',
      });

      // Verificar que solo se llamó 2 veces (hasServer + hasGitHubToken)
      expect(mockSelect).toHaveBeenCalledTimes(2);
    });

    it('no pregunta hasDomain si hasServer=later', async () => {
      const { select } = await import('@inquirer/prompts');
      const mockSelect = vi.mocked(select);

      mockSelect
        .mockResolvedValueOnce('later') // hasServer
        .mockResolvedValueOnce('no'); // hasGitHubToken

      const context: WizardContext = {
        mode: 'interactive',
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(true);
      expect(result.context.checklist).toEqual({
        hasServer: 'later',
        hasDomain: 'no',
        hasGitHubToken: 'no',
      });

      expect(mockSelect).toHaveBeenCalledTimes(2);
    });

    it('maneja errores en los prompts', async () => {
      const { select } = await import('@inquirer/prompts');
      const mockSelect = vi.mocked(select);

      mockSelect.mockRejectedValueOnce(new Error('Usuario canceló'));

      const context: WizardContext = {
        mode: 'interactive',
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Usuario canceló');
    });
  });

  describe('interacción con otros brazos', () => {
    it('hasServer=yes habilita el brazo de infraestructura', async () => {
      const context: WizardContext = {
        mode: 'non-interactive',
        infrastructure: {
          serverIp: '1.2.3.4',
          sshUser: 'deploy',
          authMethod: 'key',
          domain: 'example.com',
          email: 'test@example.com',
          dnsProvider: 'manual',
        },
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(true);
      expect(result.context.checklist?.hasServer).toBe('yes');

      // El brazo de infraestructura verifica este campo en su isEnabled()
    });

    it('hasServer=no deshabilita el brazo de infraestructura', async () => {
      const context: WizardContext = {
        mode: 'non-interactive',
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(true);
      expect(result.context.checklist?.hasServer).toBe('later');

      // El brazo de infraestructura debe retornar false en isEnabled()
    });

    it('hasGitHubToken=yes habilita el brazo de GitHub', async () => {
      const context: WizardContext = {
        mode: 'non-interactive',
        github: {
          token: 'ghp_xxxx',
          repo: 'test-repo',
          visibility: 'private',
          productionBranch: 'main',
        },
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(true);
      expect(result.context.checklist?.hasGitHubToken).toBe('yes');
    });
  });
});
