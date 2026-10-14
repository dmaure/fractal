import { describe, it, expect } from 'vitest';
import { generateAppBladeView } from './views.js';

// El contenido completo del stub se cubre en el snapshot del árbol
// (create-project.tree.test.ts); aquí solo aserciones de comportamiento.
describe('views', () => {
  describe('generateAppBladeView', () => {
    it('genera un documento HTML no vacío', () => {
      const result = generateAppBladeView();
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('<!DOCTYPE html>');
    });

    it('usa el nombre de la app desde la config', () => {
      const result = generateAppBladeView();
      expect(result).toContain("config('app.name')");
    });

    it('referencia el endpoint de salud', () => {
      const result = generateAppBladeView();
      expect(result).toContain('/api/health');
    });
  });
});
