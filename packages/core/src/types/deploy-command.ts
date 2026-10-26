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

  /**
   * Ejecuta el deploy sin prompts interactivos, leyendo todos los parámetros de
   * variables de entorno `FRACTAL_DEPLOY_*`. Pensado para CI/CD (p. ej. el e2e
   * real de FRA-73). Ver `loadDeployParamsFromEnv`.
   */
  nonInteractive?: boolean;

  /**
   * Parámetros ya recolectados (p. ej. por el wizard de `fractal new`).
   * Si están presentes, no se vuelven a pedir ni a leer del entorno.
   */
  prefilledParams?: DeployParams;

  /**
   * Contraseña de la base, si el wizard la recolectó. Se escribe en
   * `/home/deploy/.env` en el servidor; no viaja en un `.env` local (FRA-76).
   */
  dbPassword?: string;

  /**
   * Ruta a un known_hosts con la host key pineada (FRA-75). También se lee
   * de `FRACTAL_DEPLOY_SSH_KNOWN_HOSTS` (ruta o contenido).
   */
  sshKnownHosts?: string;
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
  
  /** Email para notificaciones SSL (Let's Encrypt) */
  email: string;
  
  /** Proveedor DNS para automatización */
  dnsProvider: DnsProvider;
  
  /** API token del proveedor DNS (si no es manual) */
  dnsApiToken?: string;
  
  /** URL del repositorio Git */
  gitRepository: string;
  
  /** Rama de producción */
  productionBranch: string;

  /**
   * Contraseña de la base de datos de producción, si el wizard la recolectó.
   * Opcional: si falta, el runtime la genera en el servidor.
   */
  dbPassword?: string;
  
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
