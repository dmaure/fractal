import { describe, it, expect } from 'vitest';
import { generateDatabaseGitignore } from './database.js';

describe('database', () => {
  // El contenido completo del stub se cubre en el snapshot del árbol
  // (create-project.tree.test.ts); aquí solo aserciones de comportamiento.
  describe('generateDatabaseGitignore', () => {
    it('ignora archivos SQLite', () => {
      const result = generateDatabaseGitignore();
      expect(result).toContain('*.sqlite');
      expect(result).toContain('*.sqlite-journal');
    });
  });
});
