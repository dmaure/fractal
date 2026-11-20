import { describe, it, expect } from 'vitest';
import type { BackendFrontendRef } from '@fractal/core';
import { generateNginxConf } from './nginx-conf.js';

const frontend: BackendFrontendRef = {
  dir: 'web',
  contract: {
    version: '0',
    kind: 'frontend',
    target: 'x',
    platform: 'web',
    runtimeRequirements: { binaries: [] },
    build: { image: 'node:22-alpine', installCommand: 'npm ci', buildCommand: 'npm run build', outputDir: 'dist' },
    serve: 'static',
    dev: { command: 'npm run dev', port: 3000 },
    apiBaseEnv: 'API_URL',
  },
};

// El contenido completo del stub se cubre en el snapshot del árbol
// (create-project.tree.test.ts); aquí solo aserciones de comportamiento.
describe('nginx-conf', () => {
  describe('generateNginxConf', () => {
    it('genera una configuración nginx no vacía', () => {
      const result = generateNginxConf();
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('events {');
      expect(result).toContain('http {');
    });

    it('escucha en el puerto 80 y sirve public/', () => {
      const result = generateNginxConf();
      expect(result).toContain('listen 80;');
      expect(result).toContain('root /var/www/html/public;');
    });

    it('termina TLS en el bloque 443 con el cert montado (FRA-71)', () => {
      const result = generateNginxConf();
      expect(result).toContain('listen 443 ssl;');
      expect(result).toContain('http2 on;');
      expect(result).toContain('ssl_certificate /etc/nginx/ssl/fullchain.pem;');
      expect(result).toContain('ssl_certificate_key /etc/nginx/ssl/privkey.pem;');
      expect(result).toContain('ssl_protocols TLSv1.2 TLSv1.3;');
    });

    it('sirve el webroot ACME y redirige HTTP a HTTPS (FRA-71)', () => {
      const result = generateNginxConf();
      expect(result).toContain('location /.well-known/acme-challenge/');
      expect(result).toContain('root /var/www/certbot;');
      expect(result).toContain('return 301 https://$host$request_uri;');
    });

    it('sin frontend, / lo resuelve Laravel', () => {
      const result = generateNginxConf();
      expect(result).not.toContain('public/spa');
    });

    it('/api/ va a Laravel y / sirve el frontend estático con fallback a index.html', () => {
      const result = generateNginxConf([frontend]);
      expect(result).toContain('location /api/ {');
      expect(result).toContain('try_files $uri /index.php?$query_string;');
      expect(result).toContain('root /var/www/html/public/spa;');
      expect(result).toContain('try_files $uri /index.html;');
    });

    it('delega PHP al contenedor app por fastcgi en el puerto 9000', () => {
      const result = generateNginxConf();
      expect(result).toContain('fastcgi_pass app:9000;');
      expect(result).toContain('SCRIPT_FILENAME $realpath_root$fastcgi_script_name');
    });
  });
});
