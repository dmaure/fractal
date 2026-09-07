import { describe, it, expect } from 'vitest';
import { ComposeGenerator } from './compose-generator.js';
import type { ComposeConfig } from './types.js';

describe('ComposeGenerator', () => {
  const generator = new ComposeGenerator();

  describe('validateConfig', () => {
    it('should validate a correct backend-full config', () => {
      const config: ComposeConfig = {
        targetType: 'backend-full',
        projectName: 'test-project',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate a correct frontend-static config', () => {
      const config: ComposeConfig = {
        targetType: 'frontend-static',
        projectName: 'test-frontend',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject empty project name', () => {
      const config: ComposeConfig = {
        targetType: 'backend-full',
        projectName: '',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('nombre del proyecto');
    });

    it('should reject empty output path', () => {
      const config: ComposeConfig = {
        targetType: 'backend-full',
        projectName: 'test-project',
        outputPath: '',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('ruta de salida');
    });

    it('should reject invalid target type', () => {
      const config = {
        targetType: 'invalid-target' as any,
        projectName: 'test-project',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Tipo de target inválido');
    });
  });

  describe('generate - backend-full', () => {
    it('should generate docker-compose.yml for backend-full target', () => {
      const config: ComposeConfig = {
        targetType: 'backend-full',
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
    });

    it('should include all required services in backend-full compose', () => {
      const config: ComposeConfig = {
        targetType: 'backend-full',
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
  });

  describe('generate - frontend-static', () => {
    it('should generate docker-compose.yml for frontend-static target', () => {
      const config: ComposeConfig = {
        targetType: 'frontend-static',
        projectName: 'myfrontend',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.generate(config);

      expect(result.success).toBe(true);
      expect(result.filePath).toBe('/tmp/docker-compose.yml');
      expect(result.services).toEqual(['nginx']);
    });

    it('should only include nginx service in frontend-static compose', () => {
      const config: ComposeConfig = {
        targetType: 'frontend-static',
        projectName: 'frontend',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.generate(config);
      expect(result.services).toHaveLength(1);
      expect(result.services).toContain('nginx');
      expect(result.services).not.toContain('app');
      expect(result.services).not.toContain('db');
    });
  });

  describe('framework-agnostic compliance', () => {
    it('should not contain Laravel-specific terms in generated compose', () => {
      const config: ComposeConfig = {
        targetType: 'backend-full',
        projectName: 'test',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.generate(config);
      
      // Verificar que no hay términos prohibidos del Artículo II
      const prohibitedTerms = [
        'laravel',
        'artisan',
        'eloquent',
        'blade',
        'composer',
        'php',
      ];

      // Generar el contenido para inspeccionar
      const composeContent = JSON.stringify(result);
      
      prohibitedTerms.forEach((term) => {
        expect(composeContent.toLowerCase()).not.toContain(term);
      });
    });

    it('should not contain Rails-specific terms in generated compose', () => {
      const config: ComposeConfig = {
        targetType: 'backend-full',
        projectName: 'test',
        outputPath: '/tmp/docker-compose.yml',
      };

      const result = generator.generate(config);
      
      const prohibitedTerms = [
        'rails',
        'activerecord',
        'gemfile',
        'bundler',
        'erb',
        'ruby',
      ];

      const composeContent = JSON.stringify(result);
      
      prohibitedTerms.forEach((term) => {
        expect(composeContent.toLowerCase()).not.toContain(term);
      });
    });
  });
});
