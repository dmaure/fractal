/**
 * Tipos para el sistema de estado del servidor.
 * Framework-agnostic según Artículo II de CONSTITUTION.md.
 */

/**
 * Estado de un paso de provisioning.
 */
export type StepState = 'pending' | 'completed' | 'failed';

/**
 * Estado guardado de cada paso del provisioning.
 */
export interface ProvisioningStepState {
  /** Estado actual del paso */
  state: StepState;
  
  /** Timestamp de última ejecución */
  lastRun?: string;
  
  /** Hash de la configuración con la que se ejecutó (para detectar cambios) */
  configHash?: string;
  
  /** Mensaje o detalles adicionales */
  message?: string;
}

/**
 * Historial de un deploy exitoso.
 */
export interface DeployHistoryEntry {
  /** Tag de la imagen desplegada */
  imageTag: string;
  
  /** Timestamp del deploy */
  timestamp: string;
  
  /** Resultado del healthcheck */
  healthcheck: 'passed' | 'failed';
  
  /** Commit SHA (si está disponible) */
  commitSha?: string;
  
  /** Branch desde el que se desplegó */
  branch?: string;
}

/**
 * Estado completo del servidor.
 */
export interface ServerState {
  /** Versión del formato de estado */
  version: string;
  
  /** Timestamp de creación del estado */
  createdAt: string;
  
  /** Última actualización */
  updatedAt: string;
  
  /** Estado de los pasos de provisioning */
  provisioning: {
    hardening?: ProvisioningStepState;
    runtime?: ProvisioningStepState;
    dns?: ProvisioningStepState;
    ssl?: ProvisioningStepState;
  };
  
  /** Historial de deploys (máximo 10 entradas, las más recientes) */
  deployHistory: DeployHistoryEntry[];
  
  /** Tag de la imagen actualmente desplegada */
  currentImageTag?: string;
  
  /** Tag de la última imagen desplegada exitosamente */
  lastSuccessfulImageTag?: string;
}

/**
 * Configuración del sistema de estado.
 */
export interface StateConfig {
  /** Path donde se guarda el estado (default: /etc/fractal/state.json) */
  statePath?: string;
}

/**
 * Resultado de operación de estado.
 */
export interface StateOperationResult {
  /** Indica si la operación fue exitosa */
  success: boolean;
  
  /** Mensaje de error en caso de fallo */
  error?: string;
}
