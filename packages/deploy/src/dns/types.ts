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
 * Un dominio es "raíz" (apex/registrable) cuando tiene exactamente 2 etiquetas
 * (p.ej. `codigofractal.dev`). Con 3 o más etiquetas ya es un subdominio
 * (p.ej. `prueba.codigofractal.dev`).
 *
 * Reutiliza el mismo criterio de etiquetas que `zoneCandidates()` en el
 * proveedor de Cloudflare, que toma el dominio registrable como mínimo de 2
 * etiquetas. (Limitación conocida del MVP: no contempla TLDs de dos niveles
 * como `co.uk`, igual que el resto del módulo DNS.)
 */
export const isRootDomain = (domain: string): boolean =>
  domain.split('.').length === 2;

/**
 * Evalúa si la resolución DNS ya coincide con lo que Fractal espera crear.
 *
 * Decisión de Diego (FRA-71): `www` solo se exige para el dominio raíz. Un
 * subdominio (p.ej. `e2e-1.codigofractal.dev`) no crea `www.<subdominio>` y
 * el poller no debe esperar un registro que nadie va a escribir — el e2e
 * real de FRA-73 se colgó 302s justo por eso.
 */
export const evaluateDnsPropagation = (
  domain: string,
  serverIp: string,
  rootIp: string | null,
  wwwIp: string | null
): DnsPropagationResult => {
  const rootMatches = rootIp === serverIp;
  const needsWww = isRootDomain(domain);
  const wwwMatches = !needsWww || wwwIp === serverIp;

  if (rootMatches && wwwMatches) {
    return {
      propagated: true,
      rootIp: rootIp ?? undefined,
      wwwIp: needsWww ? wwwIp ?? undefined : undefined,
      message: 'DNS propagado correctamente',
    };
  }

  const wwwPart = needsWww ? `, www=${wwwIp || 'sin resolver'}` : '';
  return {
    propagated: false,
    rootIp: rootIp || undefined,
    wwwIp: needsWww ? wwwIp || undefined : undefined,
    message: `Esperando propagación: root=${rootIp || 'sin resolver'}${wwwPart}`,
  };
};

/**
 * Registros DNS por defecto según SPEC-0003 AC-5 y AC-6.
 *
 * Decisión de Diego (FRA-71): la variante `www.` solo se agrega para el dominio
 * raíz (p.ej. `codigofractal.dev` → `www.codigofractal.dev`). Si el dominio ya
 * es un subdominio (p.ej. `prueba.codigofractal.dev`) no se crea `www`. Como
 * `includeWww` se deriva de estos registros, la omisión aplica tanto al DNS de
 * Cloudflare como al SAN del certificado de certbot.
 */
export const DEFAULT_DNS_RECORDS = (domain: string, ip: string): DnsRecord[] => {
  const records: DnsRecord[] = [
    {
      type: 'A',
      name: '@',
      value: ip,
      ttl: 300,
    },
  ];

  if (isRootDomain(domain)) {
    records.push({
      type: 'A',
      name: 'www',
      value: ip,
      ttl: 300,
    });
  }

  return records;
};
