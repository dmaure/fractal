/**
 * Tipos del módulo DNS.
 * Framework-agnostic según Artículo II de CONSTITUTION.md.
 */

/**
 * Función para resolver dominios a IPs.
 * Permite inyección de dependencias para testing.
 */
export type DnsResolver = (domain: string) => Promise<string | null>;

/**
 * Proveedor de DNS soportado.
 */
export type DnsProvider = 'cloudflare' | 'manual';

/**
 * Configuración base para DNS.
 */
export interface DnsConfig {
  /** Dominio a configurar (sin www) */
  domain: string;
  
  /** IP del servidor */
  serverIp: string;
  
  /** Proveedor de DNS */
  provider: DnsProvider;
}

/**
 * Configuración específica de Cloudflare.
 */
export interface CloudflareDnsConfig extends DnsConfig {
  provider: 'cloudflare';
  
  /** API token de Cloudflare */
  apiToken: string;
  
  /** Zone ID (opcional, se detecta automáticamente si no se provee) */
  zoneId?: string;
}

/**
 * Configuración para DNS manual.
 */
export interface ManualDnsConfig extends DnsConfig {
  provider: 'manual';
  
  /** Intervalo de polling en ms (default: 5000) */
  pollingInterval?: number;
  
  /** Timeout máximo de polling en ms (default: 300000 = 5 minutos) */
  pollingTimeout?: number;
}

/**
 * Registro DNS a crear.
 */
export interface DnsRecord {
  /** Tipo de registro */
  type: 'A';
  
  /** Nombre del registro (ej: '@' para raíz, 'www' para www) */
  name: string;
  
  /** Valor del registro (IP) */
  value: string;
  
  /** TTL en segundos */
  ttl?: number;
}

/**
 * Resultado de configuración de DNS.
 */
export interface DnsSetupResult {
  /** Indica si la configuración fue exitosa */
  success: boolean;
  
  /** Registros creados o a crear */
  records: DnsRecord[];
  
  /** Indica si la propagación fue confirmada */
  propagated: boolean;
  
  /** Mensajes de los pasos completados */
  steps: string[];
  
  /** Mensaje de error en caso de fallo */
  error?: string;
  
  /** Indica si el proceso puede continuarse más tarde */
  canContinueLater?: boolean;
}

/**
 * Resultado de verificación de propagación DNS.
 */
export interface DnsPropagationResult {
  /** Indica si el DNS resuelve correctamente */
  propagated: boolean;
  
  /** IP detectada para el dominio raíz */
  rootIp?: string;
  
  /** IP detectada para www */
  wwwIp?: string;
  
  /** Mensaje descriptivo del estado */
  message: string;
}

/**
 * Opciones para polling de propagación.
 */
export interface PropagationPollingOptions {
  /** Intervalo entre verificaciones en ms (default: 5000) */
  interval?: number;
  
  /** Timeout máximo en ms (default: 300000 = 5 minutos) */
  timeout?: number;
  
  /** Callback para reportar progreso */
  onProgress?: (attempt: number, elapsed: number) => void;
  
  /** Callback para permitir cancelación (retorna true para cancelar) */
  onCheckCancel?: () => boolean | Promise<boolean>;
}

/**
 * Registros DNS por defecto según SPEC-0003 AC-5 y AC-6.
 */
export const DEFAULT_DNS_RECORDS = (domain: string, ip: string): DnsRecord[] => [
  {
    type: 'A',
    name: '@',
    value: ip,
    ttl: 300,
  },
  {
    type: 'A',
    name: 'www',
    value: ip,
    ttl: 300,
  },
];
