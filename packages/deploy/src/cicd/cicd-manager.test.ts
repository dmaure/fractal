import { describe, it, expect } from 'vitest';
import { CicdManager } from './cicd-manager.js';
import type { DeployConfig } from './types.js';

describe('CicdManager', async () => {
  const manager = new CicdManager();

  describe('getSupportedProviders', async () => {
    it('should return list of supported providers', async () => {
      const providers = manager.getSupportedProviders();
      
      expect(providers).toContain('github-actions');
      expect(providers).toContain('gitlab-ci');
      expect(providers.length).toBe(2);
    });
  });

  describe('validateConfig', async () => {
    it('should reject missing provider', async () => {
      const config = {
        targetType: 'backend-full',
        projectName: 'test',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-cicd-manager-' + Math.random() + '.yml',
      } as any;

      const result = manager.validateConfig(config);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('proveedor de CI/CD');
    });

    it('should reject unsupported provider', async () => {
      const config: DeployConfig = {
        provider: 'jenkins' as any,
        targetType: 'backend-full',
        projectName: 'test',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-cicd-manager-' + Math.random() + '.yml',
      };

      const result = manager.validateConfig(config);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('no soportado');
    });

    it('should validate GitHub Actions config', async () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        projectName: 'test-api',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-manager-gh-' + Math.random() + '.yml',
      };

      const result = manager.validateConfig(config);
      
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate GitLab CI config', async () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: 'test-api',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-manager-gl-' + Math.random() + '.yml',
      };

      const result = manager.validateConfig(config);
      
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('generate', async () => {
    it('should generate GitHub Actions workflow', async () => {
      const outputPath = '/tmp/test-manager-gh-' + Math.random() + '.yml';
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        projectName: 'test-api',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath,
      };

      const result = await manager.generate(config);
      
      expect(result.success).toBe(true);
      expect(result.filePath).toBe(outputPath);
      expect(result.content).toBeDefined();
      expect(result.secrets).toBeDefined();
      expect(result.secrets.length).toBeGreaterThan(0);
    });

    it('should generate GitLab CI pipeline', async () => {
      const outputPath = '/tmp/test-manager-gl-' + Math.random() + '.yml';
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: 'test-api',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath,
      };

      const result = await manager.generate(config);
      
      expect(result.success).toBe(true);
      expect(result.filePath).toBe(outputPath);
      expect(result.content).toBeDefined();
      expect(result.secrets).toBeDefined();
      expect(result.secrets.length).toBeGreaterThan(0);
    });

    it('should fail for unsupported provider', async () => {
      const config: DeployConfig = {
        provider: 'circleci' as any,
        targetType: 'backend-full',
        projectName: 'test-api',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-manager-config-' + Math.random() + '.yml',
      };

      const result = await manager.generate(config);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('no soportado');
    });

    it('should generate correct secrets for frontend-static', async () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'frontend-static',
        projectName: 'test-web',
        productionBranch: 'main',
        domain: 'app.example.com',
        outputPath: '/tmp/test-manager-gh-' + Math.random() + '.yml',
      };

      const result = await manager.generate(config);
      
      expect(result.success).toBe(true);
      
      const secretNames = result.secrets.map((s) => s.name);
      expect(secretNames).toContain('SSH_HOST');
      expect(secretNames).not.toContain('DB_PASSWORD');
    });

    it('should handle multirepo configuration', async () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        projectName: 'myapi',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-manager-gh-' + Math.random() + '.yml',
        multiRepo: {
          role: 'api',
          siblingGitUrl: 'https://github.com/example/web.git',
          siblingDomain: 'app.example.com',
        },
      };

      const result = await manager.generate(config);
      
      expect(result.success).toBe(true);
      expect(result.crossRepoSecrets).toBeDefined();
      expect(result.crossRepoSecrets!.length).toBeGreaterThan(0);
    });
  });

  describe('framework-agnostic compliance', async () => {
    it('should not contain Laravel-specific terms', async () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        projectName: 'test',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-manager-compliance-1.yml',
      };

      const result = await manager.generate(config);
      
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

    it('should not contain Rails-specific terms', async () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        projectName: 'test',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-manager-compliance-2.yml',
      };

      const result = await manager.generate(config);
      
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
