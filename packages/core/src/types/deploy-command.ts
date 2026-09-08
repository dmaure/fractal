/**
 * Proveedor DNS soportado para automatización.
 */
export type DnsProvider = 'cloudflare' | 'route53' | 'manual';

/**
 * Método de autenticación SSH.
 */
export type SshAuthMethod = 'password' | 'key';

/**
 * Opciones del comando `fractal deploy`.
 */
export interface DeployCommandOptions {
  /** Reconfigura las variables cruzadas en multirepo */
  reconfigure?: boolean;
}

/**
 * Parámetros recolectados para el deploy.
 */
export interface DeployParams {
  /** Dirección IP del VPS */
  serverIp: string;
  
  /** Usuario SSH (típicamente 'root' en el primer provisioning) */
  sshUser: string;
  
  /** Método de autenticación SSH */
  authMethod: SshAuthMethod;
  
  /** Contraseña SSH (solo si authMethod === 'password') */
  sshPassword?: string;
  
  /** Ruta a la clave privada SSH (solo si authMethod === 'key') */
  sshKeyPath?: string;
  
  /** Dominio donde vivirá la aplicación */
  domain: string;
  
  /** Proveedor DNS para automatización */
  dnsProvider: DnsProvider;
  
  /** API token del proveedor DNS (si no es manual) */
  dnsApiToken?: string;
  
  /** URL del repositorio Git */
  gitRepository: string;
  
  /** Rama de producción */
  productionBranch: string;
  
  /** Información del hermano (solo en multirepo con orchestration_state: pending o --reconfigure) */
  siblingInfo?: {
    /** URL del repositorio git del hermano */
    gitUrl: string;
    
    /** Dominio donde vivirá el hermano */
    domain: string;
  };
}

/**
 * Parámetros validados para el deploy.
 */
export interface ValidatedDeployParams extends DeployParams {
  /** Directorio del proyecto local */
  projectDir: string;
  
  /** Topología del proyecto detectada */
  topology?: string;
}
