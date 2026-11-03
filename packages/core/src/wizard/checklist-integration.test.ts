/**
 * Tests de integración: checklist + orquestador (FRA-83).
 *
 * Verifica que las respuestas del checklist habiliten/deshabiliten correctamente
 * los brazos vía el orquestador (SPEC-0032 AC-1, AC-2, AC-3).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { orchestrateWizard } from './orchestrator.js';
import {
  ChecklistArm,
  CodeArm,
  InfrastructureArm,
  GitHubArm,
  DatabaseArm,
} from './arms/index.js';
import type { WizardContext } from '../types/wizard-arm.js';

vi.mock('../utils/github-repo.js');

describe('Integración checklist + orquestador', () => {
  beforeEach(async () => {
    // Mock de las funciones de GitHub para los tests de integración
    const {
      createGitHubRepository,
      pushRepositoryToGitHub,
      setGitHubActionsSecrets,
      getAuthenticatedUser,
    } = await import('../utils/github-repo.js');

    const mockCreate = vi.mocked(createGitHubRepository);
    const mockPush = vi.mocked(pushRepositoryToGitHub);
    const mockSetSecrets = vi.mocked(setGitHubActionsSecrets);
    const mockGetUser = vi.mocked(getAuthenticatedUser);

    mockCreate.mockResolvedValue({
      owner: 'testuser',
      name: 'test-repo',
      htmlUrl: 'https://github.com/testuser/test-repo',
      cloneUrl: 'https://github.com/testuser/test-repo.git',
    });

    mockGetUser.mockResolvedValue({ login: 'testuser' });

    mockSetSecrets.mockResolvedValue({
      set: ['DOCKER_REGISTRY_USER', 'DOCKER_REGISTRY_TOKEN'],
      failed: [],
    });

    mockPush.mockReturnValue(undefined);
  });

  describe('orden de ejecución', () => {
    it('el checklist corre primero, antes que cualquier otro brazo', async () => {
      const arms = [
        new ChecklistArm(),
        new CodeArm(),
        new InfrastructureArm(),
        new GitHubArm({ localRepositories: [] }),
        new DatabaseArm(),
      ];

      const initialContext: WizardContext = {
        mode: 'non-interactive',
        // Sin datos: todos los brazos opcionales deshabilitados
      };

      const result = await orchestrateWizard({
        arms,
        initialContext,
      });

      expect(result.success).toBe(true);

      // ChecklistArm debe ser el primero ejecutado
      expect(result.executedArms[0]).toBe('checklist');

      // CodeArm debe ser el segundo (siempre habilitado)
      expect(result.executedArms[1]).toBe('code');

      // Otros brazos opcionales deben estar salteados
      expect(result.skippedArms).toContain('infrastructure');
      expect(result.skippedArms).toContain('github');
      expect(result.skippedArms).toContain('database');
    });
  });

  describe('caso: hasServer=no → infraestructura deshabilitada', () => {
    it('saltea el brazo de infraestructura si hasServer != yes', async () => {
      const arms = [
        new ChecklistArm(),
        new CodeArm(),
        new InfrastructureArm(),
        new DatabaseArm(),
      ];

      const initialContext: WizardContext = {
        mode: 'non-interactive',
        // Sin infraestructura → hasServer derivado a 'later'
      };

      const result = await orchestrateWizard({
        arms,
        initialContext,
      });

      expect(result.success).toBe(true);
      expect(result.executedArms).toContain('checklist');
      expect(result.executedArms).toContain('code');

      // Infraestructura y Database deben estar salteados
      expect(result.skippedArms).toContain('infrastructure');
      expect(result.skippedArms).toContain('database');
    });

    it('habilita el brazo de infraestructura si hasServer=yes', async () => {
      const arms = [
        new ChecklistArm(),
        new CodeArm(),
        new InfrastructureArm(),
        new DatabaseArm(),
      ];

      const initialContext: WizardContext = {
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

      const result = await orchestrateWizard({
        arms,
        initialContext,
      });

      expect(result.success).toBe(true);

      // Infraestructura debe estar ejecutado (placeholder devuelve success)
      expect(result.executedArms).toContain('infrastructure');

      // DatabaseArm se habilita porque hay datos de infraestructura
      expect(result.executedArms).toContain('database');
    });
  });

  describe('caso: hasGitHubToken=yes → GitHub habilitado', () => {
    it('saltea el brazo de GitHub si hasGitHubToken=no', async () => {
      const arms = [new ChecklistArm(), new CodeArm(), new GitHubArm({ localRepositories: [] })];

      const initialContext: WizardContext = {
        mode: 'non-interactive',
        // Sin token de GitHub
      };

      const result = await orchestrateWizard({
        arms,
        initialContext,
      });

      expect(result.success).toBe(true);
      expect(result.skippedArms).toContain('github');
    });

    it('habilita el brazo de GitHub si hasGitHubToken=yes', async () => {
      const arms = [new ChecklistArm(), new CodeArm(), new GitHubArm({ localRepositories: [] })];

      const initialContext: WizardContext = {
        mode: 'non-interactive',
        github: {
          token: 'ghp_xxxx',
          repo: 'test-repo',
          visibility: 'private',
          productionBranch: 'main',
        },
      };

      const result = await orchestrateWizard({
        arms,
        initialContext,
      });

      expect(result.success).toBe(true);
      expect(result.executedArms).toContain('github');
    });
  });

  describe('caso: Database condicional a infraestructura', () => {
    it('Database deshabilitado si no hay infraestructura', async () => {
      const arms = [new ChecklistArm(), new CodeArm(), new DatabaseArm()];

      const initialContext: WizardContext = {
        mode: 'non-interactive',
      };

      const result = await orchestrateWizard({
        arms,
        initialContext,
      });

      expect(result.success).toBe(true);
      expect(result.skippedArms).toContain('database');
    });

    it('Database habilitado si hay infraestructura', async () => {
      const arms = [new ChecklistArm(), new CodeArm(), new DatabaseArm()];

      const initialContext: WizardContext = {
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

      const result = await orchestrateWizard({
        arms,
        initialContext,
      });

      expect(result.success).toBe(true);
      expect(result.executedArms).toContain('database');
    });
  });

  describe('casos combinados', () => {
    it('solo checklist + code si el usuario no tiene nada', async () => {
      const arms = [
        new ChecklistArm(),
        new CodeArm(),
        new InfrastructureArm(),
        new GitHubArm({ localRepositories: [] }),
        new DatabaseArm(),
      ];

      const initialContext: WizardContext = {
        mode: 'non-interactive',
      };

      const result = await orchestrateWizard({
        arms,
        initialContext,
      });

      expect(result.success).toBe(true);
      expect(result.executedArms).toEqual(['checklist', 'code']);
      expect(result.skippedArms).toEqual(['infrastructure', 'github', 'database']);
    });

    it('checklist + code + infrastructure + database si tiene servidor', async () => {
      const arms = [
        new ChecklistArm(),
        new CodeArm(),
        new InfrastructureArm(),
        new GitHubArm({ localRepositories: [] }),
        new DatabaseArm(),
      ];

      const initialContext: WizardContext = {
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

      const result = await orchestrateWizard({
        arms,
        initialContext,
      });

      expect(result.success).toBe(true);
      expect(result.executedArms).toEqual(['checklist', 'code', 'infrastructure', 'database']);
      expect(result.skippedArms).toEqual(['github']);
    });

    it('checklist + code + github si tiene token pero no servidor', async () => {
      const arms = [
        new ChecklistArm(),
        new CodeArm(),
        new InfrastructureArm(),
        new GitHubArm({ localRepositories: [] }),
        new DatabaseArm(),
      ];

      const initialContext: WizardContext = {
        mode: 'non-interactive',
        github: {
          token: 'ghp_xxxx',
          repo: 'test-repo',
          visibility: 'private',
          productionBranch: 'main',
        },
      };

      const result = await orchestrateWizard({
        arms,
        initialContext,
      });

      expect(result.success).toBe(true);
      expect(result.executedArms).toEqual(['checklist', 'code', 'github']);
      expect(result.skippedArms).toEqual(['infrastructure', 'database']);
    });

    it('todos los brazos si tiene servidor + token GitHub', async () => {
      const arms = [
        new ChecklistArm(),
        new CodeArm(),
        new InfrastructureArm(),
        new GitHubArm({ localRepositories: [] }),
        new DatabaseArm(),
      ];

      const initialContext: WizardContext = {
        mode: 'non-interactive',
        infrastructure: {
          serverIp: '1.2.3.4',
          sshUser: 'deploy',
          authMethod: 'key',
          domain: 'example.com',
          email: 'test@example.com',
          dnsProvider: 'manual',
        },
        github: {
          token: 'ghp_xxxx',
          repo: 'test-repo',
          visibility: 'private',
          productionBranch: 'main',
        },
      };

      const result = await orchestrateWizard({
        arms,
        initialContext,
      });

      expect(result.success).toBe(true);
      expect(result.executedArms).toEqual([
        'checklist',
        'code',
        'infrastructure',
        'github',
        'database',
      ]);
      expect(result.skippedArms).toEqual([]);
    });
  });
});
