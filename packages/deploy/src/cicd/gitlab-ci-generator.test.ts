import { describe, it, expect } from 'vitest';
import { GitLabCiGenerator } from './gitlab-ci-generator.js';
import type { DeployConfig } from './types.js';

describe('GitLabCiGenerator', () => {
  const generator = new GitLabCiGenerator();

  describe('validateConfig', () => {
    it('should validate a correct backend-full config', async () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: 'test-api',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-gitlab-ci-' + Math.random() + '.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate a correct frontend-static config', async () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'frontend-static',
        projectName: 'test-web',
        productionBranch: 'main',
        domain: 'app.example.com',
        outputPath: '/tmp/test-gitlab-ci-' + Math.random() + '.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject empty project name', async () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: '',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-gitlab-ci-' + Math.random() + '.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('nombre del proyecto');
    });

    it('should reject empty production branch', async () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: 'test-api',
        productionBranch: '',
        domain: 'api.example.com',
        outputPath: '/tmp/test-gitlab-ci-' + Math.random() + '.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('rama de producción');
    });

    it('should reject empty domain', async () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: 'test-api',
        productionBranch: 'production',
        domain: '',
        outputPath: '/tmp/test-gitlab-ci-' + Math.random() + '.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('dominio');
    });

    it('should reject invalid target type', async () => {
      const config = {
        provider: 'gitlab-ci',
        targetType: 'invalid' as any,
        projectName: 'test-api',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-gitlab-ci-' + Math.random() + '.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Tipo de target inválido');
    });
  });

  describe('generate - backend-full', () => {
    it('should generate pipeline for backend-full', async () => {
      const outputPath = '/tmp/test-gitlab-ci-backend-' + Math.random() + '.yml';
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: 'myapi',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath,
      };

      const result = await generator.generate(config);

      expect(result.success).toBe(true);
      expect(result.filePath).toBe(outputPath);
      expect(result.content).toBeDefined();
      expect(result.secrets).toBeDefined();
      expect(result.secrets.length).toBeGreaterThan(0);
    });

    it('should include required secrets for backend-full', async () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: 'myapi',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-gitlab-ci-' + Math.random() + '.yml',
      };

      const result = await generator.generate(config);

      const secretNames = result.secrets.map((s) => s.name);
      expect(secretNames).toContain('SSH_HOST');
      expect(secretNames).toContain('SSH_USER');
      expect(secretNames).toContain('SSH_PRIVATE_KEY');
      expect(secretNames).toContain('SSH_KNOWN_HOSTS');
      expect(secretNames).toContain('DOCKER_REGISTRY_USER');
      expect(secretNames).toContain('DOCKER_REGISTRY_TOKEN');
      expect(secretNames).toContain('DB_PASSWORD');
      expect(secretNames).toContain('APP_KEY');
    });

    it('should not include DB secrets for frontend-static', async () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'frontend-static',
        projectName: 'myweb',
        productionBranch: 'main',
        domain: 'app.example.com',
        outputPath: '/tmp/test-gitlab-ci-' + Math.random() + '.yml',
      };

      const result = await generator.generate(config);

      const secretNames = result.secrets.map((s) => s.name);
      expect(secretNames).not.toContain('DB_PASSWORD');
      expect(secretNames).not.toContain('APP_KEY');
      expect(secretNames).toContain('SSH_KNOWN_HOSTS');
    });
  });

  describe('multirepo support (ADR-0012)', () => {
    it('should include API_URL secret for web role', async () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'frontend-static',
        projectName: 'myweb',
        productionBranch: 'main',
        domain: 'app.example.com',
        outputPath: '/tmp/test-gitlab-ci-' + Math.random() + '.yml',
        multiRepo: {
          role: 'web',
          siblingGitUrl: 'https://gitlab.com/example/api.git',
          siblingDomain: 'api.example.com',
        },
      };

      const result = await generator.generate(config);

      const secretNames = result.secrets.map((s) => s.name);
      expect(secretNames).toContain('API_URL');
    });

    it('should include CORS secrets for api role', async () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: 'myapi',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-gitlab-ci-' + Math.random() + '.yml',
        multiRepo: {
          role: 'api',
          siblingGitUrl: 'https://gitlab.com/example/web.git',
          siblingDomain: 'app.example.com',
        },
      };

      const result = await generator.generate(config);

      const secretNames = result.secrets.map((s) => s.name);
      expect(secretNames).toContain('CORS_ALLOWED_ORIGIN');
      expect(secretNames).toContain('SANCTUM_STATEFUL_DOMAINS');
    });

    it('should generate cross-repo secrets for api role', async () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: 'myapi',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-gitlab-ci-' + Math.random() + '.yml',
        multiRepo: {
          role: 'api',
          siblingGitUrl: 'https://gitlab.com/example/web.git',
          siblingDomain: 'app.example.com',
        },
      };

      const result = await generator.generate(config);

      expect(result.crossRepoSecrets).toBeDefined();
      expect(result.crossRepoSecrets!.length).toBeGreaterThan(0);
      
      const crossSecret = result.crossRepoSecrets!.find((s) => s.name === 'API_URL');
      expect(crossSecret).toBeDefined();
      expect(crossSecret!.crossRepo).toBe(true);
      expect(crossSecret!.targetRepo).toBe('https://gitlab.com/example/web.git');
      expect(crossSecret!.description).toContain('api.example.com');
    });
  });

  describe('framework-agnostic compliance', () => {
    it('should not contain Laravel-specific terms in result', async () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: 'test',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-gitlab-ci-compliance-1.yml',
      };

      const result = await generator.generate(config);
      
      const prohibitedTerms = [
        'laravel',
        'eloquent',
        'blade',
      ];

      // Check secrets and content, not filePath (which is just a test artifact)
      const checkContent = JSON.stringify({ secrets: result.secrets, content: result.content }).toLowerCase();
      
      prohibitedTerms.forEach((term) => {
        expect(checkContent).not.toContain(term);
      });
    });

    it('should not contain Rails-specific terms in result', async () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: 'test',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-gitlab-ci-compliance-2.yml',
      };

      const result = await generator.generate(config);
      
      const prohibitedTerms = [
        'rails',
        'activerecord',
        'gemfile',
        'bundler',
        'erb',
      ];

      // Check secrets and content, not filePath (which is just a test artifact)
      const checkContent = JSON.stringify({ secrets: result.secrets, content: result.content }).toLowerCase();
      
      prohibitedTerms.forEach((term) => {
        expect(checkContent).not.toContain(term);
      });
    });
  });
});
