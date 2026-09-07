/**
 * Tipos del runtime de Docker Compose.
 * Framework-agnostic según Artículo II de CONSTITUTION.md.
 */

/**
 * Tipo de target desplegable.
 * Determina qué contenedores se generan en docker-compose.yml.
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
 */
export interface ComposeConfig {
  /** Tipo de target a desplegar */
  targetType: TargetType;
  
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
 * Configuración por defecto según SPEC-0003 AC-4.
 * Set de contenedores hardcodeado hasta que SPEC-0006 esté resuelto.
 */
export const BACKEND_FULL_SERVICES = [
  'app',
  'nginx', 
  'db',
  'redis',
  'worker',
  'scheduler'
] as const;

export const FRONTEND_STATIC_SERVICES = [
  'nginx'
] as const;
