import { describe, it, expect } from 'vitest';
import { generateStorageFrameworkGitignore } from './storage.js';

// El contenido completo de cada stub de storage/ se cubre en el snapshot del
// árbol (create-project.tree.test.ts); aquí solo aserciones de comportamiento.
describe('storage', () => {
  describe('generateStorageFrameworkGitignore', () => {
    it('ignora archivos compilados de Laravel', () => {
      const result = generateStorageFrameworkGitignore();
      expect(result).toContain('compiled.php');
      expect(result).toContain('config.php');
      expect(result).toContain('routes.php');
    });
  });
});
