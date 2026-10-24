import type { DnsProvider, SshAuthMethod } from './deploy-command.js';
import type { ProjectTopology } from './topology.js';

/**
 * Opciones del comando `fractal new`.
 *
 * FRA-77: además de topología y --force, el wizard recolecta los valores
 * no-defaultables del camino a deploy. Cada uno también entra por flag y/o
 * env (ver `docs/guides/fractal-new.md`).
 */
export interface NewCommandOptions {
  /** Topología del proyecto */
  topology?: ProjectTopology;

  /** Fuerza la generación sobre un directorio no vacío */
  force?: boolean;

  /**
   * Ejecuta sin prompts: lee flags y variables FRACTAL_NEW_* /
   * FRACTAL_DEPLOY_*. Falla si falta un valor requerido.
   */
  nonInteractive?: boolean;

  /** Nombre del proyecto (alternativa al argumento posicional) */
  name?: string;

  serverIp?: string;
  sshUser?: string;
  authMethod?: SshAuthMethod;
  sshKeyPath?: string;
  sshPassword?: string;
  domain?: string;
  email?: string;
  dnsProvider?: DnsProvider;
  dnsApiToken?: string;
  productionBranch?: string;

  githubToken?: string;
  githubOwner?: string;
  githubRepo?: string;
  githubVisibility?: 'private' | 'public';

  dbPassword?: string;
  generateDbPassword?: boolean;

  /** Encadena a `fractal deploy` al terminar la generación. */
  deploy?: boolean;
}

/**
 * Parámetros validados para la generación de un proyecto.
 */
export interface ValidatedNewParams {
  /** Nombre del proyecto */
  projectName: string;

  /** Directorio destino absoluto */
  targetDir: string;

  /** Topología del proyecto */
  topology: ProjectTopology;

  /** Framework destino (único adapter disponible en v1) */
  target: string;
}

/**
 * Valores no-defaultables recolectados por el wizard de `fractal new` (FRA-77).
 * Los campos de servidor/DNS reutilizan las mismas reglas que `fractal deploy`.
 */
export interface NewWizardParams {
  projectName: string;
  topology: ProjectTopology;
  force?: boolean;

  serverIp: string;
  sshUser: string;
  authMethod: SshAuthMethod;
  sshPassword?: string;
  sshKeyPath?: string;
  domain: string;
  email: string;
  dnsProvider: DnsProvider;
  dnsApiToken?: string;
  productionBranch: string;
  gitRepository?: string;

  githubToken?: string;
  githubOwner?: string;
  githubRepo: string;
  githubVisibility: 'private' | 'public';

  dbPassword: string;
  dbPasswordGenerated: boolean;

  chainDeploy: boolean;
}
