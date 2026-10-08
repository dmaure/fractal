import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import type { ProjectTopology } from '../types/topology.js';
import { generateManifest } from './manifest-generator.js';

export interface GitInitResult {
  success: boolean;
  repositories: string[];
  error?: string;
}

/**
 * Inicializa repositorio(s) git según la topología del proyecto.
 * 
 * - Monolito / monorepo desacoplado: un único repo con commit inicial
 * - Multirepo: dos repos separados (api/ y web/), cada uno con su commit inicial
 * 
 * Regla de solapamiento con el adapter (FRA-54):
 * - El adapter es dueño de README.md y .gitignore: no se pisan si ya existen
 * - El core es dueño de fractal.project.yml (multirepo): se garantiza que esté en .gitignore
 * - El commit inicial incluye los archivos del adapter, nunca fractal.project.yml
 */
export function initializeGit(
  projectName: string,
  targetDir: string,
  topology: ProjectTopology
): GitInitResult {
  try {
    switch (topology) {
      case 'monolith':
      case 'monorepo':
        return initSingleRepository(targetDir, topology);
      
      case 'multirepo':
        return initMultipleRepositories(projectName, targetDir);
      
      default:
        throw new Error(`Topología desconocida: ${topology}`);
    }
  } catch (error) {
    return {
      success: false,
      repositories: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Inicializa un único repositorio git (monolito o monorepo desacoplado).
 */
function initSingleRepository(targetDir: string, topology: ProjectTopology): GitInitResult {
  // Crear directorio si no existe
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  // Inicializar git
  execSync('git init', { cwd: targetDir, stdio: 'pipe' });
  
  // Crear .gitignore solo si no existe (el adapter es el dueño)
  const gitignorePath = join(targetDir, '.gitignore');
  if (!existsSync(gitignorePath)) {
    const gitignoreContent = topology === 'monorepo' 
      ? `node_modules/\n.env\n.DS_Store\n`
      : `.env\n.DS_Store\n`;
    
    writeFileSync(gitignorePath, gitignoreContent, 'utf-8');
  }
  
  // Crear README solo si no existe (el adapter es el dueño)
  const readmePath = join(targetDir, 'README.md');
  if (!existsSync(readmePath)) {
    const readmeContent = `# Proyecto generado con Fractal\n\nTopología: ${topology}\n`;
    writeFileSync(readmePath, readmeContent, 'utf-8');
  }
  
  // Commit inicial
  execSync('git add .', { cwd: targetDir, stdio: 'pipe' });
  execSync('git commit -m "feat: inicializar proyecto con topología ' + topology + '"', {
    cwd: targetDir,
    stdio: 'pipe',
  });
  
  return {
    success: true,
    repositories: [targetDir],
  };
}

/**
 * Inicializa dos repositorios git separados (multirepo).
 * 
 * En multirepo, targetDir es un directorio que no debería existir,
 * y en su lugar creamos dos directorios hermanos: ${projectName}-api y ${projectName}-web
 * en el directorio padre de targetDir.
 */
function initMultipleRepositories(projectName: string, targetDir: string): GitInitResult {
  // Para multirepo, los repos se crean en el directorio padre de targetDir
  const parentDir = join(targetDir, '..');
  const apiDir = join(parentDir, `${projectName}-api`);
  const webDir = join(parentDir, `${projectName}-web`);
  
  const repositories: string[] = [];
  
  // Crear directorios
  for (const dir of [apiDir, webDir]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
  
  // Inicializar repo API
  initRepositoryWithManifest(apiDir, 'api', projectName);
  repositories.push(apiDir);
  
  // Inicializar repo Web
  initRepositoryWithManifest(webDir, 'web', projectName);
  repositories.push(webDir);
  
  return {
    success: true,
    repositories,
  };
}

/**
 * Inicializa un repositorio individual en topología multirepo,
 * incluyendo el manifiesto fractal.project.yml.
 */
function initRepositoryWithManifest(
  repoDir: string,
  role: 'api' | 'web',
  projectName: string
): void {
  // Inicializar git
  execSync('git init', { cwd: repoDir, stdio: 'pipe' });
  
  // Garantizar que .gitignore contenga fractal.project.yml
  const gitignorePath = join(repoDir, '.gitignore');
  if (existsSync(gitignorePath)) {
    // .gitignore ya existe (creado por el adapter), añadir fractal.project.yml si no está
    let gitignoreContent = readFileSync(gitignorePath, 'utf-8');
    
    if (!gitignoreContent.includes('fractal.project.yml')) {
      if (!gitignoreContent.endsWith('\n')) {
        gitignoreContent += '\n';
      }
      gitignoreContent += 'fractal.project.yml\n';
      writeFileSync(gitignorePath, gitignoreContent, 'utf-8');
    }
  } else {
    // .gitignore no existe, crearlo con contenido mínimo
    const gitignoreContent = `node_modules/\n.env\n.DS_Store\nfractal.project.yml\n`;
    writeFileSync(gitignorePath, gitignoreContent, 'utf-8');
  }
  
  // Crear README solo si no existe (el adapter es el dueño)
  const readmePath = join(repoDir, 'README.md');
  if (!existsSync(readmePath)) {
    const readmeContent = `# ${projectName} (${role})\n\nProyecto generado con Fractal — topología multirepo\n`;
    writeFileSync(readmePath, readmeContent, 'utf-8');
  }
  
  // Commit inicial (sin el manifiesto, que está en .gitignore)
  execSync('git add .', { cwd: repoDir, stdio: 'pipe' });
  execSync(`git commit -m "feat: inicializar repositorio ${role} para ${projectName}"`, {
    cwd: repoDir,
    stdio: 'pipe',
  });
  
  // Generar manifiesto DESPUÉS del commit inicial
  // El manifiesto no se commitea porque está en .gitignore
  generateManifest(repoDir, role);
}
