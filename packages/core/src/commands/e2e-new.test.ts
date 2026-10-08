/**
 * Tests E2E para el comando `fractal new`.
 * 
 * Estos tests ejecutan el flujo completo incluyendo:
 * - Resolución del adapter real
 * - Invocación del adapter vía bridge
 * - Generación de estructura del proyecto
 * - Inicialización de git
 * 
 * Usan stubs de php/composer para no depender de instalación real.
 * 
 * @see SPEC-0006 AC-2, AC-3, AC-5, AC-6
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Crea stubs de php y composer en un directorio temporal.
 * Retorna el path al directorio bin para agregar al PATH.
 */
function createFakeBinaries(binDir: string, phpVersion = '8.3.0', composerVersion = '2.7.0'): void {
  mkdirSync(binDir, { recursive: true });
  
  // Stub de php
  const phpScript = `#!/bin/bash
if [ "$1" = "--version" ] || [ "$1" = "-v" ]; then
  echo "PHP ${phpVersion} (cli) (built: Jan  1 2024 00:00:00) ( NTS )"
else
  echo "PHP stub - not a real PHP interpreter"
  exit 1
fi
`;
  writeFileSync(join(binDir, 'php'), phpScript, 'utf-8');
  chmodSync(join(binDir, 'php'), 0o755);
  
  // Stub de composer
  const composerScript = `#!/bin/bash
if [ "$1" = "--version" ] || [ "$1" = "-V" ]; then
  echo "Composer version ${composerVersion} 2024-01-01 00:00:00"
else
  echo "Composer stub - not a real Composer"
  exit 1
fi
`;
  writeFileSync(join(binDir, 'composer'), composerScript, 'utf-8');
  chmodSync(join(binDir, 'composer'), 0o755);
}

