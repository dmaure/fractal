import { describe, it, expect } from 'vitest';
import { GitHubActionsGenerator } from './github-actions-generator.js';
import type { DeployConfig } from './types.js';
import type { DeployRuntime } from '@fractal/core';

/**
 * Runtimes equivalentes a los que declara el adapter Laravel (FRA-51).
 * Los comandos del workflow se derivan de estos runtimes, no se hardcodean.
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

describe('GitHubActionsGenerator', () => {
  const generator = new GitHubActionsGenerator();

  describe('validateConfig', () => {
    it('should validate a correct backend-full config', () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        runtime: BACKEND_RUNTIME,
        projectName: 'test-api',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/.github/workflows/deploy.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate a correct frontend-static config', () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'frontend-static',
        runtime: FRONTEND_RUNTIME,
        projectName: 'test-web',
        productionBranch: 'main',
        domain: 'app.example.com',
        outputPath: '/tmp/.github/workflows/deploy.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject empty project name', () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        runtime: BACKEND_RUNTIME,
        projectName: '',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/.github/workflows/deploy.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('nombre del proyecto');
    });

    it('should reject empty production branch', () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        runtime: BACKEND_RUNTIME,
        projectName: 'test-api',
        productionBranch: '',
        domain: 'api.example.com',
        outputPath: '/tmp/.github/workflows/deploy.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('rama de producción');
    });

    it('should reject empty domain', () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        runtime: BACKEND_RUNTIME,
        projectName: 'test-api',
        productionBranch: 'production',
        domain: '',
        outputPath: '/tmp/.github/workflows/deploy.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('dominio');
    });

    it('should reject invalid target type', () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'invalid' as any,
        runtime: BACKEND_RUNTIME,
        projectName: 'test-api',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/.github/workflows/deploy.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Tipo de target inválido');
    });
  });

  describe('commands derived from runtime (FRA-51)', () => {
    it('should emit migrate and post-deploy commands from the backend runtime', () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        runtime: BACKEND_RUNTIME,
        projectName: 'myapi',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-github-derived-backend.yml',
      };

      const content = generator.generateWorkflowContent(config);

      // migrateCommand del runtime
      expect(content).toContain('docker compose exec -T app php artisan migrate --force');
      // postDeployCommands del runtime
      expect(content).toContain('docker compose exec -T app php artisan config:clear');
      expect(content).toContain('docker compose exec -T app php artisan cache:clear');
      // healthcheck.path del runtime
      expect(content).toContain('https://api.example.com/api/health');
    });

    it('should omit migrate and post-deploy commands for a runtime without them', () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'frontend-static',
        runtime: FRONTEND_RUNTIME,
        projectName: 'myweb',
        productionBranch: 'main',
        domain: 'app.example.com',
        outputPath: '/tmp/test-github-derived-frontend.yml',
      };

      const content = generator.generateWorkflowContent(config);

      expect(content).not.toContain('migrate');
      expect(content).not.toContain('Comandos post-deploy');
      // healthcheck.path del runtime frontend
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
        provider: 'github-actions',
        targetType: 'backend-full',
        runtime: customRuntime,
        projectName: 'custom',
        productionBranch: 'production',
        domain: 'custom.example.com',
        outputPath: '/tmp/test-github-derived-custom.yml',
      };

      const content = generator.generateWorkflowContent(config);

      expect(content).toContain('docker compose exec -T app bin/migrate');
      expect(content).toContain('docker compose exec -T app bin/warm-cache');
      expect(content).toContain('https://custom.example.com/status');
    });
  });

  describe('generate - backend-full', () => {
    it('should generate workflow for backend-full', async () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        runtime: BACKEND_RUNTIME,
        projectName: 'myapi',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-github-actions-backend.yml',
      };

      const result = await generator.generate(config);

      expect(result.success).toBe(true);
      expect(result.filePath).toBe('/tmp/test-github-actions-backend.yml');
      expect(result.content).toBeDefined();
      expect(result.content).toContain('Deploy to Production');
      expect(result.secrets).toBeDefined();
      expect(result.secrets.length).toBeGreaterThan(0);
    });

    it('should include required secrets for backend-full', async () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        runtime: BACKEND_RUNTIME,
        projectName: 'myapi',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-github-actions-secrets.yml',
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
        provider: 'github-actions',
        targetType: 'frontend-static',
        runtime: FRONTEND_RUNTIME,
        projectName: 'myweb',
        productionBranch: 'main',
        domain: 'app.example.com',
        outputPath: '/tmp/test-github-actions-frontend.yml',
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
        provider: 'github-actions',
        targetType: 'frontend-static',
        runtime: FRONTEND_RUNTIME,
        projectName: 'myweb',
        productionBranch: 'main',
        domain: 'app.example.com',
        outputPath: '/tmp/test-github-actions-multirepo-web.yml',
        multiRepo: {
          role: 'web',
          siblingGitUrl: 'https://github.com/example/api.git',
          siblingDomain: 'api.example.com',
        },
      };

      const result = await generator.generate(config);

      const secretNames = result.secrets.map((s) => s.name);
      expect(secretNames).toContain('API_URL');
    });

    it('should include CORS secrets for api role', async () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        runtime: BACKEND_RUNTIME,
        projectName: 'myapi',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-github-actions-multirepo-api.yml',
        multiRepo: {
          role: 'api',
          siblingGitUrl: 'https://github.com/example/web.git',
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
        provider: 'github-actions',
        targetType: 'backend-full',
        runtime: BACKEND_RUNTIME,
        projectName: 'myapi',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-github-actions-cross-api.yml',
        multiRepo: {
          role: 'api',
          siblingGitUrl: 'https://github.com/example/web.git',
          siblingDomain: 'app.example.com',
        },
      };

      const result = await generator.generate(config);

      expect(result.crossRepoSecrets).toBeDefined();
      expect(result.crossRepoSecrets!.length).toBeGreaterThan(0);

      const crossSecret = result.crossRepoSecrets!.find((s) => s.name === 'API_URL');
      expect(crossSecret).toBeDefined();
      expect(crossSecret!.crossRepo).toBe(true);
      expect(crossSecret!.targetRepo).toBe('https://github.com/example/web.git');
      expect(crossSecret!.description).toContain('api.example.com');
    });

    it('should generate cross-repo secrets for web role', async () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'frontend-static',
        runtime: FRONTEND_RUNTIME,
        projectName: 'myweb',
        productionBranch: 'main',
        domain: 'app.example.com',
        outputPath: '/tmp/test-github-actions-cross-web.yml',
        multiRepo: {
          role: 'web',
          siblingGitUrl: 'https://github.com/example/api.git',
          siblingDomain: 'api.example.com',
        },
      };

      const result = await generator.generate(config);

      expect(result.crossRepoSecrets).toBeDefined();

      const crossSecretNames = result.crossRepoSecrets!.map((s) => s.name);
      expect(crossSecretNames).toContain('CORS_ALLOWED_ORIGIN');
      expect(crossSecretNames).toContain('SANCTUM_STATEFUL_DOMAINS');
    });
  });

  describe('framework-agnostic compliance', () => {
    it('should not contain Laravel-specific terms in result', async () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'frontend-static',
        runtime: FRONTEND_RUNTIME,
        projectName: 'test',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-github-actions-compliance-1.yml',
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
        provider: 'github-actions',
        targetType: 'frontend-static',
        runtime: FRONTEND_RUNTIME,
        projectName: 'test',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-github-actions-compliance-2.yml',
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

  describe('redeploy workflow (FRA-72)', () => {
    const backendConfig: DeployConfig = {
      provider: 'github-actions',
      targetType: 'backend-full',
      runtime: BACKEND_RUNTIME,
      projectName: 'myapi',
      productionBranch: 'production',
      domain: 'api.example.com',
      outputPath: '/tmp/test-github-fra72.yml',
    };

    it('deploys into the provisioning directory /home/deploy, not /var/www', () => {
      const content = generator.generateWorkflowContent(backendConfig);
      expect(content).toContain('cd /home/deploy');
      expect(content).not.toContain('cd /var/www/');
    });

    it('injects the registry and image tag so the server pulls the published image', () => {
      const content = generator.generateWorkflowContent(backendConfig);
      expect(content).toContain("DOCKER_REGISTRY='ghcr.io/${{ github.repository }}'");
      expect(content).toContain("IMAGE_TAG='${{ github.sha }}'");
      expect(content).toContain('docker compose pull');
    });

    it('uses a quoted heredoc so server-side variables are not expanded on the runner', () => {
      const content = generator.generateWorkflowContent(backendConfig);
      expect(content).toContain("bash -s\" << 'ENDSSH'");
    });
  });
});
