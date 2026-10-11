/**
 * Tipos para generación de CI/CD.
 * Framework-agnostic según Artículo II de CONSTITUTION.md.
 */

import type { DeployRuntime } from '@fractal/core';
import type { TargetType } from '../runtime/types.js';

/**
 * Proveedor de CI/CD soportado.
 */
export type CicdProvider = 'github-actions' | 'gitlab-ci';

/**
 * Re-export TargetType from runtime for convenience.
 */
export type { TargetType };

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
  
  /** Tipo de target. Usado para lógica no-comando (secrets, validación). */
  targetType: TargetType;

  /**
   * Runtime de deploy declarado por el contrato del adapter (SPEC-0006 AC-3).
   * Los comandos del workflow (build, migración, post-deploy, healthcheck) se
   * derivan de este runtime en vez de hardcodearse (FRA-51).
   */
  runtime: DeployRuntime;

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
 * NOTA: Estos comandos se derivan del DeployRuntime del contrato del adapter
 * (SPEC-0006, FRA-51) — ya no se hardcodean en packages/deploy. El adapter
 * declara build/migración/post-deploy/healthcheck de forma agnóstica y los
 * generadores los emiten tal cual en el template del workflow.
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
