/**
 * Tipos del módulo SSL/TLS.
 * Framework-agnostic según Artículo II de CONSTITUTION.md.
 */

import type { SshClient } from '../ssh/client.js';

/**
 * Interface mínima de SSH client para SSL operations.
 * Permite inyección de dependencias para testing.
 */
export interface SslSshClient {
  executeCommand(command: string): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    error?: string;
  }>;
}

/**
 * Type guard para verificar que un objeto cumple con SslSshClient.
 */
export function isSslSshClient(obj: unknown): obj is SslSshClient {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'executeCommand' in obj &&
    typeof (obj as { executeCommand?: unknown }).executeCommand === 'function'
  );
}

/**
 * Adapter para usar SshClient como SslSshClient.
 */
export function adaptSshClient(client: SshClient): SslSshClient {
  return {
    executeCommand: (command: string) => client.executeCommand(command),
  };
}

/**
 * Entorno de Let's Encrypt a usar.
 */
export type LetsEncryptEnvironment = 'production' | 'staging';

/**
 * Método de instalación de certbot.
 */
export type CertbotInstallMethod = 'snap' | 'apt';

/**
 * Configuración para certificado SSL.
 */
export interface SslConfig {
  /** Dominio para el certificado */
  domain: string;
  
  /** Email para notificaciones de Let's Encrypt */
  email: string;
  
  /** Entorno de Let's Encrypt (staging para tests) */
  environment: LetsEncryptEnvironment;
  
  /** Método de instalación preferido */
  installMethod?: CertbotInstallMethod;
  
  /** Path al directorio raíz de nginx (para webroot) */
  webrootPath?: string;
  
  /** Incluir subdominio www en el certificado */
  includeWww?: boolean;
  
  /** Comando a ejecutar después de renovar el certificado */
  postRenewalHook?: string;
}

/**
 * Resultado de instalación de certbot.
 */
export interface CertbotInstallResult {
  /** Indica si la instalación fue exitosa */
  success: boolean;
  
  /** Versión de certbot instalada */
  version?: string;
  
  /** Método usado para la instalación */
  method?: CertbotInstallMethod;
  
  /** Mensajes de los pasos completados */
  steps: string[];
  
  /** Mensaje de error en caso de fallo */
  error?: string;
}

/**
 * Resultado de emisión de certificado.
 */
export interface CertificateIssuanceResult {
  /** Indica si la emisión fue exitosa */
  success: boolean;
  
  /** Path al certificado */
  certPath?: string;
  
  /** Path a la clave privada */
  keyPath?: string;
  
  /** Path a la cadena completa */
  fullchainPath?: string;
  
  /** Dominio del certificado */
  domain?: string;
  
  /** Fecha de expiración */
  expiresAt?: Date;
  
  /** Mensajes de los pasos completados */
  steps: string[];
  
  /** Mensaje de error en caso de fallo */
  error?: string;
}

/**
 * Configuración de renovación automática.
 */
export interface RenewalConfig {
  /** Path al servicio de renovación (systemd o cron) */
  servicePath?: string;
  
  /** Comando a ejecutar después de renovar */
  postRenewalHook?: string;
}

/**
 * Resultado de configuración de renovación.
 */
export interface RenewalSetupResult {
  /** Indica si la configuración fue exitosa */
  success: boolean;
  
  /** Tipo de mecanismo configurado */
  mechanism?: 'systemd' | 'cron' | 'certbot-native';
  
  /** Mensajes de los pasos completados */
  steps: string[];
  
  /** Mensaje de error en caso de fallo */
  error?: string;
}

/**
 * Configuración de nginx SSL.
 */
export interface NginxSslConfig {
  /** Dominio */
  domain: string;
  
  /** Path al certificado */
  certPath: string;
  
  /** Path a la clave privada */
  keyPath: string;
  
  /** Puerto del backend (para proxy_pass) */
  backendPort?: number;
  
  /** Path al directorio raíz (para frontend estático) */
  rootPath?: string;
}

/**
 * Resultado de configuración de nginx SSL.
 */
export interface NginxSslConfigResult {
  /** Indica si la configuración fue exitosa */
  success: boolean;
  
  /** Path al archivo de configuración generado */
  configPath?: string;
  
  /** Contenido de la configuración */
  configContent?: string;
  
  /** Mensajes de los pasos completados */
  steps: string[];
  
  /** Mensaje de error en caso de fallo */
  error?: string;
}

/**
 * Resultado completo de configuración SSL.
 */
export interface SslSetupResult {
  /** Indica si el setup fue exitoso */
  success: boolean;
  
  /** Resultado de instalación de certbot */
  certbotInstall: CertbotInstallResult;
  
  /** Resultado de emisión de certificado */
  certificateIssuance?: CertificateIssuanceResult;
  
  /** Resultado de configuración de nginx */
  nginxConfig?: NginxSslConfigResult;
  
  /** Resultado de configuración de renovación */
  renewalSetup?: RenewalSetupResult;
  
  /** Mensaje de error general en caso de fallo */
  error?: string;
}

/**
 * Paths por defecto de certificados Let's Encrypt.
 */
export const LETSENCRYPT_PATHS = {
  CERT_DIR: '/etc/letsencrypt',
  LIVE_DIR: '/etc/letsencrypt/live',
  RENEWAL_DIR: '/etc/letsencrypt/renewal',
} as const;

/**
 * URLs de Let's Encrypt según el entorno.
 */
export const LETSENCRYPT_URLS = {
  production: 'https://acme-v02.api.letsencrypt.org/directory',
  staging: 'https://acme-staging-v02.api.letsencrypt.org/directory',
} as const;