describe('fractal new E2E', () => {
  let testDir: string;
  let workspaceRoot: string;
  let binDir: string;
  let originalPath: string;
  let nodePath: string;
  
  beforeEach(() => {
    testDir = join(tmpdir(), `fractal-e2e-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    
    workspaceRoot = join(__dirname, '../../../../');
    
    // Detectar el path absoluto de node
    nodePath = process.execPath;
    
    // Crear directorio bin con stubs de php y composer
    binDir = join(testDir, 'bin');
    createFakeBinaries(binDir);
    
    // Guardar PATH original y agregar nuestro binDir al inicio
    originalPath = process.env.PATH || '';
    process.env.PATH = `${binDir}:${originalPath}`;
    
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
    
    // Restaurar PATH original
    process.env.PATH = originalPath;
    
    delete process.env.GIT_AUTHOR_NAME;
    delete process.env.GIT_AUTHOR_EMAIL;
    delete process.env.GIT_COMMITTER_NAME;
    delete process.env.GIT_COMMITTER_EMAIL;
  });
  
  it('genera proyecto monolito con estructura Laravel y commit inicial', { timeout: 60000 }, () => {
    const cliPath = join(workspaceRoot, 'packages/core/dist/cli.js');
    const projectName = 'test-monolith';
    const projectPath = join(testDir, projectName);
    
    execSync(
      `${nodePath} ${cliPath} new ${projectPath} --topology monolith`,
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
  
  it('genera proyecto monorepo con estructura Laravel + Vite', { timeout: 60000 }, () => {
    const cliPath = join(workspaceRoot, 'packages/core/dist/cli.js');
    const projectName = 'test-monorepo';
    const projectPath = join(testDir, projectName);
    
    execSync(
      `${nodePath} ${cliPath} new ${projectPath} --topology monorepo`,
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
  
  it('genera proyecto multirepo con dos repos separados y manifiestos', { timeout: 60000 }, () => {
    const cliPath = join(workspaceRoot, 'packages/core/dist/cli.js');
    const projectName = join(testDir, 'test-multirepo');
    
    execSync(
      `${nodePath} ${cliPath} new ${projectName} --topology multirepo`,
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
  
  describe('AC-3: verificación de versiones mínimas', () => {
    it('falla con versión de PHP insuficiente sin crear directorio', { timeout: 30000 }, () => {
      const cliPath = join(workspaceRoot, 'packages/core/dist/cli.js');
      const projectPath = join(testDir, 'test-version-php');
      
      // Crear stub de PHP con versión vieja
      const oldBinDir = join(testDir, 'old-bin');
      createFakeBinaries(oldBinDir, '7.4.0', '2.7.0');
      
      // Reemplazar PATH con versión vieja (manteniendo acceso a node)
      const savedPath = process.env.PATH;
      process.env.PATH = `${oldBinDir}:${originalPath}`;
      
      let error: any;
      try {
        execSync(
          `node ${cliPath} new ${projectPath} --topology monolith`,
          { cwd: workspaceRoot, stdio: 'pipe' }
        );
      } catch (e) {
        error = e;
      }
      
      // Restaurar PATH inmediatamente
      process.env.PATH = savedPath;
      
      // Verificar que falló
      expect(error).toBeDefined();
      expect(error.status).not.toBe(0);
      
      // Verificar que el mensaje incluye información de versión
      const output = error.stderr?.toString() || error.stdout?.toString() || '';
      expect(output).toContain('PHP');
      expect(output).toContain('7.4.0'); // versión instalada
      expect(output).toContain('8.2.0'); // versión mínima
      
      // Verificar que NO creó el directorio destino
      expect(existsSync(projectPath)).toBe(false);
    });
    
    it('falla con versión de Composer insuficiente sin crear directorio', { timeout: 30000 }, () => {
      const cliPath = join(workspaceRoot, 'packages/core/dist/cli.js');
      const projectPath = join(testDir, 'test-version-composer');
      
      // Crear stub de Composer con versión vieja
      const oldBinDir = join(testDir, 'old-bin-composer');
      createFakeBinaries(oldBinDir, '8.3.0', '1.10.0');
      
      // Reemplazar PATH con versión vieja (manteniendo acceso a node)
      const savedPath = process.env.PATH;
      process.env.PATH = `${oldBinDir}:${originalPath}`;
      
      let error: any;
      try {
        execSync(
          `${nodePath} ${cliPath} new ${projectPath} --topology monolith`,
          { cwd: workspaceRoot, stdio: 'pipe' }
        );
      } catch (e) {
        error = e;
      }
      
      // Restaurar PATH inmediatamente
      process.env.PATH = savedPath;
      
      // Verificar que falló
      expect(error).toBeDefined();
      expect(error.status).not.toBe(0);
      
      // Verificar que el mensaje incluye información de versión
      const output = error.stderr?.toString() || error.stdout?.toString() || '';
      expect(output).toContain('Composer');
      expect(output).toContain('1.10.0'); // versión instalada
      expect(output).toContain('2.5.0'); // versión mínima
      
      // Verificar que NO creó el directorio destino
      expect(existsSync(projectPath)).toBe(false);
    });
    
    it('falla cuando PHP no está instalado sin crear directorio', { timeout: 30000 }, () => {
      const cliPath = join(workspaceRoot, 'packages/core/dist/cli.js');
      const projectPath = join(testDir, 'test-no-php');
      
      // Crear un directorio bin vacío (sin php ni composer, pero manteniendo node)
      const emptyBinDir = join(testDir, 'empty-bin');
      mkdirSync(emptyBinDir, { recursive: true });
      
      // Reemplazar PATH con directorio vacío + acceso a node
      const savedPath = process.env.PATH;
      process.env.PATH = `${emptyBinDir}:${originalPath}`;
      
      let error: any;
      try {
        execSync(
          `${nodePath} ${cliPath} new ${projectPath} --topology monolith`,
          { cwd: workspaceRoot, stdio: 'pipe' }
        );
      } catch (e) {
        error = e;
      }
      
      // Restaurar PATH inmediatamente
      process.env.PATH = savedPath;
      
      // Verificar que falló
      expect(error).toBeDefined();
      expect(error.status).not.toBe(0);
      
      // Verificar que el mensaje indica que falta PHP
      const output = error.stderr?.toString() || error.stdout?.toString() || '';
      expect(output).toContain('PHP');
      expect(output).toContain('no encontrado');
      
      // Verificar que NO creó el directorio destino
      expect(existsSync(projectPath)).toBe(false);
    });
  });
});
