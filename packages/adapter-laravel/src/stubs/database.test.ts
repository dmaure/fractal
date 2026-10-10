import { describe, it, expect } from 'vitest';
import { generateDatabaseGitignore } from './database.js';

describe('database', () => {
  describe('generateDatabaseGitignore', () => {
    it('genera el .gitignore de database/', () => {
      const result = generateDatabaseGitignore();
      expect(result).toMatchSnapshot();
    });

    it('ignora archivos SQLite', () => {
      const result = generateDatabaseGitignore();
      expect(result).toContain('*.sqlite');
      expect(result).toContain('*.sqlite-journal');
    });
  });
});
