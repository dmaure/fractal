/**
 * Información de deploy.
 */
export interface DeployInfo {
  imageTag: string;
  commitSha?: string;
  timestamp: string;
}

/**
 * Resultado de healthcheck.
 */
export interface HealthcheckResult {
  success: boolean;
  error?: string;
  responseTime?: number;
  statusCode?: number;
}

/**
 * Resultado de operación de rollback.
 */
export interface RollbackResult {
  success: boolean;
  error?: string;
  rolledBackTo?: string;
}

/**
 * Resultado de deploy con rollback.
 */
export interface DeployWithRollbackResult {
  success: boolean;
  error?: string;
  deployed: boolean;
  healthcheckPassed: boolean;
  rolledBack: boolean;
  currentImageTag: string;
}

/**
 * Configuración de healthcheck.
 */
export interface HealthcheckConfig {
  /**
   * URL del healthcheck endpoint.
   */
  url: string;

  /**
   * Timeout en milisegundos.
   */
  timeout: number;

  /**
   * Número de intentos.
   */
  retries: number;

  /**
   * Intervalo entre intentos en milisegundos.
   */
  retryInterval: number;

  /**
   * Códigos de estado HTTP aceptables.
   */
  acceptableStatusCodes: number[];
}

/**
 * Cliente SSH para operaciones remotas.
 */
export interface SshClientInterface {
  executeCommand(command: string): Promise<{ success: boolean; output?: string; error?: string }>;
}
