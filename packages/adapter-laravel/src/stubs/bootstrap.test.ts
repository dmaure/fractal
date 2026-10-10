import { describe, it, expect } from 'vitest';
import { generateBootstrapApp, generateBootstrapProviders } from './bootstrap.js';

// El contenido completo de cada stub se cubre en el snapshot del árbol
// (create-project.tree.test.ts); aquí solo aserciones de comportamiento.
describe('bootstrap', () => {
  describe('generateBootstrapApp', () => {
    it('configura routing con rutas api, web y console', () => {
      const result = generateBootstrapApp();
      expect(result).toContain('withRouting');
      expect(result).toContain("api: __DIR__.'/../routes/api.php'");
      expect(result).toContain("web: __DIR__.'/../routes/web.php'");
      expect(result).toContain("commands: __DIR__.'/../routes/console.php'");
    });

    it('incluye health check endpoint', () => {
      const result = generateBootstrapApp();
      expect(result).toContain("health: '/up'");
    });
  });

  describe('generateBootstrapProviders', () => {
    it('registra AppServiceProvider', () => {
      const result = generateBootstrapProviders();
      expect(result).toContain('App\\Providers\\AppServiceProvider::class');
    });
  });
});
