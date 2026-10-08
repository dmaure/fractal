/**
 * Resolución de adapters disponibles por convención de nombre de paquete.
 * 
 * El core descubre adapters instalados sin conocer frameworks específicos (Artículo II).
 * Busca paquetes con el patrón @fractal/adapter-* que declaren metadata 'fractal'
 * en su package.json.
 * 
 * @see docs/specs/0006-contrato-adapter-v0.md
 * @see docs/adr/0002-arquitectura-multi-target.md
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Metadata del adapter declarada en su package.json.
 */
export interface AdapterMetadata {
  /**
   * Indica que el paquete es un adapter de Fractal.
   */
  adapter: boolean;
  
  /**
   * Identificador del framework/target (e.g., "framework-a", "framework-b").
   */
  target: string;
  
  /**
   * Path relativo al entry point del bridge desde la raíz del paquete.
   */
  bridge: string;
}

/**
 * Información de un adapter resuelto.
 */
export interface ResolvedAdapter {
  /**
   * Nombre del paquete npm (e.g., "@fractal/adapter-example").
   */
  packageName: string;
  
  /**
   * Identificador del framework/target.
   */
  target: string;
  
  /**
   * Path absoluto al directorio del paquete.
   */
  packagePath: string;
  
  /**
   * Path absoluto al entry point del bridge.
   */
  bridgeEntryPath: string;
  
  /**
   * Comando para invocar el bridge: [process.execPath, bridgeEntryPath].
   */
  command: string[];
}

/**
 * Resultado de la resolución de adapters.
 */
export interface AdapterResolutionResult {
  /**
   * Lista de adapters encontrados y válidos.
   */
  adapters: ResolvedAdapter[];
  
  /**
   * Mensaje de error si la resolución falló completamente.
   */
  error?: string;
}

/**
 * Busca el directorio que contiene los paquetes @fractal/*.
 * 
 * Sube desde la ubicación del CLI (packages/core) buscando:
 * 1. node_modules/@fractal/ (instalación normal)
 * 2. packages/ (desarrollo en workspace)
 */
function findFractalPackagesDirectory(startPath: string): string | null {
  let currentPath = startPath;
  
  // Subir hasta encontrar node_modules/@fractal, packages/, o llegar a la raíz
  for (let i = 0; i < 10; i++) {
    // Intentar node_modules/@fractal primero (instalación normal)
    const nodeModulesPath = join(currentPath, 'node_modules', '@fractal');
    if (existsSync(nodeModulesPath)) {
      // Verificar que tenga al menos un adapter antes de retornar
      try {
        const entries = readdirSync(nodeModulesPath);
        const hasAdapters = entries.some(e => e.startsWith('adapter-'));
        if (hasAdapters) {
          return nodeModulesPath;
        }
        // Si no tiene adapters, continuar buscando
      } catch {
        // Error al leer, continuar buscando
      }
    }
    
    // Intentar packages/ (desarrollo en workspace)
    const packagesPath = join(currentPath, 'packages');
    if (existsSync(packagesPath)) {
      // Verificar que sea realmente un workspace válido buscando adapter-*
      try {
        const entries = readdirSync(packagesPath);
        const hasAdapters = entries.some(e => e.startsWith('adapter-'));
        if (hasAdapters) {
          return packagesPath;
        }
      } catch {
        // Ignorar errores de lectura y continuar subiendo
      }
    }
    
    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) {
      // Llegamos a la raíz del sistema de archivos
      break;
    }
    currentPath = parentPath;
  }
  
  return null;
}

/**
 * Lee y valida la metadata 'fractal' de un package.json.
 */
