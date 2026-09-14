import { describe, it, expect } from 'vitest';
import { GitHubActionsGenerator } from './github-actions-generator.js';
import { GitLabCiGenerator } from './gitlab-ci-generator.js';
import type { DeployConfig } from './types.js';

describe('Workflow Snapshots', () => {
  describe('GitHub Actions', () => {
    const generator = new GitHubActionsGenerator();

    it('should generate consistent workflow for backend-full', () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        projectName: 'myapi',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '.github/workflows/deploy.yml',
      };

      const content = generator.generateWorkflowContent(config);
      
      const normalized = normalizeTimestamp(content);
      expect(normalized).toMatchSnapshot();
    });

    it('should generate consistent workflow for frontend-static', () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'frontend-static',
        projectName: 'myweb',
        productionBranch: 'main',
        domain: 'app.example.com',
        outputPath: '.github/workflows/deploy.yml',
      };

      const content = generator.generateWorkflowContent(config);
      
      const normalized = normalizeTimestamp(content);
      expect(normalized).toMatchSnapshot();
    });

    it('should generate consistent workflow for multirepo api', () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        projectName: 'myapi',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '.github/workflows/deploy.yml',
        multiRepo: {
          role: 'api',
          siblingGitUrl: 'https://github.com/example/web.git',
          siblingDomain: 'app.example.com',
        },
      };

      const content = generator.generateWorkflowContent(config);
      
      const normalized = normalizeTimestamp(content);
      expect(normalized).toMatchSnapshot();
    });

    it('should generate consistent workflow for multirepo web', () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'frontend-static',
        projectName: 'myweb',
        productionBranch: 'main',
        domain: 'app.example.com',
        outputPath: '.github/workflows/deploy.yml',
        multiRepo: {
          role: 'web',
          siblingGitUrl: 'https://github.com/example/api.git',
          siblingDomain: 'api.example.com',
        },
      };

      const content = generator.generateWorkflowContent(config);
      
      const normalized = normalizeTimestamp(content);
      expect(normalized).toMatchSnapshot();
    });
  });

  describe('GitLab CI', () => {
    const generator = new GitLabCiGenerator();

    it('should generate consistent pipeline for backend-full', () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: 'myapi',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '.gitlab-ci.yml',
      };

      const content = generator.generatePipelineContent(config);
      
      const normalized = normalizeTimestamp(content);
      expect(normalized).toMatchSnapshot();
    });

    it('should generate consistent pipeline for frontend-static', () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'frontend-static',
        projectName: 'myweb',
        productionBranch: 'main',
        domain: 'app.example.com',
        outputPath: '.gitlab-ci.yml',
      };

      const content = generator.generatePipelineContent(config);
      
      const normalized = normalizeTimestamp(content);
      expect(normalized).toMatchSnapshot();
    });

    it('should generate consistent pipeline for multirepo api', () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: 'myapi',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '.gitlab-ci.yml',
        multiRepo: {
          role: 'api',
          siblingGitUrl: 'https://gitlab.com/example/web.git',
          siblingDomain: 'app.example.com',
        },
      };

      const content = generator.generatePipelineContent(config);
      
      const normalized = normalizeTimestamp(content);
      expect(normalized).toMatchSnapshot();
    });

    it('should generate consistent pipeline for multirepo web', () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'frontend-static',
        projectName: 'myweb',
        productionBranch: 'main',
        domain: 'app.example.com',
        outputPath: '.gitlab-ci.yml',
        multiRepo: {
          role: 'web',
          siblingGitUrl: 'https://gitlab.com/example/api.git',
          siblingDomain: 'api.example.com',
        },
      };

      const content = generator.generatePipelineContent(config);
      
      const normalized = normalizeTimestamp(content);
      expect(normalized).toMatchSnapshot();
    });
  });

  describe('Workflow content verification', () => {
    it('GitHub Actions workflow should contain key deploy steps', () => {
      const generator = new GitHubActionsGenerator();
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        projectName: 'myapi',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '.github/workflows/deploy.yml',
      };

      const content = generator.generateWorkflowContent(config);
      
      expect(content).toContain('docker/build-push-action');
      expect(content).toContain('php artisan migrate --force');
      expect(content).toContain('php artisan cache:clear');
      expect(content).toContain('Healthcheck');
      expect(content).toContain('Rolling back');
      expect(content).toContain('IMAGE_TAG');
      expect(content).toContain('SSH_KNOWN_HOSTS');
      expect(content).toContain('StrictHostKeyChecking=yes');
      expect(content).not.toContain('StrictHostKeyChecking=no');
    });

    it('GitLab CI pipeline should contain key deploy steps', () => {
      const generator = new GitLabCiGenerator();
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: 'myapi',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '.gitlab-ci.yml',
      };

      const content = generator.generatePipelineContent(config);
      
      expect(content).toContain('stages:');
      expect(content).toContain('- build');
      expect(content).toContain('- deploy');
      expect(content).toContain('php artisan migrate --force');
      expect(content).toContain('php artisan cache:clear');
      expect(content).toContain('Healthcheck');
      expect(content).toContain('Rolling back');
      expect(content).toContain('SSH_KNOWN_HOSTS');
      expect(content).toContain('StrictHostKeyChecking=yes');
      expect(content).not.toContain('ssh-keyscan');
    });

    it('frontend-static workflow should not contain migration steps', () => {
      const generator = new GitHubActionsGenerator();
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'frontend-static',
        projectName: 'myweb',
        productionBranch: 'main',
        domain: 'app.example.com',
        outputPath: '.github/workflows/deploy.yml',
      };

      const content = generator.generateWorkflowContent(config);
      
      expect(content).not.toContain('migrate');
      expect(content).not.toContain('cache:clear');
      expect(content).toContain('Healthcheck');
      expect(content).toContain('StrictHostKeyChecking=yes');
    });
  });
});

/**
 * Normaliza timestamps para snapshots consistentes.
 */
function normalizeTimestamp(content: string): string {
  return content.replace(
    /# Generado: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/,
    '# Generado: NORMALIZED_TIMESTAMP'
  );
}
