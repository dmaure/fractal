import type { ProjectTopology } from './topology.js';

/**
 * Opciones del comando `fractal new`.
 */
export interface NewCommandOptions {
  /** Topología del proyecto */
  topology?: ProjectTopology;
  
  /** Fuerza la generación sobre un directorio no vacío */
  force?: boolean;
}

/**
 * Parámetros validados para la generación de un proyecto.
 */
export interface ValidatedNewParams {
  /** Nombre del proyecto */
  projectName: string;
  
  /** Directorio destino absoluto */
  targetDir: string;
  
  /** Topología del proyecto */
  topology: ProjectTopology;
  
  /** Framework destino (único adapter disponible en v1) */
  target: string;
}
