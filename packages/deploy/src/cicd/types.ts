/**
 * Tipos para generación de CI/CD.
 * Framework-agnostic según Artículo II de CONSTITUTION.md.
 */

/**
 * Proveedor de CI/CD soportado.
 */
export type CicdProvider = 'github-actions' | 'gitlab-ci';

/**
 * Tipo de target desplegable.
 * Determina los comandos de build, migración y cache.
 */
export type TargetType = 
  | 'backend-full'
  | 'frontend-static';

/**
 * Configuración de un secret requerido.
 */
export interface SecretConfig {
  /** Nombre del secret en el proveedor de CI/CD */
  name: string;
  
  /** Descripción del secret */
  description: string;
  
  /** Si es un secret cruzado para multirepo (ADR-0012) */
  crossRepo?: boolean;
  
  /** Repo hermano que debe cargar este secret (solo para crossRepo) */
  targetRepo?: string;
}

/**
 * Configuración de deploy.
 */
export interface DeployConfig {
  /** Proveedor de CI/CD */
  provider: CicdProvider;
  
  /** Tipo de target */
  targetType: TargetType;
  
  /** Nombre del proyecto */
  projectName: string;
  
  /** Rama de producción que dispara el deploy */
  productionBranch: string;
  
  /** Dominio donde estará desplegado */
  domain: string;
  
  /** Path donde se generará el workflow */
  outputPath: string;
  
  /** Configuración de multirepo (opcional) */
  multiRepo?: {
    /** Rol de este repo (api o web) */
    role: 'api' | 'web';
    
    /** URL git del repo hermano */
    siblingGitUrl?: string;
    
    /** Dominio del repo hermano */
    siblingDomain?: string;
  };
}

/**
 * Resultado de generación de workflow.
 */
export interface WorkflowGenerationResult {
  /** Indica si la generación fue exitosa */
  success: boolean;
  
  /** Path del archivo generado */
  filePath?: string;
  
  /** Contenido YAML del workflow generado */
  content?: string;
  
  /** Secrets requeridos para este repo */
  secrets: SecretConfig[];
  
  /** Secrets que deben cargarse en el repo hermano (multirepo) */
  crossRepoSecrets?: SecretConfig[];
  
  /** Mensaje de error en caso de fallo */
  error?: string;
}

/**
 * Comandos de deploy.
 * NOTA: Los valores concretos se generan inline en los workflows como parte del
 * template. Cuando SPEC-0006 (contrato del adapter) se implemente, estos comandos
 * serán declarados por los adapters y consultados dinámicamente.
 */
export interface DeployCommands {
  /** Comando de build de dependencias */
  build: string;
  
  /** Comando de migración de schema */
  migrate: string;
  
  /** Comandos de limpieza de cache */
  cacheClear: string[];
  
  /** Ruta del healthcheck */
  healthcheckPath: string;
}
