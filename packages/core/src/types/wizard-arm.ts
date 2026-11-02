/**
 * Contrato de brazo del wizard v2 (SPEC-0032, ADR-0016).
 *
 * Un brazo es una sección modular del wizard con contrato claro de entrada/
 * salida y responsabilidad. Cada brazo puede habilitarse o deshabilitarse
 * según el checklist inicial.
 *
 * El contrato es agnóstico de framework (Art. II) — no nombra términos
 * específicos de ningún stack.
 */

/**
 * Contexto compartido entre brazos. Cada brazo recibe el contexto acumulado
 * por los brazos anteriores y puede agregar sus propias salidas.
 */
export interface WizardContext {
  /**
   * Nombre del proyecto.
   */
  projectName?: string;

  /**
   * Topología del proyecto.
   */
  topology?: 'monolith' | 'monorepo' | 'multirepo';

  /**
   * Datos de infraestructura (IP, SSH, dominio, DNS).
   */
  infrastructure?: {
    serverIp: string;
    sshUser: string;
    authMethod: 'key' | 'password';
    sshKeyPath?: string;
    sshPassword?: string;
    domain: string;
    email: string;
    dnsProvider: 'cloudflare' | 'route53' | 'manual';
    dnsApiToken?: string;
  };

  /**
   * Configuración de GitHub.
   */
  github?: {
    token: string;
    owner?: string;
    repo: string;
    visibility: 'private' | 'public';
    productionBranch: string;
  };

  /**
   * Configuración de base de datos.
   */
  database?: {
    password: string;
    passwordGenerated: boolean;
  };

  /**
   * Definición del dominio (FDL).
   */
  domain?: {
    fdlContent?: string;
  };

  /**
   * Si se debe encadenar deploy al finalizar.
   */
  chainDeploy?: boolean;

  /**
   * Modo del wizard.
   */
  mode?: 'interactive' | 'non-interactive' | 'skip';

  /**
   * Datos adicionales específicos de cada brazo.
   */
  [key: string]: unknown;
}

/**
 * Resultado de la ejecución de un brazo.
 */
export interface WizardArmResult {
  /**
   * Si el brazo se ejecutó exitosamente.
   */
  success: boolean;

  /**
   * Contexto actualizado tras la ejecución del brazo.
   */
  context: WizardContext;

  /**
   * Error, si la ejecución falló.
   */
  error?: string;
}

/**
 * Contrato de un brazo del wizard v2.
 */
export interface WizardArm {
  /**
   * Identificador único del brazo.
   */
  id: string;

  /**
   * Nombre descriptivo.
   */
  name: string;

  /**
   * Responsabilidad del brazo (qué datos recolecta/genera).
   */
  responsibility: string;

  /**
   * Si el brazo es obligatorio.
   */
  required: boolean;

  /**
   * Determina si el brazo debe ejecutarse dado el contexto actual.
   */
  isEnabled(context: WizardContext): boolean;

  /**
   * Ejecuta la lógica del brazo: recolecta datos del usuario (en modo
   * interactivo) o de flags/env (en modo no-interactivo), y devuelve el
   * contexto actualizado.
   */
  execute(context: WizardContext): Promise<WizardArmResult>;
}