function readAdapterMetadata(packageJsonPath: string): AdapterMetadata | null {
  try {
    const content = readFileSync(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(content) as Record<string, unknown>;
    
    // Verificar que tenga metadata 'fractal'
    if (!packageJson.fractal || typeof packageJson.fractal !== 'object') {
      return null;
    }
    
    const fractalMeta = packageJson.fractal as Record<string, unknown>;
    
    // Validar estructura de la metadata
    if (
      fractalMeta.adapter !== true ||
      typeof fractalMeta.target !== 'string' ||
      typeof fractalMeta.bridge !== 'string'
    ) {
      return null;
    }
    
    return {
      adapter: true,
      target: fractalMeta.target,
      bridge: fractalMeta.bridge,
    };
  } catch {
    return null;
  }
}

/**
 * Resuelve todos los adapters disponibles.
 * 
 * Busca paquetes con el patrón @fractal/adapter-* que declaren metadata 'fractal'
 * válida en su package.json. Los paquetes sin metadata se ignoran silenciosamente.
 * 
 * @param cliPath - Path del CLI actual (usado como punto de partida para buscar node_modules)
 * @returns Resultado con lista de adapters encontrados o mensaje de error
 * 
 * @example
 * const result = resolveAdapters(__dirname);
 * if (result.adapters.length === 0) {
 *   console.error('No se encontró ningún adapter');
 * }
 */
export function resolveAdapters(cliPath: string): AdapterResolutionResult {
  // Buscar el directorio @fractal
  const fractalDir = findFractalPackagesDirectory(cliPath);
  
  if (!fractalDir) {
    return {
      adapters: [],
      error: 'No se pudo localizar el directorio de paquetes @fractal',
    };
  }
  
  // Listar paquetes en el directorio (puede ser @fractal o packages)
  let entries: string[];
  try {
    entries = readdirSync(fractalDir);
  } catch (error) {
    return {
      adapters: [],
      error: `Error al leer el directorio de adapters: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  
  // Filtrar solo directorios adapter-*
  const adapterPackages = entries.filter(entry => {
    if (!entry.startsWith('adapter-')) return false;
    const fullPath = join(fractalDir, entry);
    try {
      return statSync(fullPath).isDirectory();
    } catch {
      return false;
    }
  });
  
  // Resolver cada adapter
  const adapters: ResolvedAdapter[] = [];
  
  for (const pkg of adapterPackages) {
    const packagePath = join(fractalDir, pkg);
    const packageJsonPath = join(packagePath, 'package.json');
    
    if (!existsSync(packageJsonPath)) {
      continue;
    }
    
    const metadata = readAdapterMetadata(packageJsonPath);
    
    // Ignorar paquetes sin metadata válida
    if (!metadata) {
      continue;
    }
    
    // Resolver path absoluto al bridge entry
    const bridgeEntryPath = resolve(packagePath, metadata.bridge);
    
    if (!existsSync(bridgeEntryPath)) {
      // Bridge entry no existe, ignorar este adapter
      continue;
    }
    
    adapters.push({
      packageName: `@fractal/${pkg}`,
      target: metadata.target,
      packagePath,
      bridgeEntryPath,
      command: [process.execPath, bridgeEntryPath],
    });
  }
  
  return {
    adapters,
  };
}

/**
 * Resuelve un adapter único, fallando si no hay exactamente uno disponible.
 * 
 * Si hay un único adapter disponible, se usa sin preguntar (SPEC-0001 AC-1).
 * Si hay múltiples adapters, esta función falla (el prompt de selección es M4).
 * 
 * @param cliPath - Path del CLI actual
 * @returns Adapter resuelto
 * @throws Error si no hay adapters o hay múltiples
 */
export function resolveSingleAdapter(cliPath: string): ResolvedAdapter {
  const result = resolveAdapters(cliPath);
  
  if (result.error) {
    throw new Error(result.error);
  }
  
  if (result.adapters.length === 0) {
    throw new Error(
      'No se encontró ningún adapter instalado. ' +
      'Asegúrate de que haya un paquete @fractal/adapter-* con metadata válida en su package.json.'
    );
  }
  
  if (result.adapters.length > 1) {
    const targets = result.adapters.map(a => a.target).join(', ');
    throw new Error(
      `Se encontraron múltiples adapters (${targets}). ` +
      'La selección interactiva de adapter se implementará en M4. ' +
      'Por ahora, solo debe haber un adapter instalado.'
    );
  }
  
  return result.adapters[0];
}
