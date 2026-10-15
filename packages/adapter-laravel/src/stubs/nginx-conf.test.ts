import { describe, it, expect } from 'vitest';
import { generateNginxConf } from './nginx-conf.js';

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

    it('usa try_files hacia index.php', () => {
      const result = generateNginxConf();
      expect(result).toContain('try_files $uri $uri/ /index.php?$query_string;');
    });

    it('delega PHP al contenedor app por fastcgi en el puerto 9000', () => {
      const result = generateNginxConf();
      expect(result).toContain('fastcgi_pass app:9000;');
      expect(result).toContain('SCRIPT_FILENAME $realpath_root$fastcgi_script_name');
    });
  });
});
