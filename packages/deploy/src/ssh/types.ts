/**
 * Configuración de conexión SSH.
 */
export interface SshConfig {
  /** Host o IP del servidor */
  host: string;
  
  /** Puerto SSH (default: 22) */
  port?: number;
  
  /** Usuario SSH */
  username: string;
  
  /** Contraseña (si authMethod es 'password') */
  password?: string;
  
  /** Ruta a clave privada (si authMethod es 'key') */
  privateKeyPath?: string;
  
  /** Timeout de conexión en ms (default: 10000) */
  timeout?: number;

  /**
   * Ruta a known_hosts (default: ~/.ssh/known_hosts).
   * La conexión siempre verifica la clave del host contra este archivo.
   */
  knownHostsPath?: string;

  /**
   * Confirmación TOFU cuando el host no está en known_hosts.
   * Si se omite, los hosts desconocidos se rechazan (fail-closed).
   * Un cambio de clave nunca llama este callback: se rechaza siempre.
   */
  onUnknownHost?: (info: UnknownHostInfo) => boolean | Promise<boolean>;
}

/**
 * Clave de un host que no está en known_hosts.
 */
export interface UnknownHostInfo {
  host: string;
  port: number;
  keyType: string;
  /** Huella SHA256 en formato OpenSSH (`SHA256:...`). */
  fingerprint: string;
}

/**
 * Resultado de ejecución de comando remoto.
 */
export interface SshCommandResult {
  /** Indica si el comando se ejecutó exitosamente */
  success: boolean;
  
  /** Output estándar del comando */
  stdout: string;
  
  /** Output de error del comando */
  stderr: string;
  
  /** Código de salida del comando */
  exitCode: number | null;
  
  /** Mensaje de error en caso de fallo de conexión */
  error?: string;
}
