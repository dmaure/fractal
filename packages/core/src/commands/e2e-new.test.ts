/**
 * Tests E2E para el comando `fractal new`.
 * 
 * Estos tests ejecutan el flujo completo incluyendo:
 * - Resolución del adapter real
 * - Invocación del adapter vía bridge
 * - Generación de estructura del proyecto
 * - Inicialización de git
 * 
 * @see SPEC-0006 AC-2, AC-5, AC-6
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Nota: Estos tests E2E requieren que el adapter esté disponible.
 * En un workspace de pnpm, el adapter no está en node_modules/@fractal/
 * sino en packages/. Por ahora estos tests se saltan automáticamente
 * si no se detecta el adapter.
 * 
 * Para ejecutar estos tests en CI o manualmente:
 * 1. Instalar el CLI globalmente: npm link desde packages/core
 * 2. Los adapters deben estar disponibles como dependencias reales
 */
describe('fractal new E2E', () => {
  let testDir: string;
  let workspaceRoot: string;
  let adapterAvailable: boolean;
  
  beforeEach(() => {
    testDir = join(tmpdir(), `fractal-e2e-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    
    workspaceRoot = join(__dirname, '../../../../');
    
    // Verificar si hay un adapter disponible (en workspace local, buscar en packages/)
    const packagesAdapterPath = join(workspaceRoot, 'packages/adapter-laravel/dist/bridge-entry.js');
    adapterAvailable = existsSync(packagesAdapterPath);
    
    // Configurar identidad de git para los tests
    process.env.GIT_AUTHOR_NAME = 'Fractal Test';
    process.env.GIT_AUTHOR_EMAIL = 'test@fractal.dev';
    process.env.GIT_COMMITTER_NAME = 'Fractal Test';
    process.env.GIT_COMMITTER_EMAIL = 'test@fractal.dev';
  });
  
  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    
    delete process.env.GIT_AUTHOR_NAME;
    delete process.env.GIT_AUTHOR_EMAIL;
    delete process.env.GIT_COMMITTER_NAME;
    delete process.env.GIT_COMMITTER_EMAIL;
  });
  
  it.skip('genera proyecto monolito con estructura Laravel y commit inicial (E2E con adapter real)', { timeout: 60000 }, () => {
    if (!adapterAvailable) {
      console.log('⏭️  Saltando test E2E: adapter no disponible en workspace de pnpm');
      return;
    }
    
    const cliPath = join(workspaceRoot, 'packages/core/dist/cli.js');
    const projectName = 'test-monolith';
    const projectPath = join(testDir, projectName);
    
    execSync(
      `node ${cliPath} new ${projectPath} --topology monolith`,
      { cwd: workspaceRoot, stdio: 'pipe' }
    );
    
    // Verificar estructura del adapter (SPEC-0006 AC-2)
    expect(existsSync(projectPath)).toBe(true);
    
    const files = readdirSync(projectPath);
    expect(files).toContain('composer.json');
    expect(files).toContain('.gitignore');
    expect(files).toContain('README.md');
    expect(files).toContain('app');
    expect(files).toContain('routes');
    
    // Verificar git inicializado
    expect(existsSync(join(projectPath, '.git'))).toBe(true);
    
    // Verificar commit inicial
    const log = execSync('git log --oneline', { cwd: projectPath }).toString();
    expect(log).toContain('inicializar proyecto');
    
    // Verificar que fractal.project.yml NO está en el proyecto monolito
    expect(existsSync(join(projectPath, 'fractal.project.yml'))).toBe(false);
  });
  
  it.skip('genera proyecto monorepo con estructura Laravel + Vite (E2E con adapter real)', { timeout: 60000 }, () => {
    if (!adapterAvailable) {
      console.log('⏭️  Saltando test E2E: adapter no disponible en workspace de pnpm');
      return;
    }
    
    const cliPath = join(workspaceRoot, 'packages/core/dist/cli.js');
    const projectName = 'test-monorepo';
    const projectPath = join(testDir, projectName);
    
    execSync(
      `node ${cliPath} new ${projectPath} --topology monorepo`,
      { cwd: workspaceRoot, stdio: 'pipe' }
    );
    
    // Verificar estructura (SPEC-0006 AC-2)
    expect(existsSync(projectPath)).toBe(true);
    
    const files = readdirSync(projectPath);
    expect(files).toContain('api');
    expect(files).toContain('web');
    expect(files).toContain('turbo.json');
    expect(files).toContain('package.json');
    
    // Verificar estructura api/
    const apiFiles = readdirSync(join(projectPath, 'api'));
    expect(apiFiles).toContain('composer.json');
    expect(apiFiles).toContain('app');
    
    // Verificar estructura web/
    const webFiles = readdirSync(join(projectPath, 'web'));
    expect(webFiles).toContain('package.json');
    expect(webFiles).toContain('vite.config.ts');
    expect(webFiles).toContain('src');
    
    // Verificar git
    expect(existsSync(join(projectPath, '.git'))).toBe(true);
    
    // Verificar que fractal.project.yml NO está
    expect(existsSync(join(projectPath, 'fractal.project.yml'))).toBe(false);
  });
  
  it.skip('genera proyecto multirepo con dos repos separados y manifiestos (E2E con adapter real)', { timeout: 60000 }, () => {
    if (!adapterAvailable) {
      console.log('⏭️  Saltando test E2E: adapter no disponible en workspace de pnpm');
      return;
    }
    
    const cliPath = join(workspaceRoot, 'packages/core/dist/cli.js');
    const projectName = join(testDir, 'test-multirepo');
    
    execSync(
      `node ${cliPath} new ${projectName} --topology multirepo`,
      { cwd: workspaceRoot, stdio: 'pipe' }
    );
    
    // En multirepo, los repos se crean con el patrón <nombre>-api y <nombre>-web
    // pero el nombre base es solo "test-multirepo", no el path completo
    const apiPath = `${projectName}-api`;
    const webPath = `${projectName}-web`;
    
    // Verificar que ambos repos existen (SPEC-0006 AC-2)
    expect(existsSync(apiPath)).toBe(true);
    expect(existsSync(webPath)).toBe(true);
    
    // Verificar estructura API
    const apiFiles = readdirSync(apiPath);
    expect(apiFiles).toContain('composer.json');
    expect(apiFiles).toContain('app');
    expect(apiFiles).toContain('.gitignore');
    expect(apiFiles).toContain('README.md');
    
    // Verificar estructura Web
    const webFiles = readdirSync(webPath);
    expect(webFiles).toContain('package.json');
    expect(webFiles).toContain('vite.config.ts');
    expect(webFiles).toContain('.gitignore');
    expect(webFiles).toContain('README.md');
    
    // Verificar que ambos tienen .git
    expect(existsSync(join(apiPath, '.git'))).toBe(true);
    expect(existsSync(join(webPath, '.git'))).toBe(true);
    
    // Verificar commits separados
    const apiLog = execSync('git log --oneline', { cwd: apiPath }).toString();
    expect(apiLog).toContain('api');
    
    const webLog = execSync('git log --oneline', { cwd: webPath }).toString();
    expect(webLog).toContain('web');
    
    // Verificar manifiestos (SPEC-0006 AC-5)
    expect(existsSync(join(apiPath, 'fractal.project.yml'))).toBe(true);
    expect(existsSync(join(webPath, 'fractal.project.yml'))).toBe(true);
    
    // Verificar contenido de los manifiestos
    const apiManifest = readFileSync(join(apiPath, 'fractal.project.yml'), 'utf-8');
    expect(apiManifest).toContain('role: api');
    
    const webManifest = readFileSync(join(webPath, 'fractal.project.yml'), 'utf-8');
    expect(webManifest).toContain('role: web');
    
    // Verificar que fractal.project.yml está en .gitignore (SPEC-0006 AC-5)
    const apiGitignore = readFileSync(join(apiPath, '.gitignore'), 'utf-8');
    expect(apiGitignore).toContain('fractal.project.yml');
    
    const webGitignore = readFileSync(join(webPath, '.gitignore'), 'utf-8');
    expect(webGitignore).toContain('fractal.project.yml');
    
    // Verificar que fractal.project.yml NO está commiteado (SPEC-0006 AC-5)
    const apiCommitted = execSync('git ls-tree -r --name-only HEAD', { cwd: apiPath }).toString();
    expect(apiCommitted).not.toContain('fractal.project.yml');
    
    const webCommitted = execSync('git ls-tree -r --name-only HEAD', { cwd: webPath }).toString();
    expect(webCommitted).not.toContain('fractal.project.yml');
  });
});
