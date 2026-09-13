import { describe, it, expect } from 'vitest';
import { GitLabCiGenerator } from './gitlab-ci-generator.js';
import type { DeployConfig } from './types.js';

describe('GitLabCiGenerator', () => {
  const generator = new GitLabCiGenerator();

  describe('validateConfig', () => {
    it('should validate a correct backend-full config', () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: 'test-api',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/.gitlab-ci.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate a correct frontend-static config', () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'frontend-static',
        projectName: 'test-web',
        productionBranch: 'main',
        domain: 'app.example.com',
        outputPath: '/tmp/.gitlab-ci.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject empty project name', () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: '',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/.gitlab-ci.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('nombre del proyecto');
    });

    it('should reject empty production branch', () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: 'test-api',
        productionBranch: '',
        domain: 'api.example.com',
        outputPath: '/tmp/.gitlab-ci.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('rama de producción');
    });

    it('should reject empty domain', () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: 'test-api',
        productionBranch: 'production',
        domain: '',
        outputPath: '/tmp/.gitlab-ci.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('dominio');
    });

    it('should reject invalid target type', () => {
      const config = {
        provider: 'gitlab-ci',
        targetType: 'invalid' as any,
        projectName: 'test-api',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/.gitlab-ci.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Tipo de target inválido');
    });
  });

  describe('generate - backend-full', () => {
    it('should generate pipeline for backend-full', () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: 'myapi',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/.gitlab-ci.yml',
      };

      const result = generator.generate(config);

      expect(result.success).toBe(true);
      expect(result.filePath).toBe('/tmp/.gitlab-ci.yml');
      expect(result.secrets).toBeDefined();
      expect(result.secrets.length).toBeGreaterThan(0);
    });

    it('should include required secrets for backend-full', () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: 'myapi',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/.gitlab-ci.yml',
      };

      const result = generator.generate(config);

      const secretNames = result.secrets.map((s) => s.name);
      expect(secretNames).toContain('SSH_HOST');
      expect(secretNames).toContain('SSH_USER');
      expect(secretNames).toContain('SSH_PRIVATE_KEY');
      expect(secretNames).toContain('DOCKER_REGISTRY_USER');
      expect(secretNames).toContain('DOCKER_REGISTRY_TOKEN');
      expect(secretNames).toContain('DB_PASSWORD');
      expect(secretNames).toContain('APP_KEY');
    });

    it('should not include DB secrets for frontend-static', () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'frontend-static',
        projectName: 'myweb',
        productionBranch: 'main',
        domain: 'app.example.com',
        outputPath: '/tmp/.gitlab-ci.yml',
      };

      const result = generator.generate(config);

      const secretNames = result.secrets.map((s) => s.name);
      expect(secretNames).not.toContain('DB_PASSWORD');
      expect(secretNames).not.toContain('APP_KEY');
    });
  });

  describe('multirepo support (ADR-0012)', () => {
    it('should include API_URL secret for web role', () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'frontend-static',
        projectName: 'myweb',
        productionBranch: 'main',
        domain: 'app.example.com',
        outputPath: '/tmp/.gitlab-ci.yml',
        multiRepo: {
          role: 'web',
          siblingGitUrl: 'https://gitlab.com/example/api.git',
          siblingDomain: 'api.example.com',
        },
      };

      const result = generator.generate(config);

      const secretNames = result.secrets.map((s) => s.name);
      expect(secretNames).toContain('API_URL');
    });

    it('should include CORS secrets for api role', () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: 'myapi',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/.gitlab-ci.yml',
        multiRepo: {
          role: 'api',
          siblingGitUrl: 'https://gitlab.com/example/web.git',
          siblingDomain: 'app.example.com',
        },
      };

      const result = generator.generate(config);

      const secretNames = result.secrets.map((s) => s.name);
      expect(secretNames).toContain('CORS_ALLOWED_ORIGIN');
      expect(secretNames).toContain('SANCTUM_STATEFUL_DOMAINS');
    });

    it('should generate cross-repo secrets for api role', () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: 'myapi',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/.gitlab-ci.yml',
        multiRepo: {
          role: 'api',
          siblingGitUrl: 'https://gitlab.com/example/web.git',
          siblingDomain: 'app.example.com',
        },
      };

      const result = generator.generate(config);

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
    it('should not contain Laravel-specific terms in result', () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: 'test',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/.gitlab-ci.yml',
      };

      const result = generator.generate(config);
      
      const prohibitedTerms = [
        'laravel',
        'eloquent',
        'blade',
      ];

      const resultJson = JSON.stringify(result).toLowerCase();
      
      prohibitedTerms.forEach((term) => {
        expect(resultJson).not.toContain(term);
      });
    });

    it('should not contain Rails-specific terms in result', () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: 'test',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/.gitlab-ci.yml',
      };

      const result = generator.generate(config);
      
      const prohibitedTerms = [
        'rails',
        'activerecord',
        'gemfile',
        'bundler',
        'erb',
      ];

      const resultJson = JSON.stringify(result).toLowerCase();
      
      prohibitedTerms.forEach((term) => {
        expect(resultJson).not.toContain(term);
      });
    });
  });
});
