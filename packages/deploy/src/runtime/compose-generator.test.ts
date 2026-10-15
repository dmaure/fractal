import { describe, it, expect } from 'vitest';
import { ComposeGenerator } from './compose-generator.js';
import type { ComposeConfig } from './types.js';
import type { DeployRuntime } from '@fractal/core';

describe('ComposeGenerator', () => {
  const generator = new ComposeGenerator();

  // Helper para crear runtimes de prueba
  const createBackendFullRuntime = (): DeployRuntime => ({
    services: ['app', 'nginx', 'db', 'redis', 'worker', 'scheduler'],
    buildCommand: 'docker build -t test:latest .',
    migrateCommand: 'docker compose exec app migrate',
    port: 8000,
    healthcheck: { path: '/api/health' },
  });

  const createFrontendStaticRuntime = (): DeployRuntime => ({
    services: ['nginx'],
    port: 80,
    healthcheck: { path: '/health.txt' },
  });

  describe('validateConfig', () => {
    it('should validate a correct backend-full config', () => {
      const config: ComposeConfig = {
        runtime: createBackendFullRuntime(),
        projectName: 'test-project',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate a correct frontend-static config', () => {
      const config: ComposeConfig = {
        runtime: createFrontendStaticRuntime(),
        projectName: 'test-frontend',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject empty project name', () => {
      const config: ComposeConfig = {
        runtime: createBackendFullRuntime(),
        projectName: '',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('nombre del proyecto');
    });

    it('should reject empty output path', () => {
      const config: ComposeConfig = {
        runtime: createBackendFullRuntime(),
        projectName: 'test-project',
        outputPath: '',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('ruta de salida');
    });

    it('should reject missing runtime', () => {
      const config = {
        projectName: 'test-project',
        outputPath: '/tmp/docker-compose.yml',
      } as any;

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('runtime es requerida');
    });

    it('should reject runtime without services', () => {
      const config: ComposeConfig = {
        runtime: {
          services: [],
          port: 80,
          healthcheck: { path: '/health' },
        },
        projectName: 'test-project',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('al menos un servicio');
    });
  });

  describe('generate - backend-full', () => {
    it('should generate docker-compose.yml for backend-full runtime', () => {
      const config: ComposeConfig = {
        runtime: createBackendFullRuntime(),
        projectName: 'myproject',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.generate(config);

      expect(result.success).toBe(true);
      expect(result.filePath).toBe('/tmp/docker-compose.yml');
      expect(result.services).toEqual([
        'app',
        'nginx',
        'db',
        'redis',
        'worker',
        'scheduler',
      ]);
      expect(result.content).toBeDefined();
    });

    it('should include all required services in backend-full compose', () => {
      const config: ComposeConfig = {
        runtime: createBackendFullRuntime(),
        projectName: 'testapp',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.generate(config);
      expect(result.services).toContain('app');
      expect(result.services).toContain('nginx');
      expect(result.services).toContain('db');
      expect(result.services).toContain('redis');
      expect(result.services).toContain('worker');
      expect(result.services).toContain('scheduler');
    });

    it('should include project name in compose content', () => {
      const config: ComposeConfig = {
        runtime: createBackendFullRuntime(),
        projectName: 'myproject',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.generate(config);
      expect(result.content).toContain('myproject');
    });

    it('should include Docker registry variable', () => {
      const config: ComposeConfig = {
        runtime: createBackendFullRuntime(),
        projectName: 'testproject',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.generate(config);
      expect(result.content).toContain('DOCKER_REGISTRY');
    });
  });

  describe('build desde Dockerfile (FRA-70)', () => {
    const createBackendBuildRuntime = (): DeployRuntime => ({
      services: ['app', 'nginx', 'db', 'redis', 'worker', 'scheduler'],
      build: { context: '.', dockerfile: 'Dockerfile' },
      buildCommand: 'docker build -t test:latest .',
      migrateCommand: 'docker compose exec app migrate',
      port: 8000,
      healthcheck: { path: '/api/health' },
    });

    it('should build the app service from the declared Dockerfile instead of referencing a registry image', () => {
      const config: ComposeConfig = {
        runtime: createBackendBuildRuntime(),
        projectName: 'buildapp',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.generate(config);
      const content = result.content || '';

      expect(content).toContain('build:\n      context: .\n      dockerfile: Dockerfile');
      // Al declarar build, la app ya no referencia una imagen de registry.
      expect(content).not.toContain('DOCKER_REGISTRY');
    });

    it('should serve the app code through a shared named volume, not a host bind mount', () => {
      const config: ComposeConfig = {
        runtime: createBackendBuildRuntime(),
        projectName: 'buildapp',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.generate(config);
      const content = result.content || '';

      // El volumen compartido app_code reemplaza el bind mount ./:/var/www/html.
      expect(content).toContain('app_code:/var/www/html');
      expect(content).toContain('app_code:/var/www/html:ro');
      expect(content).not.toContain('- ./:/var/www/html');
      // app_code se declara en la sección de volúmenes.
      expect(content).toMatch(/\n  app_code:/);
    });

    it('should mount the generated nginx.conf into the nginx container', () => {
      const config: ComposeConfig = {
        runtime: createBackendBuildRuntime(),
        projectName: 'buildapp',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.generate(config);
      const content = result.content || '';

      expect(content).toContain('./docker/nginx/nginx.conf:/etc/nginx/nginx.conf:ro');
    });
  });

  describe('generate - frontend-static', () => {
    it('should generate docker-compose.yml for frontend-static runtime', () => {
      const config: ComposeConfig = {
        runtime: createFrontendStaticRuntime(),
        projectName: 'myweb',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.generate(config);

      expect(result.success).toBe(true);
      expect(result.filePath).toBe('/tmp/docker-compose.yml');
      expect(result.services).toEqual(['nginx']);
      expect(result.content).toBeDefined();
    });

    it('should only include nginx service for frontend-static', () => {
      const config: ComposeConfig = {
        runtime: createFrontendStaticRuntime(),
        projectName: 'webapp',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.generate(config);
      expect(result.services?.length).toBe(1);
      expect(result.services).toContain('nginx');
    });

    it('should serve from dist directory', () => {
      const config: ComposeConfig = {
        runtime: createFrontendStaticRuntime(),
        projectName: 'myweb',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.generate(config);
      expect(result.content).toContain('./dist:/usr/share/nginx/html');
    });
  });

  describe('port consumption via expose (FRA-51 / DECISION 1)', () => {
    it('should expose the contract port on the app service for backend-full', () => {
      const config: ComposeConfig = {
        runtime: createBackendFullRuntime(),
        projectName: 'myproject',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.generate(config);
      expect(result.content).toContain('expose:');
      // El puerto interno del contrato (8000) se declara en expose, no publicado
      expect(result.content).toContain('"8000"');
    });

    it('should expose the app port, not publish it, for backend-full', () => {
      const runtime: DeployRuntime = {
        services: ['app', 'nginx'],
        port: 9001,
        healthcheck: { path: '/health' },
      };
      const config: ComposeConfig = {
        runtime,
        projectName: 'ports',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.generate(config);
      const content = result.content || '';
      // La app declara expose con el puerto del contrato
      expect(content).toContain('expose:\n      - "9001"');
      // La app NO publica puertos hacia el host (eso lo hace nginx: 80/443)
      expect(content).not.toContain('"9001:9001"');
    });

    it('should expose the serve port on nginx for frontend-static', () => {
      const config: ComposeConfig = {
        runtime: createFrontendStaticRuntime(),
        projectName: 'myweb',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.generate(config);
      const content = result.content || '';
      expect(content).toContain('expose:');
      expect(content).toContain('"80"');
      // nginx mantiene los puertos publicados del host
      expect(content).toContain('"80:80"');
      expect(content).toContain('"443:443"');
    });
  });

  describe('generate - custom service combinations', () => {
    it('should handle runtime with only app and nginx', () => {
      const runtime: DeployRuntime = {
        services: ['app', 'nginx'],
        port: 3000,
        healthcheck: { path: '/health' },
      };

      const config: ComposeConfig = {
        runtime,
        projectName: 'minimal',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.generate(config);
      expect(result.success).toBe(true);
      expect(result.services).toEqual(['app', 'nginx']);
      expect(result.content).toContain('minimal_app');
      expect(result.content).toContain('minimal_nginx');
    });

    it('should handle runtime with cache instead of redis', () => {
      const runtime: DeployRuntime = {
        services: ['app', 'nginx', 'db', 'cache'],
        port: 80,
        healthcheck: { path: '/api/health' },
      };

      const config: ComposeConfig = {
        runtime,
        projectName: 'cachetest',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.generate(config);
      expect(result.success).toBe(true);
      // Check that the service is named 'cache:' not 'redis:'
      expect(result.content).toMatch(/\n  cache:/);
      expect(result.content).not.toMatch(/\n  redis:/);
      // Check environment variables and references use 'cache'
      expect(result.content).toContain('REDIS_HOST=cache');
      expect(result.content).toContain('depends_on:\n      - db\n      - cache');
    });
  });

  describe('framework-agnostic compliance', () => {
    it('should not contain framework-specific terms', () => {
      const config: ComposeConfig = {
        runtime: createBackendFullRuntime(),
        projectName: 'compliance-test',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.generate(config);
      const content = result.content?.toLowerCase() || '';

      // Términos prohibidos según Artículo II
      const forbiddenTerms = [
        'laravel',
        'artisan',
        'eloquent',
        'blade',
        'composer',
        'rails',
        'activerecord',
        'gemfile',
        'bundler',
        'erb',
      ];

      for (const term of forbiddenTerms) {
        expect(content).not.toContain(term);
      }
    });
  });
});
