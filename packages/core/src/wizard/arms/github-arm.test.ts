/**
 * Tests del GitHubArm (FRA-86).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubArm } from './github-arm.js';
import type { WizardContext } from '../../types/wizard-arm.js';

vi.mock('../../utils/github-repo.js');

describe('GitHubArm', () => {
  let arm: GitHubArm;
  const mockLocalRepos = ['/tmp/test-project'];

  beforeEach(() => {
    arm = new GitHubArm({ localRepositories: mockLocalRepos });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('contrato básico', () => {
    it('tiene id "github"', () => {
      expect(arm.id).toBe('github');
    });

    it('no es requerido (brazo opcional)', () => {
      expect(arm.required).toBe(false);
    });
  });

  describe('isEnabled', () => {
    it('está habilitado si el checklist indica hasGitHubToken=yes', () => {
      const context: WizardContext = {
        checklist: {
          hasServer: 'no',
          hasDomain: 'no',
          hasGitHubToken: 'yes',
        },
      };

      expect(arm.isEnabled(context)).toBe(true);
    });

    it('está deshabilitado si el checklist indica hasGitHubToken=no', () => {
      const context: WizardContext = {
        checklist: {
          hasServer: 'no',
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

  describe('execute - camino feliz monolith', () => {
    it('crea el repo, pushea y setea secrets de GitHub', async () => {
      const {
        createGitHubRepository,
        pushRepositoryToGitHub,
        setGitHubActionsSecrets,
        getAuthenticatedUser,
      } = await import('../../utils/github-repo.js');

      const mockCreate = vi.mocked(createGitHubRepository);
      const mockPush = vi.mocked(pushRepositoryToGitHub);
      const mockSetSecrets = vi.mocked(setGitHubActionsSecrets);
      const mockGetUser = vi.mocked(getAuthenticatedUser);

      mockCreate.mockResolvedValueOnce({
        owner: 'testuser',
        name: 'test-project',
        htmlUrl: 'https://github.com/testuser/test-project',
        cloneUrl: 'https://github.com/testuser/test-project.git',
      });

      mockGetUser.mockResolvedValueOnce({ login: 'testuser' });

      mockSetSecrets.mockResolvedValueOnce({
        set: ['DOCKER_REGISTRY_USER', 'DOCKER_REGISTRY_TOKEN'],
        failed: [],
      });

      const context: WizardContext = {
        topology: 'monolith',
        github: {
          token: 'ghp_test123',
          owner: 'testuser',
          repo: 'test-project',
          visibility: 'private',
          productionBranch: 'main',
        },
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(true);
      expect(result.context.githubOutcome?.repos).toHaveLength(1);
      expect(result.context.githubOutcome?.repos[0]).toEqual({
        owner: 'testuser',
        name: 'test-project',
        htmlUrl: 'https://github.com/testuser/test-project',
        cloneUrl: 'https://github.com/testuser/test-project.git',
      });

      // Verificar que se llamó a createGitHubRepository
      expect(mockCreate).toHaveBeenCalledWith('ghp_test123', {
        name: 'test-project',
        owner: 'testuser',
        visibility: 'private',
      });

      // Verificar que se llamó a pushRepositoryToGitHub
      expect(mockPush).toHaveBeenCalledWith(
        '/tmp/test-project',
        'https://github.com/testuser/test-project.git',
        'ghp_test123',
        'main'
      );

      // Verificar que se setearon los secrets de GitHub
      expect(mockSetSecrets).toHaveBeenCalledWith(
        'ghp_test123',
        expect.objectContaining({ owner: 'testuser', name: 'test-project' }),
        expect.arrayContaining([
          { name: 'DOCKER_REGISTRY_USER', value: 'testuser' },
          { name: 'DOCKER_REGISTRY_TOKEN', value: 'ghp_test123' },
        ])
      );

      expect(result.context.githubOutcome?.secretsSet).toEqual([
        'DOCKER_REGISTRY_USER',
        'DOCKER_REGISTRY_TOKEN',
      ]);
    });

    it('infiere owner del token si no se proveyó', async () => {
      const {
        createGitHubRepository,
        pushRepositoryToGitHub,
        setGitHubActionsSecrets,
        getAuthenticatedUser,
      } = await import('../../utils/github-repo.js');

      const mockCreate = vi.mocked(createGitHubRepository);
      const mockPush = vi.mocked(pushRepositoryToGitHub);
      const mockSetSecrets = vi.mocked(setGitHubActionsSecrets);
      const mockGetUser = vi.mocked(getAuthenticatedUser);

      // createGitHubRepository internamente llama a getAuthenticatedUser cuando no hay owner
      mockGetUser.mockResolvedValue({ login: 'inferreduser' });

      mockCreate.mockResolvedValueOnce({
        owner: 'inferreduser',
        name: 'test-project',
        htmlUrl: 'https://github.com/inferreduser/test-project',
        cloneUrl: 'https://github.com/inferreduser/test-project.git',
      });

      mockSetSecrets.mockResolvedValueOnce({
        set: ['DOCKER_REGISTRY_USER', 'DOCKER_REGISTRY_TOKEN'],
        failed: [],
      });

      const context: WizardContext = {
        topology: 'monolith',
        github: {
          token: 'ghp_test456',
          repo: 'test-project',
          visibility: 'private',
          productionBranch: 'main',
        },
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(true);
      // Debe haber llamado a getAuthenticatedUser al menos una vez (en createGitHubRepository y/o buildGitHubSecrets)
      expect(mockGetUser).toHaveBeenCalled();
      
      // Verificar que DOCKER_REGISTRY_USER se seteó con el login inferido
      const secretsCall = mockSetSecrets.mock.calls[0];
      const secrets = secretsCall[2];
      const registryUserSecret = secrets.find((s) => s.name === 'DOCKER_REGISTRY_USER');
      expect(registryUserSecret?.value).toBe('inferreduser');
    });
  });

  describe('execute - multirepo', () => {
    it('crea repos -api y -web para topología multirepo', async () => {
      const arm = new GitHubArm({
        localRepositories: ['/tmp/test-project-api', '/tmp/test-project-web'],
      });

      const {
        createGitHubRepository,
        pushRepositoryToGitHub,
        setGitHubActionsSecrets,
        getAuthenticatedUser,
      } = await import('../../utils/github-repo.js');

      const mockCreate = vi.mocked(createGitHubRepository);
      const mockPush = vi.mocked(pushRepositoryToGitHub);
      const mockSetSecrets = vi.mocked(setGitHubActionsSecrets);
      const mockGetUser = vi.mocked(getAuthenticatedUser);

      mockCreate
        .mockResolvedValueOnce({
          owner: 'testuser',
          name: 'test-project-api',
          htmlUrl: 'https://github.com/testuser/test-project-api',
          cloneUrl: 'https://github.com/testuser/test-project-api.git',
        })
        .mockResolvedValueOnce({
          owner: 'testuser',
          name: 'test-project-web',
          htmlUrl: 'https://github.com/testuser/test-project-web',
          cloneUrl: 'https://github.com/testuser/test-project-web.git',
        });

      mockGetUser.mockResolvedValue({ login: 'testuser' });

      mockSetSecrets.mockResolvedValue({
        set: ['DOCKER_REGISTRY_USER', 'DOCKER_REGISTRY_TOKEN'],
        failed: [],
      });

      const context: WizardContext = {
        topology: 'multirepo',
        github: {
          token: 'ghp_test789',
          owner: 'testuser',
          repo: 'test-project',
          visibility: 'private',
          productionBranch: 'main',
        },
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(true);
      expect(result.context.githubOutcome?.repos).toHaveLength(2);
      expect(result.context.githubOutcome?.repos[0].name).toBe('test-project-api');
      expect(result.context.githubOutcome?.repos[1].name).toBe('test-project-web');

      // Verificar que se crearon ambos repos
      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(mockCreate).toHaveBeenNthCalledWith(1, 'ghp_test789', {
        name: 'test-project-api',
        owner: 'testuser',
        visibility: 'private',
      });
      expect(mockCreate).toHaveBeenNthCalledWith(2, 'ghp_test789', {
        name: 'test-project-web',
        owner: 'testuser',
        visibility: 'private',
      });

      // Verificar que se pushearon ambos repos
      expect(mockPush).toHaveBeenCalledTimes(2);

      // Verificar que se setearon secrets en ambos repos
      expect(mockSetSecrets).toHaveBeenCalledTimes(2);
    });
  });

  describe('execute - manejo de errores', () => {
    it('falla si no se provee token', async () => {
      const context: WizardContext = {
        github: {
          token: '',
          repo: 'test-project',
          visibility: 'private',
          productionBranch: 'main',
        },
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('GitHub habilitado pero no se proveyó token');
    });

    it('falla si no se provee nombre de repo', async () => {
      const context: WizardContext = {
        github: {
          token: 'ghp_test',
          repo: '',
          visibility: 'private',
          productionBranch: 'main',
        },
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('GitHub habilitado pero no se proveyó nombre de repositorio');
    });

    it('maneja error al crear el repositorio en GitHub', async () => {
      const { createGitHubRepository } = await import('../../utils/github-repo.js');

      const mockCreate = vi.mocked(createGitHubRepository);
      
      // Simular un error de la API de GitHub
      const apiError = new Error('El repositorio testuser/test-project ya existe o el nombre es inválido');
      apiError.name = 'GitHubApiError';
      (apiError as any).status = 422;
      
      mockCreate.mockRejectedValueOnce(apiError);

      const context: WizardContext = {
        github: {
          token: 'ghp_test',
          owner: 'testuser',
          repo: 'test-project',
          visibility: 'private',
          productionBranch: 'main',
        },
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Error al crear repositorio en GitHub');
      expect(result.error).toContain('ya existe o el nombre es inválido');
    });

    it('continúa si el push falla pero el repo fue creado, y setea secrets', async () => {
      const {
        createGitHubRepository,
        pushRepositoryToGitHub,
        setGitHubActionsSecrets,
        getAuthenticatedUser,
      } = await import('../../utils/github-repo.js');

      const mockCreate = vi.mocked(createGitHubRepository);
      const mockPush = vi.mocked(pushRepositoryToGitHub);
      const mockSetSecrets = vi.mocked(setGitHubActionsSecrets);
      const mockGetUser = vi.mocked(getAuthenticatedUser);

      mockCreate.mockResolvedValueOnce({
        owner: 'testuser',
        name: 'test-project',
        htmlUrl: 'https://github.com/testuser/test-project',
        cloneUrl: 'https://github.com/testuser/test-project.git',
      });

      mockGetUser.mockResolvedValueOnce({ login: 'testuser' });

      mockPush.mockImplementationOnce(() => {
        throw new Error('Connection timeout');
      });

      mockSetSecrets.mockResolvedValueOnce({
        set: ['DOCKER_REGISTRY_USER', 'DOCKER_REGISTRY_TOKEN'],
        failed: [],
      });

      const context: WizardContext = {
        topology: 'monolith',
        github: {
          token: 'ghp_test',
          owner: 'testuser',
          repo: 'test-project',
          visibility: 'private',
          productionBranch: 'main',
        },
      };

      const result = await arm.execute(context);

      // El resultado debe ser exitoso aunque el push haya fallado
      expect(result.success).toBe(true);
      expect(result.context.githubOutcome?.repos).toHaveLength(1);
      expect(result.context.githubOutcome?.pushWarnings).toEqual([{
        repo: 'test-project',
        error: 'Connection timeout',
      }]);

      // FRA-86 ronda 2: debe setear secrets aunque el push haya fallado
      expect(mockSetSecrets).toHaveBeenCalledWith(
        'ghp_test',
        expect.objectContaining({ owner: 'testuser', name: 'test-project' }),
        expect.arrayContaining([
          { name: 'DOCKER_REGISTRY_USER', value: 'testuser' },
          { name: 'DOCKER_REGISTRY_TOKEN', value: 'ghp_test' },
        ])
      );

      expect(result.context.githubOutcome?.secretsSet).toEqual([
        'DOCKER_REGISTRY_USER',
        'DOCKER_REGISTRY_TOKEN',
      ]);
    });

    it('crea ambos repos en multirepo aunque el push del primero falle', async () => {
      const arm = new GitHubArm({
        localRepositories: ['/tmp/test-project-api', '/tmp/test-project-web'],
      });

      const {
        createGitHubRepository,
        pushRepositoryToGitHub,
        setGitHubActionsSecrets,
        getAuthenticatedUser,
      } = await import('../../utils/github-repo.js');

      const mockCreate = vi.mocked(createGitHubRepository);
      const mockPush = vi.mocked(pushRepositoryToGitHub);
      const mockSetSecrets = vi.mocked(setGitHubActionsSecrets);
      const mockGetUser = vi.mocked(getAuthenticatedUser);

      mockCreate
        .mockResolvedValueOnce({
          owner: 'testuser',
          name: 'test-project-api',
          htmlUrl: 'https://github.com/testuser/test-project-api',
          cloneUrl: 'https://github.com/testuser/test-project-api.git',
        })
        .mockResolvedValueOnce({
          owner: 'testuser',
          name: 'test-project-web',
          htmlUrl: 'https://github.com/testuser/test-project-web',
          cloneUrl: 'https://github.com/testuser/test-project-web.git',
        });

      mockGetUser.mockResolvedValue({ login: 'testuser' });

      // Primer push falla, segundo push exitoso
      mockPush
        .mockImplementationOnce(() => {
          throw new Error('Push failed for -api');
        })
        .mockImplementationOnce(() => {
          // -web push exitoso
        });

      mockSetSecrets.mockResolvedValue({
        set: ['DOCKER_REGISTRY_USER', 'DOCKER_REGISTRY_TOKEN'],
        failed: [],
      });

      const context: WizardContext = {
        topology: 'multirepo',
        github: {
          token: 'ghp_test',
          owner: 'testuser',
          repo: 'test-project',
          visibility: 'private',
          productionBranch: 'main',
        },
      };

      const result = await arm.execute(context);

      // FRA-86 ronda 2: debe crear ambos repos aunque el primero falle en el push
      expect(result.success).toBe(true);
      expect(result.context.githubOutcome?.repos).toHaveLength(2);
      expect(result.context.githubOutcome?.repos[0].name).toBe('test-project-api');
      expect(result.context.githubOutcome?.repos[1].name).toBe('test-project-web');

      // Debe registrar el warning del primer repo
      expect(result.context.githubOutcome?.pushWarnings).toEqual([{
        repo: 'test-project-api',
        error: 'Push failed for -api',
      }]);

      // FRA-86 ronda 2: debe setear secrets en AMBOS repos aunque un push haya fallado
      expect(mockSetSecrets).toHaveBeenCalledTimes(2);
      expect(mockSetSecrets).toHaveBeenNthCalledWith(1, 'ghp_test',
        expect.objectContaining({ name: 'test-project-api' }),
        expect.arrayContaining([
          { name: 'DOCKER_REGISTRY_USER', value: 'testuser' },
          { name: 'DOCKER_REGISTRY_TOKEN', value: 'ghp_test' },
        ])
      );
      expect(mockSetSecrets).toHaveBeenNthCalledWith(2, 'ghp_test',
        expect.objectContaining({ name: 'test-project-web' }),
        expect.arrayContaining([
          { name: 'DOCKER_REGISTRY_USER', value: 'testuser' },
          { name: 'DOCKER_REGISTRY_TOKEN', value: 'ghp_test' },
        ])
      );

      // Secrets seteados 2 veces (una por repo), cada vez 2 secrets
      expect(result.context.githubOutcome?.secretsSet).toHaveLength(4);
    });
  });

  describe('independencia de infraestructura (AC-5)', () => {
    it('crea repo y setea secrets sin datos de infraestructura', async () => {
      const {
        createGitHubRepository,
        pushRepositoryToGitHub,
        setGitHubActionsSecrets,
        getAuthenticatedUser,
      } = await import('../../utils/github-repo.js');

      const mockCreate = vi.mocked(createGitHubRepository);
      const mockPush = vi.mocked(pushRepositoryToGitHub);
      const mockSetSecrets = vi.mocked(setGitHubActionsSecrets);
      const mockGetUser = vi.mocked(getAuthenticatedUser);

      mockCreate.mockResolvedValueOnce({
        owner: 'testuser',
        name: 'test-project',
        htmlUrl: 'https://github.com/testuser/test-project',
        cloneUrl: 'https://github.com/testuser/test-project.git',
      });

      mockGetUser.mockResolvedValueOnce({ login: 'testuser' });

      mockSetSecrets.mockResolvedValueOnce({
        set: ['DOCKER_REGISTRY_USER', 'DOCKER_REGISTRY_TOKEN'],
        failed: [],
      });

      const context: WizardContext = {
        topology: 'monolith',
        github: {
          token: 'ghp_test',
          owner: 'testuser',
          repo: 'test-project',
          visibility: 'private',
          productionBranch: 'main',
        },
        // NO hay infrastructure
      };

      const result = await arm.execute(context);

      expect(result.success).toBe(true);
      expect(result.context.githubOutcome?.repos).toHaveLength(1);

      // Verificar que SOLO se setearon secrets de GitHub, no de infraestructura
      const secretsCall = mockSetSecrets.mock.calls[0];
      const secrets = secretsCall[2];

      expect(secrets).toHaveLength(2);
      expect(secrets.map((s) => s.name)).toEqual([
        'DOCKER_REGISTRY_USER',
        'DOCKER_REGISTRY_TOKEN',
      ]);

      // NO debe incluir SSH_HOST, SSH_USER, SSH_PRIVATE_KEY, SSH_KNOWN_HOSTS, DB_PASSWORD
      const secretNames = secrets.map((s) => s.name);
      expect(secretNames).not.toContain('SSH_HOST');
      expect(secretNames).not.toContain('SSH_USER');
      expect(secretNames).not.toContain('SSH_PRIVATE_KEY');
      expect(secretNames).not.toContain('SSH_KNOWN_HOSTS');
      expect(secretNames).not.toContain('DB_PASSWORD');
    });
  });
});
