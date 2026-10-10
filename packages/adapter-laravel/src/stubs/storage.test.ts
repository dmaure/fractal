import { describe, it, expect } from 'vitest';
import {
  generateStorageAppGitignore,
  generateStorageAppPublicGitignore,
  generateStorageFrameworkGitignore,
  generateStorageFrameworkCacheGitignore,
  generateStorageFrameworkCacheDataGitignore,
  generateStorageFrameworkSessionsGitignore,
  generateStorageFrameworkTestingGitignore,
  generateStorageFrameworkViewsGitignore,
  generateStorageLogsGitignore,
} from './storage.js';

describe('storage', () => {
  describe('generateStorageAppGitignore', () => {
    it('genera el stub de storage/app/.gitignore', () => {
      const result = generateStorageAppGitignore();
      expect(result).toMatchSnapshot();
    });
  });

  describe('generateStorageAppPublicGitignore', () => {
    it('genera el stub de storage/app/public/.gitignore', () => {
      const result = generateStorageAppPublicGitignore();
      expect(result).toMatchSnapshot();
    });
  });

  describe('generateStorageFrameworkGitignore', () => {
    it('genera el stub de storage/framework/.gitignore', () => {
      const result = generateStorageFrameworkGitignore();
      expect(result).toMatchSnapshot();
    });

    it('ignora archivos compilados de Laravel', () => {
      const result = generateStorageFrameworkGitignore();
      expect(result).toContain('compiled.php');
      expect(result).toContain('config.php');
      expect(result).toContain('routes.php');
    });
  });

  describe('generateStorageFrameworkCacheGitignore', () => {
    it('genera el stub de storage/framework/cache/.gitignore', () => {
      const result = generateStorageFrameworkCacheGitignore();
      expect(result).toMatchSnapshot();
    });
  });

  describe('generateStorageFrameworkCacheDataGitignore', () => {
    it('genera el stub de storage/framework/cache/data/.gitignore', () => {
      const result = generateStorageFrameworkCacheDataGitignore();
      expect(result).toMatchSnapshot();
    });
  });

  describe('generateStorageFrameworkSessionsGitignore', () => {
    it('genera el stub de storage/framework/sessions/.gitignore', () => {
      const result = generateStorageFrameworkSessionsGitignore();
      expect(result).toMatchSnapshot();
    });
  });

  describe('generateStorageFrameworkTestingGitignore', () => {
    it('genera el stub de storage/framework/testing/.gitignore', () => {
      const result = generateStorageFrameworkTestingGitignore();
      expect(result).toMatchSnapshot();
    });
  });

  describe('generateStorageFrameworkViewsGitignore', () => {
    it('genera el stub de storage/framework/views/.gitignore', () => {
      const result = generateStorageFrameworkViewsGitignore();
      expect(result).toMatchSnapshot();
    });
  });

  describe('generateStorageLogsGitignore', () => {
    it('genera el stub de storage/logs/.gitignore', () => {
      const result = generateStorageLogsGitignore();
      expect(result).toMatchSnapshot();
    });
  });
});
