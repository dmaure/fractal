import { describe, it, expect } from 'vitest';
import { generateConsoleRoutes } from './routes.js';

describe('routes', () => {
  describe('generateConsoleRoutes', () => {
    it('genera el stub de routes/console.php', () => {
      const result = generateConsoleRoutes();
      expect(result).toMatchSnapshot();
    });

    it('define el comando inspire', () => {
      const result = generateConsoleRoutes();
      expect(result).toContain("Artisan::command('inspire'");
    });
  });
});
