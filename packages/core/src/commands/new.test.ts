import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { newCommand } from './new.js';
import type { NewCommandOptions } from '../types/new-command.js';

const TEST_DIR = join(process.cwd(), 'test-integration');

function cleanTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

beforeEach(() => {
  cleanTestDir();
  mkdirSync(TEST_DIR, { recursive: true });
  vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit called');
  }) as any);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanTestDir();
  vi.restoreAllMocks();
});

describe('newCommand', () => {
  it('acepta proyecto con topología vía flag', async () => {
    const projectName = 'test-project';
    const options: NewCommandOptions = {
      topology: 'monolith',
      force: false,
    };
    
    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);
    
    await newCommand(projectName, options);
    
    process.chdir(originalCwd);
    
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Parámetros validados')
    );
  });
  
  it('acepta cada topología válida', { timeout: 60000 }, async () => {
    const topologies: Array<'monolith' | 'monorepo' | 'multirepo'> = [
      'monolith',
      'monorepo',
      'multirepo',
    ];
    
    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);
    
    for (const topology of topologies) {
      vi.clearAllMocks();
      
      await newCommand(`test-${topology}`, { topology });
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(topology)
      );
    }
    
    process.chdir(originalCwd);
  });
  
  it('rechaza topología inválida', async () => {
    const projectName = 'test-invalid';
    const options: NewCommandOptions = {
      topology: 'invalid' as any,
    };
    
    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);
    
    await expect(async () => {
      await newCommand(projectName, options);
    }).rejects.toThrow('process.exit called');
    
    process.chdir(originalCwd);
    
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Topología inválida')
    );
  });
  
  it('aborta si directorio no está vacío sin --force', async () => {
    const projectName = 'non-empty-project';
    const targetPath = join(TEST_DIR, projectName);
    
    mkdirSync(targetPath, { recursive: true });
    writeFileSync(join(targetPath, 'existing.txt'), 'content');
    
    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);
    
    await expect(async () => {
      await newCommand(projectName, { topology: 'monolith' });
    }).rejects.toThrow('process.exit called');
    
    process.chdir(originalCwd);
    
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('no está vacío')
    );
  });
  
  it('procede con --force sobre directorio no vacío', { timeout: 30000 }, async () => {
    const projectName = 'forced-project';
    const targetPath = join(TEST_DIR, projectName);
    
    mkdirSync(targetPath, { recursive: true });
    writeFileSync(join(targetPath, 'existing.txt'), 'content');
    
    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);
    
    await newCommand(projectName, { topology: 'monolith', force: true });
    
    process.chdir(originalCwd);
    
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Parámetros validados')
    );
  });
  
  it('permite proyecto en directorio con solo .git vacío', async () => {
    const projectName = 'git-project';
    const targetPath = join(TEST_DIR, projectName);
    
    mkdirSync(join(targetPath, '.git', 'refs', 'heads'), { recursive: true });
    
    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);
    
    await newCommand(projectName, { topology: 'monolith' });
    
    process.chdir(originalCwd);
    
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Parámetros validados')
    );
  });
  
  describe('inicialización de git', () => {
    it('inicializa git para monolith', { timeout: 30000 }, async () => {
      const projectName = 'git-monolith';
      const targetPath = join(TEST_DIR, projectName);
      
      const originalCwd = process.cwd();
      process.chdir(TEST_DIR);
      
      await newCommand(projectName, { topology: 'monolith' });
      
      process.chdir(originalCwd);
      
      // Verificar que existe el repositorio
      expect(existsSync(join(targetPath, '.git'))).toBe(true);
      
      // Verificar que tiene commit
      const log = execSync('git log --oneline', { cwd: targetPath }).toString();
      expect(log).toBeTruthy();
      
      // Verificar que tiene .gitignore
      expect(existsSync(join(targetPath, '.gitignore'))).toBe(true);
    });
    
    it('inicializa git para monorepo', { timeout: 30000 }, async () => {
      const projectName = 'git-monorepo';
      const targetPath = join(TEST_DIR, projectName);
      
      const originalCwd = process.cwd();
      process.chdir(TEST_DIR);
      
      await newCommand(projectName, { topology: 'monorepo' });
      
      process.chdir(originalCwd);
      
      // Verificar que existe el repositorio
      expect(existsSync(join(targetPath, '.git'))).toBe(true);
      
      // Verificar que tiene commit
      const log = execSync('git log --oneline', { cwd: targetPath }).toString();
      expect(log).toBeTruthy();
      
      // Verificar .gitignore con node_modules
      const gitignore = readFileSync(join(targetPath, '.gitignore'), 'utf-8');
      expect(gitignore).toContain('node_modules/');
    });
    
    it('inicializa dos repos para multirepo', { timeout: 30000 }, async () => {
      const projectName = 'git-multi';
      
      const originalCwd = process.cwd();
      process.chdir(TEST_DIR);
      
      await newCommand(projectName, { topology: 'multirepo' });
      
      process.chdir(originalCwd);
      
      const apiPath = join(TEST_DIR, `${projectName}-api`);
      const webPath = join(TEST_DIR, `${projectName}-web`);
      
      // Verificar que ambos repos existen
      expect(existsSync(join(apiPath, '.git'))).toBe(true);
      expect(existsSync(join(webPath, '.git'))).toBe(true);
      
      // Verificar commits en ambos
      const apiLog = execSync('git log --oneline', { cwd: apiPath }).toString();
      expect(apiLog).toBeTruthy();
      
      const webLog = execSync('git log --oneline', { cwd: webPath }).toString();
      expect(webLog).toBeTruthy();
    });
    
    it('genera manifiestos para multirepo', { timeout: 30000 }, async () => {
      const projectName = 'manifest-multi';
      
      const originalCwd = process.cwd();
      process.chdir(TEST_DIR);
      
      await newCommand(projectName, { topology: 'multirepo' });
      
      process.chdir(originalCwd);
      
      const apiPath = join(TEST_DIR, `${projectName}-api`);
      const webPath = join(TEST_DIR, `${projectName}-web`);
      
      // Verificar que los manifiestos existen
      expect(existsSync(join(apiPath, 'fractal.project.yml'))).toBe(true);
      expect(existsSync(join(webPath, 'fractal.project.yml'))).toBe(true);
      
      // Verificar contenido
      const apiManifest = readFileSync(join(apiPath, 'fractal.project.yml'), 'utf-8');
      expect(apiManifest).toContain('role: api');
      
      const webManifest = readFileSync(join(webPath, 'fractal.project.yml'), 'utf-8');
      expect(webManifest).toContain('role: web');
    });
    
    it('fractal.project.yml está en .gitignore para multirepo', { timeout: 30000 }, async () => {
      const projectName = 'gitignore-multi';
      
      const originalCwd = process.cwd();
      process.chdir(TEST_DIR);
      
      await newCommand(projectName, { topology: 'multirepo' });
      
      process.chdir(originalCwd);
      
      const apiPath = join(TEST_DIR, `${projectName}-api`);
      const webPath = join(TEST_DIR, `${projectName}-web`);
      
      // Verificar .gitignore
      const apiGitignore = readFileSync(join(apiPath, '.gitignore'), 'utf-8');
      expect(apiGitignore).toContain('fractal.project.yml');
      
      const webGitignore = readFileSync(join(webPath, '.gitignore'), 'utf-8');
      expect(webGitignore).toContain('fractal.project.yml');
      
      // Verificar que NO está commiteado
      const apiFiles = execSync('git ls-tree -r --name-only HEAD', { cwd: apiPath }).toString();
      expect(apiFiles).not.toContain('fractal.project.yml');
      
      const webFiles = execSync('git ls-tree -r --name-only HEAD', { cwd: webPath }).toString();
      expect(webFiles).not.toContain('fractal.project.yml');
    });
  });
});
