import { describe, it, expect } from 'vitest';
import { generateAppServiceProvider } from './providers.js';

describe('providers', () => {
  // El contenido completo del stub se cubre en el snapshot del árbol
  // (create-project.tree.test.ts); aquí solo aserciones de comportamiento.
  describe('generateAppServiceProvider', () => {
    it('extiende ServiceProvider', () => {
      const result = generateAppServiceProvider();
      expect(result).toContain('extends ServiceProvider');
    });

    it('incluye métodos register y boot', () => {
      const result = generateAppServiceProvider();
      expect(result).toContain('public function register(): void');
      expect(result).toContain('public function boot(): void');
    });
  });
});
