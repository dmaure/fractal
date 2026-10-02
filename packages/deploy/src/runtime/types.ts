/**
 * Tipos del runtime de Docker Compose.
 * Framework-agnostic según Artículo II de CONSTITUTION.md.
 */

import type { DeployRuntime } from '@fractal/core';

/**
 * @deprecated Reemplazado por DeployRuntime del adapter contract (SPEC-0006 T2).
 * Se mantiene temporalmente para compatibilidad hacia atrás, pero no debe usarse
 * en código nuevo. Usar DeployRuntime del contrato del adapter en su lugar.
 */
export type TargetType = 
  | 'backend-full'  // Backend completo: app, nginx, db, redis, worker, scheduler
  | 'frontend-static'; // Frontend estático: solo nginx

/**
 * Configuración para instalación de Docker.
 */
export interface DockerInstallConfig {
  /** Si debe verificar prerequisites antes de instalar */
  checkPrerequisites?: boolean;
}

/**
 * Resultado de instalación de Docker.
 */
export interface DockerInstallResult {
  /** Indica si la instalación fue exitosa */
  success: boolean;
  
  /** Mensajes de los pasos completados */
  steps: string[];
  
  /** Mensaje de error en caso de fallo */
  error?: string;
  
  /** Versión de Docker instalada */
  dockerVersion?: string;
  
  /** Versión del plugin Compose instalada */
  composeVersion?: string;
}

/**
 * Configuración para generación de docker-compose.yml.
 * Consume la declaración de runtime del adapter contract (SPEC-0006 AC-3).
 */
export interface ComposeConfig {
  /** Declaración de runtime desde el adapter contract */
  runtime: DeployRuntime;
  
  /** Nombre del proyecto (usado para namespacing de contenedores) */
  projectName: string;
  
  /** Path donde se generará el docker-compose.yml */
  outputPath: string;
}

/**
 * Resultado de generación de docker-compose.yml.
 */
export interface ComposeGenerationResult {
  /** Indica si la generación fue exitosa */
  success: boolean;
  
  /** Path del archivo generado */
  filePath?: string;
  
  /** Lista de servicios generados */
  services?: string[];
  
  /** Contenido del archivo generado */
  content?: string;
  
  /** Mensaje de error en caso de fallo */
  error?: string;
}

/**
 * Configuración completa del runtime.
 */
export interface RuntimeConfig {
  /** Configuración de instalación de Docker */
  dockerInstall?: DockerInstallConfig;
  
  /** Configuración de docker-compose */
  compose: ComposeConfig;
}

/**
 * Resultado completo del setup del runtime.
 */
export interface RuntimeSetupResult {
  /** Indica si el setup fue exitoso */
  success: boolean;
  
  /** Resultado de instalación de Docker */
  dockerInstall: DockerInstallResult;
  
  /** Resultado de generación de compose */
  composeGeneration?: ComposeGenerationResult;
  
  /** Mensaje de error general en caso de fallo */
  error?: string;
}

/**
 * @deprecated Reemplazado por DeployRuntime.services del adapter contract (SPEC-0006 T2).
 * Ya no se usan constantes hardcodeadas; los servicios se leen desde la declaración
 * de runtime del adapter. Se mantienen temporalmente para compatibilidad hacia atrás.
 */
export const BACKEND_FULL_SERVICES = [
  'app',
  'nginx', 
  'db',
  'redis',
  'worker',
  'scheduler'
] as const;

/**
 * @deprecated Reemplazado por DeployRuntime.services del adapter contract (SPEC-0006 T2).
 */
export const FRONTEND_STATIC_SERVICES = [
  'nginx'
] as const;
