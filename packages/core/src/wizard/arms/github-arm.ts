/**
 * Brazo GitHub: crear repo remoto, setear secrets.
 * Opcional, independiente de infraestructura.
 *
 * SPEC-0032, AC-5, FRA-86.
 */

import type { WizardArm, WizardContext, WizardArmResult } from '../../types/wizard-arm.js';
import {
  createGitHubRepository,
  pushRepositoryToGitHub,
  setGitHubActionsSecrets,
  getAuthenticatedUser,
  type CreatedGitHubRepo,
  GitHubApiError,
} from '../../utils/github-repo.js';

export interface GitHubArmDependencies {
  localRepositories: string[];
}

export class GitHubArm implements WizardArm {
  readonly id = 'github';
  readonly name = 'GitHub';
  readonly responsibility = 'Crea repositorio remoto y setea secrets (opcional)';
  readonly required = false;

  constructor(private readonly dependencies: GitHubArmDependencies) {}

  isEnabled(context: WizardContext): boolean {
    // Habilitado si el checklist indica que el usuario tiene token de GitHub
    return context.checklist?.hasGitHubToken === 'yes';
  }

  async execute(context: WizardContext): Promise<WizardArmResult> {
    const { github, topology } = context;

    if (!github?.token) {
      return {
        success: false,
        context,
        error: 'GitHub habilitado pero no se proveyó token',
      };
    }

    if (!github.repo) {
      return {
        success: false,
        context,
        error: 'GitHub habilitado pero no se proveyó nombre de repositorio',
      };
    }

    try {
      // Determinar qué repositorios crear según la topología
      const repoSpecs = this.buildRepoSpecs(topology, github.repo);
      const createdRepos: CreatedGitHubRepo[] = [];
      const pushWarnings: Array<{ repo: string; error: string }> = [];

      // Crear repositorios en GitHub
      for (const spec of repoSpecs) {
        const created = await createGitHubRepository(github.token, {
          name: spec.name,
          owner: github.owner,
          visibility: github.visibility,
        });
        createdRepos.push(created);

        // Pushear el código inicial si hay un directorio local correspondiente
        const localRepo = this.dependencies.localRepositories.find((r) =>
          spec.localRepoPattern ? r.endsWith(spec.localRepoPattern) : r
        );

        if (localRepo) {
          try {
            pushRepositoryToGitHub(
              localRepo,
              created.cloneUrl,
              github.token,
              github.productionBranch
            );
          } catch (pushError) {
            // Repo creado pero push falló: acumular warning y continuar con el resto
            pushWarnings.push({
              repo: spec.name,
              error: pushError instanceof Error ? pushError.message : String(pushError),
            });
          }
        }
      }

      // Setear secrets de GitHub en todos los repos creados, incluso si algún push falló
      const secretsSet: string[] = [];
      const secretsFailed: Array<{ name: string; error: string }> = [];

      const githubSecrets = await this.buildGitHubSecrets(github.token, github.owner);

      for (const repo of createdRepos) {
        const result = await setGitHubActionsSecrets(github.token, repo, githubSecrets);
        secretsSet.push(...result.set);
        secretsFailed.push(...result.failed);
      }

      return {
        success: true,
        context: {
          ...context,
          githubOutcome: {
            repos: createdRepos,
            secretsSet,
            secretsFailed,
            ...(pushWarnings.length > 0 && { pushWarnings }),
          },
        },
      };
    } catch (error) {
      const message =
        error instanceof GitHubApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);

      return {
        success: false,
        context,
        error: `Error al crear repositorio en GitHub: ${message}`,
      };
    }
  }

  private buildRepoSpecs(
    topology: string | undefined,
    baseRepoName: string
  ): Array<{ name: string; localRepoPattern?: string }> {
    if (topology === 'multirepo') {
      return [
        { name: `${baseRepoName}-api`, localRepoPattern: '-api' },
        { name: `${baseRepoName}-web`, localRepoPattern: '-web' },
      ];
    }
    return [{ name: baseRepoName }];
  }

  private async buildGitHubSecrets(
    token: string,
    owner?: string
  ): Promise<Array<{ name: string; value: string }>> {
    const secrets: Array<{ name: string; value: string }> = [];

    // Inferir owner del token si no se proveyó
    let registryUser = owner || '';
    let userInferenceError: string | undefined;
    if (!registryUser) {
      try {
        const user = await getAuthenticatedUser(token);
        registryUser = user.login;
      } catch (error) {
        userInferenceError = error instanceof Error ? error.message : String(error);
      }
    }

    if (registryUser) {
      secrets.push({ name: 'DOCKER_REGISTRY_USER', value: registryUser });
    } else if (userInferenceError) {
      console.warn(
        `⚠️  No se pudo obtener el usuario autenticado: ${userInferenceError}\n` +
        '   DOCKER_REGISTRY_USER no se seteará. El workflow de CI puede fallar si lo necesita.'
      );
    }

    secrets.push({ name: 'DOCKER_REGISTRY_TOKEN', value: token });

    return secrets;
  }
}
