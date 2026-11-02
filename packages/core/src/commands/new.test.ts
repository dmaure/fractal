import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { newCommand } from './new.js';
import type { NewCommandOptions } from '../types/new-command.js';
import * as adapterResolver from '../adapter-resolver.js';
import * as adapterBridge from '../adapter-bridge.js';
import * as githubRepo from '../utils/github-repo.js';

const TEST_DIR = join(process.cwd(), 'test-integration');

function cleanTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

beforeEach(() => {
  cleanTestDir();
  mkdirSync(TEST_DIR, { recursive: true });
  Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
  
  // Configurar identidad de git para los tests
  process.env.GIT_AUTHOR_NAME = 'Fractal Test';
  process.env.GIT_AUTHOR_EMAIL = 'test@fractal.dev';
  process.env.GIT_COMMITTER_NAME = 'Fractal Test';
  process.env.GIT_COMMITTER_EMAIL = 'test@fractal.dev';
  
  // Mockear el resolver de adapters para retornar un adapter ficticio
  vi.spyOn(adapterResolver, 'resolveSingleAdapter').mockReturnValue({
    packageName: '@fractal/adapter-test',
    target: 'test',
    packagePath: '/fake/path',
    bridgeEntryPath: '/fake/path/bridge.js',
    command: [process.execPath, '/fake/path/bridge.js'],
  });
  
  // Mockear invokeAdapter para simular respuestas exitosas
  vi.spyOn(adapterBridge, 'invokeAdapter').mockImplementation(async (command, payload: any) => {
    if (payload.action === 'get-contract') {
      return {
        success: true,
        data: {
          version: '0',
          runtimeRequirements: { binaries: [] },
          deployRuntime: {
            services: ['app'],
            port: 8000,
            healthcheck: { path: '/health' },
          },
        },
      };
    }
    if (payload.action === 'create-project') {
      // Simular creación de estructura mínima para que los tests pasen
      const projectPath = join(payload.destinationPath, payload.name);
      if (payload.topology === 'multirepo') {
        // En multirepo se crean -api y -web
        mkdirSync(join(payload.destinationPath, `${payload.name}-api`), { recursive: true });
        mkdirSync(join(payload.destinationPath, `${payload.name}-web`), { recursive: true });
      } else {
        mkdirSync(projectPath, { recursive: true });
      }
      return {
        success: true,
        data: {
          projectPath: payload.topology === 'multirepo' ? payload.destinationPath : projectPath,
          message: 'Proyecto generado',
        },
      };
    }
    return { success: false, error: { message: 'Acción desconocida' } };
  });
  
  vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit called');
  }) as any);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanTestDir();
  
  // Limpiar variables de entorno de git
  delete process.env.GIT_AUTHOR_NAME;
  delete process.env.GIT_AUTHOR_EMAIL;
  delete process.env.GIT_COMMITTER_NAME;
  delete process.env.GIT_COMMITTER_EMAIL;
  
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
      expect.stringContaining('Proyecto creado exitosamente')
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

  describe('wizard no interactivo (FRA-77)', () => {
    it('falla con lista de variables si --non-interactive no tiene el set completo', async () => {
      const originalCwd = process.cwd();
      process.chdir(TEST_DIR);

      await expect(async () => {
        await newCommand('missing-env', { topology: 'monolith', nonInteractive: true });
      }).rejects.toThrow('process.exit called');

      process.chdir(originalCwd);

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('FRACTAL_NEW_SERVER_IP')
      );
    });

    it('con el set completo crea el repo y setea SSH_KNOWN_HOSTS', async () => {
      vi.spyOn(githubRepo, 'createGitHubRepository').mockResolvedValue({
        owner: 'acme',
        name: 'full-new',
        htmlUrl: 'https://github.com/acme/full-new',
        cloneUrl: 'https://github.com/acme/full-new.git',
      });
      vi.spyOn(githubRepo, 'pushRepositoryToGitHub').mockImplementation(() => {});
      vi.spyOn(githubRepo, 'scanKnownHosts').mockResolvedValue(
        '192.0.2.10 ssh-ed25519 AAAATEST'
      );
      vi.spyOn(githubRepo, 'setGitHubActionsSecrets').mockResolvedValue({
        set: ['SSH_HOST', 'SSH_USER', 'SSH_KNOWN_HOSTS', 'DB_PASSWORD'],
        failed: [],
      });
      vi.spyOn(githubRepo, 'readPrivateKeyForSecret').mockResolvedValue({
        warning: 'no se lee la clave en el test',
      });
      vi.spyOn(githubRepo, 'getAuthenticatedUser').mockResolvedValue({ login: 'acme' });

      const originalCwd = process.cwd();
      process.chdir(TEST_DIR);

      await newCommand('full-new', {
        topology: 'monolith',
        nonInteractive: true,
        serverIp: '192.0.2.10',
        sshKeyPath: '/tmp/id_test',
        domain: 'full.example.com',
        email: 'ops@example.com',
        githubToken: 'ghp_test',
      });

      process.chdir(originalCwd);

      expect(githubRepo.createGitHubRepository).toHaveBeenCalled();
      expect(githubRepo.setGitHubActionsSecrets).toHaveBeenCalledWith(
        'ghp_test',
        expect.objectContaining({ name: 'full-new' }),
        expect.arrayContaining([
          expect.objectContaining({ name: 'SSH_KNOWN_HOSTS', value: '192.0.2.10 ssh-ed25519 AAAATEST' }),
          expect.objectContaining({ name: 'DB_PASSWORD' }),
        ])
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Proyecto creado exitosamente')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('fractal deploy')
      );
    });
  });
});
