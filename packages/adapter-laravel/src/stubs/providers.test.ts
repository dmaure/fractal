import { describe, it, expect } from 'vitest';
import { generateAppServiceProvider } from './providers.js';

describe('providers', () => {
  describe('generateAppServiceProvider', () => {
    it('genera el stub de AppServiceProvider', () => {
      const result = generateAppServiceProvider();
      expect(result).toMatchSnapshot();
    });

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
