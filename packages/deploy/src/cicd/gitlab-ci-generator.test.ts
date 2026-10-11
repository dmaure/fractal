import { describe, it, expect } from 'vitest';
import { GitLabCiGenerator } from './gitlab-ci-generator.js';
import type { DeployConfig } from './types.js';
import type { DeployRuntime } from '@fractal/core';

/**
 * Runtimes equivalentes a los que declara el adapter Laravel (FRA-51).
 * Los comandos del pipeline se derivan de estos runtimes, no se hardcodean.
 */
const BACKEND_RUNTIME: DeployRuntime = {
  services: ['app', 'nginx', 'db', 'redis', 'worker', 'scheduler'],
  buildCommand: 'composer install --no-dev --optimize-autoloader',
  migrateCommand: 'php artisan migrate --force',
  postDeployCommands: [
    'php artisan config:clear',
    'php artisan route:clear',
    'php artisan view:clear',
    'php artisan cache:clear',
  ],
  port: 8000,
  healthcheck: { path: '/api/health' },
};

const FRONTEND_RUNTIME: DeployRuntime = {
  services: ['nginx'],
  buildCommand: 'npm run build',
  port: 80,
  healthcheck: { path: '/health.txt' },
};

describe('GitLabCiGenerator', () => {
  const generator = new GitLabCiGenerator();

  describe('validateConfig', () => {
    it('should validate a correct backend-full config', async () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        runtime: BACKEND_RUNTIME,
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
        runtime: FRONTEND_RUNTIME,
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
        runtime: BACKEND_RUNTIME,
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
        runtime: BACKEND_RUNTIME,
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
        runtime: BACKEND_RUNTIME,
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
        runtime: BACKEND_RUNTIME,
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

  describe('commands derived from runtime (FRA-51)', () => {
    it('should emit migrate and post-deploy commands from the backend runtime', () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        runtime: BACKEND_RUNTIME,
        projectName: 'myapi',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-gitlab-derived-backend.yml',
      };

      const content = generator.generatePipelineContent(config);

      expect(content).toContain('docker compose exec -T app php artisan migrate --force');
      expect(content).toContain('docker compose exec -T app php artisan config:clear');
      expect(content).toContain('docker compose exec -T app php artisan cache:clear');
      expect(content).toContain('https://api.example.com/api/health');
    });

    it('should omit migrate and post-deploy commands for a runtime without them', () => {
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'frontend-static',
        runtime: FRONTEND_RUNTIME,
        projectName: 'myweb',
        productionBranch: 'main',
        domain: 'app.example.com',
        outputPath: '/tmp/test-gitlab-derived-frontend.yml',
      };

      const content = generator.generatePipelineContent(config);

      expect(content).not.toContain('migrate');
      expect(content).not.toContain('Comandos post-deploy');
      expect(content).toContain('https://app.example.com/health.txt');
    });

    it('should honor a custom runtime (agnostic, non-Laravel)', () => {
      const customRuntime: DeployRuntime = {
        services: ['app', 'nginx'],
        buildCommand: 'make build',
        migrateCommand: 'bin/migrate',
        postDeployCommands: ['bin/warm-cache'],
        port: 3000,
        healthcheck: { path: '/status' },
      };
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        runtime: customRuntime,
        projectName: 'custom',
        productionBranch: 'production',
        domain: 'custom.example.com',
        outputPath: '/tmp/test-gitlab-derived-custom.yml',
      };

      const content = generator.generatePipelineContent(config);

      expect(content).toContain('docker compose exec -T app bin/migrate');
      expect(content).toContain('docker compose exec -T app bin/warm-cache');
      expect(content).toContain('https://custom.example.com/status');
    });
  });

  describe('generate - backend-full', () => {
    it('should generate pipeline for backend-full', async () => {
      const outputPath = '/tmp/test-gitlab-ci-backend-' + Math.random() + '.yml';
      const config: DeployConfig = {
        provider: 'gitlab-ci',
        targetType: 'backend-full',
        runtime: BACKEND_RUNTIME,
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
        runtime: BACKEND_RUNTIME,
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
        runtime: FRONTEND_RUNTIME,
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
        runtime: FRONTEND_RUNTIME,
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
        runtime: BACKEND_RUNTIME,
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
        runtime: BACKEND_RUNTIME,
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
        targetType: 'frontend-static',
        runtime: FRONTEND_RUNTIME,
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
        targetType: 'frontend-static',
        runtime: FRONTEND_RUNTIME,
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
