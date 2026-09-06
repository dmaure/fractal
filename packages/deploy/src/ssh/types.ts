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
