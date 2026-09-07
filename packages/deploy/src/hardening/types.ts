/**
 * Configuración para el hardening del sistema.
 */
export interface HardeningConfig {
  /** Usuario no-root a crear para deploys */
  deployUser: string;
  
  /** Clave pública SSH del usuario deploy */
  sshPublicKey: string;
  
  /** Puertos a permitir en el firewall (además del SSH en 22) */
  allowedPorts?: number[];
}

/**
 * Resultado de la operación de hardening.
 */
export interface HardeningResult {
  /** Indica si el hardening fue exitoso */
  success: boolean;
  
  /** Mensajes de los pasos completados */
  steps: string[];
  
  /** Mensaje de error en caso de fallo */
  error?: string;
}

/**
 * Resultado de validación de puertos.
 */
export interface PortCheckResult {
  /** Indica si los puertos están disponibles */
  available: boolean;
  
  /** Lista de puertos ocupados con información del proceso */
  occupiedPorts: string[];
}

/**
 * Configuración por defecto según SPEC-0003 AC-3.
 */
export const DEFAULT_HARDENING_CONFIG: Partial<HardeningConfig> = {
  deployUser: 'deploy',
  allowedPorts: [22, 80, 443],
};
