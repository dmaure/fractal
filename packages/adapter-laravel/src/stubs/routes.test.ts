import { describe, it, expect } from 'vitest';
import { generateConsoleRoutes, generateApiWebRoutes } from './routes.js';

// El contenido completo de cada stub se cubre en el snapshot del árbol
// (create-project.tree.test.ts); aquí solo aserciones de comportamiento.
describe('routes', () => {
  describe('generateConsoleRoutes', () => {
    it('define el comando inspire', () => {
      const result = generateConsoleRoutes();
      expect(result).toContain("Artisan::command('inspire'");
    });
  });

  describe('generateApiWebRoutes', () => {
    it('es un archivo PHP válido sin rutas de aplicación', () => {
      const result = generateApiWebRoutes();
      expect(result.startsWith('<?php')).toBe(true);
      expect(result).not.toContain('Route::');
    });
  });
});
