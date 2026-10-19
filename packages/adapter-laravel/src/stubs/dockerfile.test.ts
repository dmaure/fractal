import { describe, it, expect } from 'vitest';
import { generateDockerfile, generateDockerignore } from './dockerfile.js';

// El contenido completo del stub se cubre en el snapshot del árbol
// (create-project.tree.test.ts); aquí solo aserciones de comportamiento.
describe('dockerfile', () => {
  describe('generateDockerfile', () => {
    it('genera un Dockerfile no vacío basado en php-fpm', () => {
      const result = generateDockerfile();
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('FROM php:8.3-fpm');
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

  describe('generateDockerignore', () => {
    it('excluye artefactos que se regeneran en el build', () => {
      const result = generateDockerignore();
      expect(result).toContain('node_modules');
      expect(result).toContain('vendor');
      expect(result).toContain('.git');
    });
  });
});
