import { describe, it, expect } from 'vitest';
import { generateConsoleRoutes, generateApiWebRoutes } from './routes.js';

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

  describe('generateApiWebRoutes', () => {
    it('genera el stub de routes/web.php para topologías desacopladas', () => {
      const result = generateApiWebRoutes();
      expect(result).toMatchSnapshot();
    });

    it('es un archivo PHP válido sin rutas de aplicación', () => {
      const result = generateApiWebRoutes();
      expect(result.startsWith('<?php')).toBe(true);
      expect(result).not.toContain('Route::');
    });
  });
});
