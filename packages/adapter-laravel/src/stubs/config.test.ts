import { describe, it, expect } from 'vitest';
import { generateConfigApp, generateConfigDatabase } from './config.js';

describe('config', () => {
  describe('generateConfigApp', () => {
    it('genera el stub de config/app.php', () => {
      const result = generateConfigApp();
      expect(result).toMatchSnapshot();
    });

    it('lee nombre de la aplicación de .env', () => {
      const result = generateConfigApp();
      expect(result).toContain("env('APP_NAME'");
    });

    it('lee APP_KEY de .env', () => {
      const result = generateConfigApp();
      expect(result).toContain("env('APP_KEY')");
    });

    it('configura timezone UTC', () => {
      const result = generateConfigApp();
      expect(result).toContain("'timezone' => 'UTC'");
    });
  });

  describe('generateConfigDatabase', () => {
    it('genera el stub de config/database.php', () => {
      const result = generateConfigDatabase();
      expect(result).toMatchSnapshot();
    });

    it('configura SQLite como default', () => {
      const result = generateConfigDatabase();
      expect(result).toContain("'default' => env('DB_CONNECTION', 'sqlite')");
    });

    it('incluye configuraciones de mysql, pgsql, mariadb y sqlsrv', () => {
      const result = generateConfigDatabase();
      expect(result).toContain("'mysql' =>");
      expect(result).toContain("'pgsql' =>");
      expect(result).toContain("'mariadb' =>");
      expect(result).toContain("'sqlsrv' =>");
    });
  });
});
