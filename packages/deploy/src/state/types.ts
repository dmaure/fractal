/**
 * Estado del provisioning en el VPS.
 * Almacena qué pasos ya se aplicaron para garantizar idempotencia (AC-11).
 */
export interface VpsState {
  /**
   * Versión del formato de estado.
   */
  version: string;

  /**
   * Pasos de provisioning completados.
   */
  provisioningSteps: {
    hardening: boolean;
    runtime: boolean;
    dns: boolean;
    ssl: boolean;
    initialDeploy: boolean;
  };

  /**
   * Información del último deploy exitoso.
   */
  lastSuccessfulDeploy?: {
    imageTag: string;
    timestamp: string;
    commitSha?: string;
  };

  /**
   * Timestamp de creación del estado.
   */
  createdAt: string;

  /**
   * Timestamp de última actualización.
   */
  updatedAt: string;
}

/**
 * Resultado de operación de estado.
 */
export interface StateOperationResult {
  success: boolean;
  error?: string;
}

/**
 * Resultado de lectura de estado.
 */
export interface StateReadResult extends StateOperationResult {
  state?: VpsState;
  exists: boolean;
}

/**
 * Paso de provisioning.
 */
export type ProvisioningStep = keyof VpsState['provisioningSteps'];

/**
 * Cliente SSH para operaciones remotas.
 */
export interface SshClientInterface {
  executeCommand(command: string): Promise<{ success: boolean; output?: string; error?: string }>;
  readFile(remotePath: string): Promise<{ success: boolean; content?: string; error?: string }>;
  writeFile(remotePath: string, content: string): Promise<{ success: boolean; error?: string }>;
}
