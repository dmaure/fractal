/**
 * Resultado de validación del servidor.
 */
export interface ServerValidationResult {
  /** Indica si el servidor cumple todos los requisitos */
  valid: boolean;
  
  /** Lista de errores encontrados */
  errors: string[];
  
  /** Lista de advertencias no bloqueantes */
  warnings: string[];
  
  /** Información del servidor detectada */
  serverInfo?: ServerInfo;
}

/**
 * Información detectada del servidor.
 */
export interface ServerInfo {
  /** Sistema operativo */
  os: string;
  
  /** Versión del sistema operativo */
  osVersion: string;
  
  /** Número de CPUs virtuales */
  cpuCount: number;
  
  /** Memoria RAM total en GB */
  ramGb: number;
  
  /** Espacio en disco disponible en GB */
  diskAvailableGb: number;
  
  /** Espacio en disco total en GB */
  diskTotalGb: number;
}

/**
 * Requisitos mínimos del servidor.
 */
export interface ServerRequirements {
  /** CPUs mínimas */
  minCpu: number;
  
  /** RAM mínima en GB */
  minRamGb: number;
  
  /** Disco mínimo disponible en GB */
  minDiskGb: number;
  
  /** Distribuciones soportadas (regex patterns) */
  supportedDistros: string[];
}

/**
 * Requisitos por defecto según SPEC-0003 AC-2.
 */
export const DEFAULT_REQUIREMENTS: ServerRequirements = {
  minCpu: 1,
  minRamGb: 2,
  minDiskGb: 20,
  supportedDistros: [
    'Ubuntu 22.04',
    'Ubuntu 24.04',
  ],
};
