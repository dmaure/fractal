import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { initializeGit } from './git-initializer.js';

const TEST_DIR = join(process.cwd(), 'test-git-init');

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

describe('initializeGit', () => {
  describe('topología monolith', () => {
    it('crea un único repositorio con commit inicial', { timeout: 30000 }, () => {
      const projectName = 'test-monolith';
      const targetDir = join(TEST_DIR, projectName);
      
      const result = initializeGit(projectName, targetDir, 'monolith');
      
      expect(result.success).toBe(true);
      expect(result.repositories).toHaveLength(1);
      expect(result.repositories[0]).toBe(targetDir);
      
      // Verificar que el directorio existe
      expect(existsSync(targetDir)).toBe(true);
      
      // Verificar que tiene .git
      expect(existsSync(join(targetDir, '.git'))).toBe(true);
      
      // Verificar que tiene .gitignore
      const gitignore = readFileSync(join(targetDir, '.gitignore'), 'utf-8');
      expect(gitignore).toContain('.env');
      expect(gitignore).toContain('.DS_Store');
      
      // Verificar que tiene README
      expect(existsSync(join(targetDir, 'README.md'))).toBe(true);
      
      // Verificar que tiene al menos un commit
      const log = execSync('git log --oneline', { cwd: targetDir }).toString();
      expect(log).toContain('inicializar proyecto');
    });
    
    it('no genera fractal.project.yml para monolith', { timeout: 30000 }, () => {
      const projectName = 'test-monolith-no-manifest';
      const targetDir = join(TEST_DIR, projectName);
      
      initializeGit(projectName, targetDir, 'monolith');
      
      expect(existsSync(join(targetDir, 'fractal.project.yml'))).toBe(false);
    });
  });
  
  describe('topología monorepo', () => {
    it('crea un único repositorio con commit inicial', { timeout: 30000 }, () => {
      const projectName = 'test-monorepo';
      const targetDir = join(TEST_DIR, projectName);
      
      const result = initializeGit(projectName, targetDir, 'monorepo');
      
      expect(result.success).toBe(true);
      expect(result.repositories).toHaveLength(1);
      expect(result.repositories[0]).toBe(targetDir);
      
      // Verificar que el directorio existe
      expect(existsSync(targetDir)).toBe(true);
      
      // Verificar que tiene .git
      expect(existsSync(join(targetDir, '.git'))).toBe(true);
      
      // Verificar que tiene .gitignore con node_modules
      const gitignore = readFileSync(join(targetDir, '.gitignore'), 'utf-8');
      expect(gitignore).toContain('node_modules/');
      expect(gitignore).toContain('.env');
      
      // Verificar que tiene commit
      const log = execSync('git log --oneline', { cwd: targetDir }).toString();
      expect(log).toContain('inicializar proyecto');
    });
    
    it('no genera fractal.project.yml para monorepo', { timeout: 30000 }, () => {
      const projectName = 'test-monorepo-no-manifest';
      const targetDir = join(TEST_DIR, projectName);
      
      initializeGit(projectName, targetDir, 'monorepo');
      
      expect(existsSync(join(targetDir, 'fractal.project.yml'))).toBe(false);
    });
  });
  
  describe('topología multirepo', () => {
    it('crea dos repositorios separados', { timeout: 30000 }, () => {
      const projectName = 'test-multi';
      // Para multirepo, targetDir es donde se intentaría crear el proyecto,
      // pero en realidad los repos se crean en el padre de targetDir
      const targetDir = join(TEST_DIR, projectName);
      
      const result = initializeGit(projectName, targetDir, 'multirepo');
      
      expect(result.success).toBe(true);
      expect(result.repositories).toHaveLength(2);
      
      // Los repos se crean en el directorio padre de targetDir
      const apiDir = join(TEST_DIR, `${projectName}-api`);
      const webDir = join(TEST_DIR, `${projectName}-web`);
      
      expect(result.repositories).toContain(apiDir);
      expect(result.repositories).toContain(webDir);
      
      // Verificar que ambos directorios existen
      expect(existsSync(apiDir)).toBe(true);
      expect(existsSync(webDir)).toBe(true);
      
      // Verificar que ambos tienen .git
      expect(existsSync(join(apiDir, '.git'))).toBe(true);
      expect(existsSync(join(webDir, '.git'))).toBe(true);
    });
    
    it('cada repositorio tiene su propio commit inicial', { timeout: 30000 }, () => {
      const projectName = 'test-multi-commits';
      const targetDir = join(TEST_DIR, projectName);
      
      initializeGit(projectName, targetDir, 'multirepo');
      
      const apiDir = join(TEST_DIR, `${projectName}-api`);
      const webDir = join(TEST_DIR, `${projectName}-web`);
      
      // Verificar commits en API
      const apiLog = execSync('git log --oneline', { cwd: apiDir }).toString();
      expect(apiLog).toContain('api');
      expect(apiLog).toContain(projectName);
      
      // Verificar commits en Web
      const webLog = execSync('git log --oneline', { cwd: webDir }).toString();
      expect(webLog).toContain('web');
      expect(webLog).toContain(projectName);
    });
    
    it('fractal.project.yml está en .gitignore', { timeout: 30000 }, () => {
      const projectName = 'test-multi-gitignore';
      const targetDir = join(TEST_DIR, projectName);
      
      initializeGit(projectName, targetDir, 'multirepo');
      
      const apiDir = join(TEST_DIR, `${projectName}-api`);
      const webDir = join(TEST_DIR, `${projectName}-web`);
      
      // Verificar .gitignore en API
      const apiGitignore = readFileSync(join(apiDir, '.gitignore'), 'utf-8');
      expect(apiGitignore).toContain('fractal.project.yml');
      
      // Verificar .gitignore en Web
      const webGitignore = readFileSync(join(webDir, '.gitignore'), 'utf-8');
      expect(webGitignore).toContain('fractal.project.yml');
    });
    
    it('fractal.project.yml no está commiteado', { timeout: 30000 }, () => {
      const projectName = 'test-multi-not-committed';
      const targetDir = join(TEST_DIR, projectName);
      
      initializeGit(projectName, targetDir, 'multirepo');
      
      const apiDir = join(TEST_DIR, `${projectName}-api`);
      const webDir = join(TEST_DIR, `${projectName}-web`);
      
      // Verificar que no está en el commit de API
      const apiFiles = execSync('git ls-tree -r --name-only HEAD', { cwd: apiDir }).toString();
      expect(apiFiles).not.toContain('fractal.project.yml');
      
      // Verificar que no está en el commit de Web
      const webFiles = execSync('git ls-tree -r --name-only HEAD', { cwd: webDir }).toString();
      expect(webFiles).not.toContain('fractal.project.yml');
    });
    
    it('genera fractal.project.yml con contenido correcto', { timeout: 30000 }, () => {
      const projectName = 'test-multi-manifest-content';
      const targetDir = join(TEST_DIR, projectName);
      
      initializeGit(projectName, targetDir, 'multirepo');
      
      const apiDir = join(TEST_DIR, `${projectName}-api`);
      const webDir = join(TEST_DIR, `${projectName}-web`);
      
      // Verificar que los manifiestos existen físicamente
      expect(existsSync(join(apiDir, 'fractal.project.yml'))).toBe(true);
      expect(existsSync(join(webDir, 'fractal.project.yml'))).toBe(true);
      
      // Verificar contenido del manifiesto API
      const apiManifest = readFileSync(join(apiDir, 'fractal.project.yml'), 'utf-8');
      expect(apiManifest).toContain('role: api');
      expect(apiManifest).toContain('git_url: null');
      expect(apiManifest).toContain('domain: null');
      expect(apiManifest).toContain('orchestration_state: pending');
      
      // Verificar contenido del manifiesto Web
      const webManifest = readFileSync(join(webDir, 'fractal.project.yml'), 'utf-8');
      expect(webManifest).toContain('role: web');
      expect(webManifest).toContain('git_url: null');
      expect(webManifest).toContain('domain: null');
      expect(webManifest).toContain('orchestration_state: pending');
    });
  });
  
  describe('manejo de errores', () => {
    it('retorna error si la topología es inválida', () => {
      const projectName = 'test-invalid';
      const targetDir = join(TEST_DIR, projectName);
      
      const result = initializeGit(projectName, targetDir, 'invalid' as any);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.repositories).toHaveLength(0);
    });
  });
});
