import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ManifestManager } from './manifest-manager.js';
import type { ProjectManifest } from './types.js';

const TEST_DIR = join(process.cwd(), 'test-manifest-deploy');

function cleanTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

beforeEach(() => {
  cleanTestDir();
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  cleanTestDir();
});

function createManifestFile(dir: string, manifest: ProjectManifest) {
  const content = `role: ${manifest.role}
sibling:
  git_url: ${manifest.sibling.git_url === null ? 'null' : manifest.sibling.git_url}
  domain: ${manifest.sibling.domain === null ? 'null' : manifest.sibling.domain}
orchestration_state: ${manifest.orchestration_state}
`;
  writeFileSync(join(dir, 'fractal.project.yml'), content, 'utf-8');
}

describe('ManifestManager', () => {
  describe('read', () => {
    it('retorna exists: false si el manifiesto no existe', () => {
      const manager = new ManifestManager(TEST_DIR);
      const result = manager.read();
      
      expect(result.exists).toBe(false);
      expect(result.manifest).toBeUndefined();
    });

    it('lee manifiesto en estado pending', () => {
      const manifest: ProjectManifest = {
        role: 'api',
        sibling: {
          git_url: null,
          domain: null,
        },
        orchestration_state: 'pending',
      };
      
      createManifestFile(TEST_DIR, manifest);
      
      const manager = new ManifestManager(TEST_DIR);
      const result = manager.read();
      
      expect(result.exists).toBe(true);
      expect(result.manifest).toEqual(manifest);
      expect(result.error).toBeUndefined();
    });

    it('lee manifiesto en estado resolved', () => {
      const manifest: ProjectManifest = {
        role: 'web',
        sibling: {
          git_url: 'https://github.com/user/api.git',
          domain: 'api.example.com',
        },
        orchestration_state: 'resolved',
      };
      
      createManifestFile(TEST_DIR, manifest);
      
      const manager = new ManifestManager(TEST_DIR);
      const result = manager.read();
      
      expect(result.exists).toBe(true);
      expect(result.manifest).toEqual(manifest);
      expect(result.error).toBeUndefined();
    });

    it('maneja manifiesto con formato inválido', () => {
      writeFileSync(
        join(TEST_DIR, 'fractal.project.yml'),
        'contenido inválido sin estructura',
        'utf-8'
      );
      
      const manager = new ManifestManager(TEST_DIR);
      const result = manager.read();
      
      expect(result.exists).toBe(true);
      expect(result.manifest).toBeUndefined();
      expect(result.error).toBeDefined();
    });
  });

  describe('updateWithSiblingInfo', () => {
    it('actualiza manifiesto pending con información del hermano', () => {
      const initialManifest: ProjectManifest = {
        role: 'api',
        sibling: {
          git_url: null,
          domain: null,
        },
        orchestration_state: 'pending',
      };
      
      createManifestFile(TEST_DIR, initialManifest);
      
      const manager = new ManifestManager(TEST_DIR);
      const result = manager.updateWithSiblingInfo({
        gitUrl: 'https://github.com/user/web.git',
        domain: 'web.example.com',
      });
      
      expect(result.success).toBe(true);
      expect(result.filePath).toBe(join(TEST_DIR, 'fractal.project.yml'));
      
      // Verificar que el manifiesto fue actualizado
      const readResult = manager.read();
      expect(readResult.manifest?.sibling.git_url).toBe('https://github.com/user/web.git');
      expect(readResult.manifest?.sibling.domain).toBe('web.example.com');
      expect(readResult.manifest?.orchestration_state).toBe('resolved');
    });

    it('puede reescribir manifiesto resolved (para --reconfigure)', () => {
      const initialManifest: ProjectManifest = {
        role: 'web',
        sibling: {
          git_url: 'https://github.com/user/api-old.git',
          domain: 'api-old.example.com',
        },
        orchestration_state: 'resolved',
      };
      
      createManifestFile(TEST_DIR, initialManifest);
      
      const manager = new ManifestManager(TEST_DIR);
      const result = manager.updateWithSiblingInfo({
        gitUrl: 'https://github.com/user/api-new.git',
        domain: 'api-new.example.com',
      });
      
      expect(result.success).toBe(true);
      
      // Verificar que los valores fueron actualizados
      const readResult = manager.read();
      expect(readResult.manifest?.sibling.git_url).toBe('https://github.com/user/api-new.git');
      expect(readResult.manifest?.sibling.domain).toBe('api-new.example.com');
      expect(readResult.manifest?.orchestration_state).toBe('resolved');
    });

    it('falla si el manifiesto no existe', () => {
      const manager = new ManifestManager(TEST_DIR);
      const result = manager.updateWithSiblingInfo({
        gitUrl: 'https://github.com/user/web.git',
        domain: 'web.example.com',
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('no existe');
      expect(result.error).toContain('multirepo');
    });
  });

  describe('write', () => {
    it('escribe manifiesto completo', () => {
      const manifest: ProjectManifest = {
        role: 'api',
        sibling: {
          git_url: 'https://github.com/user/web.git',
          domain: 'web.example.com',
        },
        orchestration_state: 'resolved',
      };
      
      const manager = new ManifestManager(TEST_DIR);
      const result = manager.write(manifest);
      
      expect(result.success).toBe(true);
      expect(result.filePath).toBe(join(TEST_DIR, 'fractal.project.yml'));
      
      // Verificar que el archivo fue escrito correctamente
      const readResult = manager.read();
      expect(readResult.manifest).toEqual(manifest);
    });

    it('sobrescribe manifiesto existente', () => {
      const oldManifest: ProjectManifest = {
        role: 'api',
        sibling: { git_url: null, domain: null },
        orchestration_state: 'pending',
      };
      
      createManifestFile(TEST_DIR, oldManifest);
      
      const newManifest: ProjectManifest = {
        role: 'web',
        sibling: {
          git_url: 'https://github.com/user/api.git',
          domain: 'api.example.com',
        },
        orchestration_state: 'resolved',
      };
      
      const manager = new ManifestManager(TEST_DIR);
      const result = manager.write(newManifest);
      
      expect(result.success).toBe(true);
      
      // Verificar que el contenido fue reemplazado
      const readResult = manager.read();
      expect(readResult.manifest).toEqual(newManifest);
    });
  });

  describe('formato YAML', () => {
    it('genera YAML con null para valores vacíos', () => {
      const manifest: ProjectManifest = {
        role: 'api',
        sibling: {
          git_url: null,
          domain: null,
        },
        orchestration_state: 'pending',
      };
      
      const manager = new ManifestManager(TEST_DIR);
      manager.write(manifest);
      
      const readResult = manager.read();
      expect(readResult.manifest?.sibling.git_url).toBeNull();
      expect(readResult.manifest?.sibling.domain).toBeNull();
    });

    it('preserva URLs y dominios con caracteres especiales', () => {
      const manifest: ProjectManifest = {
        role: 'web',
        sibling: {
          git_url: 'https://github.com/org-name/repo-name.git',
          domain: 'api-staging.sub.example.com',
        },
        orchestration_state: 'resolved',
      };
      
      const manager = new ManifestManager(TEST_DIR);
      manager.write(manifest);
      
      const readResult = manager.read();
      expect(readResult.manifest?.sibling.git_url).toBe('https://github.com/org-name/repo-name.git');
      expect(readResult.manifest?.sibling.domain).toBe('api-staging.sub.example.com');
    });
  });
});
