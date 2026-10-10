import { describe, it, expect } from 'vitest';
import { generateBootstrapApp, generateBootstrapProviders } from './bootstrap.js';

describe('bootstrap', () => {
  describe('generateBootstrapApp', () => {
    it('genera el stub de bootstrap/app.php', () => {
      const result = generateBootstrapApp();
      expect(result).toMatchSnapshot();
    });

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
    it('genera el stub de bootstrap/providers.php', () => {
      const result = generateBootstrapProviders();
      expect(result).toMatchSnapshot();
    });

    it('registra AppServiceProvider', () => {
      const result = generateBootstrapProviders();
      expect(result).toContain('App\\Providers\\AppServiceProvider::class');
    });
  });
});
