import { describe, it, expect } from 'vitest';
import type { BackendFrontendRef } from '@fractal/core';
import { generateDockerfile, generateDockerignore } from './dockerfile.js';

const frontend: BackendFrontendRef = {
  dir: 'web',
  contract: {
    version: '0',
    kind: 'frontend',
    target: 'x',
    platform: 'web',
    runtimeRequirements: { binaries: [] },
    build: {
      image: 'node:22-alpine',
      dependencyManifests: 'package*.json',
      installCommand: 'npm ci',
      buildCommand: 'npm run build',
      outputDir: 'dist',
    },
    serve: 'static',
    dev: { command: 'npm run dev', port: 3000 },
    apiBaseEnv: 'API_URL',
  },
};

// El contenido completo del stub se cubre en el snapshot del árbol
// (create-project.tree.test.ts); aquí solo aserciones de comportamiento.
describe('dockerfile', () => {
  describe('generateDockerfile', () => {
    it('genera un Dockerfile no vacío basado en php-fpm', () => {
      const result = generateDockerfile();
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('FROM php:8.3-fpm');
    });

    it('sin frontend no hay etapa de build ni copia del SPA', () => {
      const result = generateDockerfile();
      expect(result).not.toContain('web-build');
      expect(result).not.toContain('public/spa');
    });

    it('compila el frontend del contrato y copia su salida a public/spa', () => {
      const result = generateDockerfile([frontend]);
      expect(result).toContain('FROM node:22-alpine AS web-build');
      expect(result).toContain('WORKDIR /app/web');
      expect(result).toContain('COPY web/package*.json ./');
      expect(result).toContain('RUN npm ci');
      expect(result).toContain('npm run build');
      expect(result).toContain('COPY --from=web-build /app/web/dist /var/www/html/public/spa');
    });

    it('instala dependencias de producción con Composer', () => {
      const result = generateDockerfile();
      expect(result).toContain('composer install --no-dev --optimize-autoloader');
    });

    it('copia la app y ajusta permisos de storage y bootstrap/cache', () => {
      const result = generateDockerfile();
      expect(result).toContain('COPY . /var/www/html');
      expect(result).toContain('storage bootstrap/cache');
    });

    it('expone el puerto 9000 de php-fpm', () => {
      const result = generateDockerfile();
      expect(result).toContain('EXPOSE 9000');
      expect(result).toContain('CMD ["php-fpm"]');
    });

    it('desactiva clear_env de php-fpm para que APP_KEY llegue a Laravel', () => {
      const result = generateDockerfile();
      expect(result).toContain('clear_env = no');
      expect(result).toContain('zz-fractal.conf');
    });
  });

  describe('monorepo (backendDir api, FRA-114)', () => {
    it('copia solo api/ a la app y compila web/ desde la raíz del contexto', () => {
      const result = generateDockerfile([frontend], { backendDir: 'api' });
      expect(result).toContain('COPY api/ /var/www/html');
      expect(result).not.toContain('COPY . /var/www/html');
      expect(result).toContain('FROM node:22-alpine AS web-build');
      expect(result).toContain('COPY web/package*.json ./');
      expect(result).toContain('COPY web/ ./');
      expect(result).toContain('COPY --from=web-build /app/web/dist /var/www/html/public/spa');
    });

    it('el .dockerignore excluye los artefactos de api/ y web/', () => {
      const result = generateDockerignore([frontend], { backendDir: 'api' });
      expect(result).toContain('api/vendor');
      expect(result).toContain('api/.env');
      expect(result).toContain('api/storage/logs/*.log');
      expect(result).toContain('web/node_modules');
      expect(result).toContain('web/dist');
    });
  });

  describe('generateDockerignore', () => {
    it('excluye artefactos que se regeneran en el build', () => {
      const result = generateDockerignore([frontend]);
      expect(result).toContain('node_modules');
      expect(result).toContain('vendor');
      expect(result).toContain('.git');
      expect(result).toContain('web/node_modules');
      expect(result).toContain('web/dist');
    });
  });
});
