/**
 * Manager para generación de CI/CD agnóstica de proveedor.
 * Framework-agnostic según Artículo II de CONSTITUTION.md.
 */

import type { DeployConfig, WorkflowGenerationResult } from './types.js';
import { GitHubActionsGenerator } from './github-actions-generator.js';
import { GitLabCiGenerator } from './gitlab-ci-generator.js';

export class CicdManager {
  private githubGenerator: GitHubActionsGenerator;
  private gitlabGenerator: GitLabCiGenerator;

  constructor() {
    this.githubGenerator = new GitHubActionsGenerator();
    this.gitlabGenerator = new GitLabCiGenerator();
  }

  /**
   * Genera el workflow o pipeline según el proveedor configurado.
   */
  async generate(config: DeployConfig): Promise<WorkflowGenerationResult> {
    switch (config.provider) {
      case 'github-actions':
        return await this.githubGenerator.generate(config);
      case 'gitlab-ci':
        return await this.gitlabGenerator.generate(config);
      default:
        return {
          success: false,
          secrets: [],
          error: `Proveedor de CI/CD no soportado: ${config.provider}`,
        };
    }
  }

  /**
   * Lista los proveedores de CI/CD soportados.
   */
  getSupportedProviders(): string[] {
    return ['github-actions', 'gitlab-ci'];
  }

  /**
   * Valida la configuración según el proveedor.
   */
  validateConfig(config: DeployConfig): { valid: boolean; error?: string } {
    if (!config.provider) {
      return { valid: false, error: 'Debe especificar un proveedor de CI/CD' };
    }

    if (!this.getSupportedProviders().includes(config.provider)) {
      return {
        valid: false,
        error: `Proveedor no soportado: ${config.provider}. Proveedores válidos: ${this.getSupportedProviders().join(', ')}`,
      };
    }

    switch (config.provider) {
      case 'github-actions':
        return this.githubGenerator.validateConfig(config);
      case 'gitlab-ci':
        return this.gitlabGenerator.validateConfig(config);
      default:
        return { valid: false, error: 'Proveedor desconocido' };
    }
  }
}
