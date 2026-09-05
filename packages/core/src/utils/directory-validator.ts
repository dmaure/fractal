import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export interface DirectoryValidationResult {
  exists: boolean;
  isEmpty: boolean;
  isEmptyGitRepo: boolean;
  canProceed: boolean;
  reason?: string;
}

/**
 * Valida si el directorio destino puede usarse para generar un proyecto.
 * 
 * Reglas:
 * - Si no existe: OK
 * - Si existe y está vacío: OK
 * - Si existe y solo contiene .git sin historia: OK
 * - Si existe y no está vacío: requiere --force
 */
export function validateTargetDirectory(
  targetDir: string,
  force: boolean = false
): DirectoryValidationResult {
  const absolutePath = resolve(targetDir);
  
  if (!existsSync(absolutePath)) {
    return {
      exists: false,
      isEmpty: true,
      isEmptyGitRepo: false,
      canProceed: true,
    };
  }
  
  const stat = statSync(absolutePath);
  if (!stat.isDirectory()) {
    return {
      exists: true,
      isEmpty: false,
      isEmptyGitRepo: false,
      canProceed: false,
      reason: 'La ruta especificada existe pero no es un directorio',
    };
  }
  
  const entries = readdirSync(absolutePath);
  
  if (entries.length === 0) {
    return {
      exists: true,
      isEmpty: true,
      isEmptyGitRepo: false,
      canProceed: true,
    };
  }
  
  const isOnlyGit = entries.length === 1 && entries[0] === '.git';
  if (isOnlyGit) {
    const isEmptyGitRepo = checkIfEmptyGitRepo(resolve(absolutePath, '.git'));
    if (isEmptyGitRepo) {
      return {
        exists: true,
        isEmpty: false,
        isEmptyGitRepo: true,
        canProceed: true,
      };
    }
  }
  
  if (force) {
    return {
      exists: true,
      isEmpty: false,
      isEmptyGitRepo: false,
      canProceed: true,
      reason: 'Forzando generación con --force',
    };
  }
  
  return {
    exists: true,
    isEmpty: false,
    isEmptyGitRepo: false,
    canProceed: false,
    reason: `El directorio '${targetDir}' no está vacío. Usa --force para proceder de todas formas.`,
  };
}

/**
 * Verifica si un directorio .git no tiene historia (repo recién clonado vacío).
 */
function checkIfEmptyGitRepo(gitDir: string): boolean {
  try {
    const headsPath = resolve(gitDir, 'refs', 'heads');
    if (!existsSync(headsPath)) {
      return true;
    }
    
    const heads = readdirSync(headsPath);
    return heads.length === 0;
  } catch {
    return false;
  }
}
