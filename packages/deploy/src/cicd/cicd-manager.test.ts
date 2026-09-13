import { describe, it, expect } from 'vitest';
import { CicdManager } from './cicd-manager.js';
import type { DeployConfig } from './types.js';

describe('CicdManager', () => {
  const manager = new CicdManager();

  describe('getSupportedProviders', () => {
    it('should return list of supported providers', () => {
      const providers = manager.getSupportedProviders();
      
      expect(providers).toContain('github-actions');
      expect(providers).toContain('gitlab-ci');
      expect(providers.length).toBe(2);
    });
  });

  describe('validateConfig', () => {
    it('should reject missing provider', () => {
      const config = {
        targetType: 'backend-full',
        projectName: 'test',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/deploy.yml',
      } as any;

      const result = manager.validateConfig(config);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('proveedor de CI/CD');
    });

    it('should reject unsupported provider', () => {
      const config: DeployConfig = {
        provider: 'jenkins' as any,
        targetType: 'backend-full',
        projectName: 'test',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/deploy.yml',
      };

      const result = manager.validateConfig(config);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('no soportado');
    });

    it('should validate GitHub Actions config', () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        projectName: 'test-api',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/.github/workflows/deploy.yml',
      };

      const result = manager.validateConfig(config);
      
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate GitLab CI config', () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: 'test-api',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/.gitlab-ci.yml',
      };

      const result = manager.validateConfig(config);
      
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('generate', () => {
    it('should generate GitHub Actions workflow', () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        projectName: 'test-api',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/.github/workflows/deploy.yml',
      };

      const result = manager.generate(config);
      
      expect(result.success).toBe(true);
      expect(result.filePath).toBe('/tmp/.github/workflows/deploy.yml');
      expect(result.secrets).toBeDefined();
      expect(result.secrets.length).toBeGreaterThan(0);
    });

    it('should generate GitLab CI pipeline', () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: 'test-api',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/.gitlab-ci.yml',
      };

      const result = manager.generate(config);
      
      expect(result.success).toBe(true);
      expect(result.filePath).toBe('/tmp/.gitlab-ci.yml');
      expect(result.secrets).toBeDefined();
      expect(result.secrets.length).toBeGreaterThan(0);
    });

    it('should fail for unsupported provider', () => {
      const config: DeployConfig = {
        provider: 'circleci' as any,
        targetType: 'backend-full',
        projectName: 'test-api',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/config.yml',
      };

      const result = manager.generate(config);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('no soportado');
    });

    it('should generate correct secrets for frontend-static', () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'frontend-static',
        projectName: 'test-web',
        productionBranch: 'main',
        domain: 'app.example.com',
        outputPath: '/tmp/.github/workflows/deploy.yml',
      };

      const result = manager.generate(config);
      
      expect(result.success).toBe(true);
      
      const secretNames = result.secrets.map((s) => s.name);
      expect(secretNames).toContain('SSH_HOST');
      expect(secretNames).not.toContain('DB_PASSWORD');
    });

    it('should handle multirepo configuration', () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        projectName: 'myapi',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/.github/workflows/deploy.yml',
        multiRepo: {
          role: 'api',
          siblingGitUrl: 'https://github.com/example/web.git',
          siblingDomain: 'app.example.com',
        },
      };

      const result = manager.generate(config);
      
      expect(result.success).toBe(true);
      expect(result.crossRepoSecrets).toBeDefined();
      expect(result.crossRepoSecrets!.length).toBeGreaterThan(0);
    });
  });

  describe('framework-agnostic compliance', () => {
    it('should not contain Laravel-specific terms', () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        projectName: 'test',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/.github/workflows/deploy.yml',
      };

      const result = manager.generate(config);
      
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

    it('should not contain Rails-specific terms', () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: 'test',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/.gitlab-ci.yml',
      };

      const result = manager.generate(config);
      
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
