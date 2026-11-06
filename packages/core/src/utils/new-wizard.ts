import { confirm, input, password, select } from '@inquirer/prompts';
import type { DnsProvider, SshAuthMethod } from '../types/deploy-command.js';
import type { NewCommandOptions, NewWizardParams } from '../types/new-command.js';
import { DEFAULT_TOPOLOGY, isValidTopology, type ProjectTopology } from '../types/topology.js';
import { promptDeployParams } from './deploy-prompts.js';
import { generateDbPassword, promptDbPassword, resolveDbPasswordFromFlagsOrEnv } from './db-password.js';
import {
  flagOrEnv,
  isTruthyEnv,
  readTrimmedEnv,
  validateDomain,
  validateEmail,
  validateIpv4,
} from './param-validators.js';
import { githubHttpsUrl } from './github-repo.js';
import { promptTopology } from './prompts.js';

/**
 * Gaps conocidos de autenticación SSH. El wizard no finge soporte:
 * no pide passphrase ni habla con ssh-agent (FRA-77).
 */
export const SSH_AUTH_GAPS = [
  'Claves con passphrase: el CLI no pide la passphrase ni la reenvía a ssh-keygen. Usá una clave sin cifrar o descifrala antes.',
  'ssh-agent: no se consulta el agent ni se reenvía. La clave privada tiene que ser un archivo en disco.',
] as const;

/**
 * Mapping flag ↔ FRACTAL_NEW_* ↔ FRACTAL_DEPLOY_* (fuente de verdad del
 * modo no interactivo). FRACTAL_NEW_* gana sobre FRACTAL_DEPLOY_* cuando
 * ambos existen; el flag gana sobre las dos.
 */
export const NEW_ENV_MAPPING = [
  { field: 'projectName', flag: '--name', newEnv: 'FRACTAL_NEW_PROJECT_NAME', deployEnv: undefined },
  { field: 'topology', flag: '--topology / -t', newEnv: 'FRACTAL_NEW_TOPOLOGY', deployEnv: undefined },
  { field: 'serverIp', flag: '--server-ip', newEnv: 'FRACTAL_NEW_SERVER_IP', deployEnv: 'FRACTAL_DEPLOY_SERVER_IP' },
  { field: 'sshUser', flag: '--ssh-user', newEnv: 'FRACTAL_NEW_SSH_USER', deployEnv: 'FRACTAL_DEPLOY_SSH_USER' },
  { field: 'authMethod', flag: '--auth-method', newEnv: 'FRACTAL_NEW_AUTH_METHOD', deployEnv: 'FRACTAL_DEPLOY_AUTH_METHOD' },
  { field: 'sshKeyPath', flag: '--ssh-key-path', newEnv: 'FRACTAL_NEW_SSH_KEY_PATH', deployEnv: 'FRACTAL_DEPLOY_SSH_KEY_PATH' },
  { field: 'sshPassword', flag: '--ssh-password', newEnv: 'FRACTAL_NEW_SSH_PASSWORD', deployEnv: 'FRACTAL_DEPLOY_SSH_PASSWORD' },
  { field: 'domain', flag: '--domain', newEnv: 'FRACTAL_NEW_DOMAIN', deployEnv: 'FRACTAL_DEPLOY_DOMAIN' },
  { field: 'email', flag: '--email', newEnv: 'FRACTAL_NEW_EMAIL', deployEnv: 'FRACTAL_DEPLOY_EMAIL' },
  { field: 'dnsProvider', flag: '--dns-provider', newEnv: 'FRACTAL_NEW_DNS_PROVIDER', deployEnv: 'FRACTAL_DEPLOY_DNS_PROVIDER' },
  { field: 'dnsApiToken', flag: '--dns-api-token', newEnv: 'FRACTAL_NEW_DNS_API_TOKEN', deployEnv: 'FRACTAL_DEPLOY_DNS_API_TOKEN' },
  { field: 'productionBranch', flag: '--production-branch', newEnv: 'FRACTAL_NEW_PRODUCTION_BRANCH', deployEnv: 'FRACTAL_DEPLOY_PRODUCTION_BRANCH' },
  { field: 'githubToken', flag: '--github-token', newEnv: 'FRACTAL_NEW_GITHUB_TOKEN', deployEnv: undefined },
  { field: 'githubOwner', flag: '--github-owner', newEnv: 'FRACTAL_NEW_GITHUB_OWNER', deployEnv: undefined },
  { field: 'githubRepo', flag: '--github-repo', newEnv: 'FRACTAL_NEW_GITHUB_REPO', deployEnv: undefined },
  { field: 'githubVisibility', flag: '--github-visibility', newEnv: 'FRACTAL_NEW_GITHUB_VISIBILITY', deployEnv: undefined },
  { field: 'dbPassword', flag: '--db-password', newEnv: 'FRACTAL_NEW_DB_PASSWORD', deployEnv: 'FRACTAL_DEPLOY_DB_PASSWORD' },
  { field: 'chainDeploy', flag: '--deploy', newEnv: 'FRACTAL_NEW_DEPLOY', deployEnv: undefined },
] as const;

export class NonInteractiveConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(
      'No se pudo armar la configuración de fractal new no interactiva. ' +
        'Revisá flags y variables FRACTAL_NEW_* / FRACTAL_DEPLOY_*:\n' +
        problems.map((item) => `  • ${item}`).join('\n')
    );
    this.name = 'NonInteractiveConfigError';
  }
}

/**
 * Decide si corre el wizard completo, el modo no interactivo, o se salta
 * (generación mínima: nombre + topología).
 *
 * - `--non-interactive`: set completo, falla si falta un requerido.
 * - TTY: wizard interactivo (pedido de Diego / FRA-77).
 * - no TTY (CI, e2e actual): generación mínima, sin prompts extra.
 */
export type WizardMode = 'interactive' | 'non-interactive' | 'skip';

export function resolveWizardMode(options: NewCommandOptions, isTty = process.stdin.isTTY): WizardMode {
  if (options.nonInteractive) {
    return 'non-interactive';
  }
  if (isTty) {
    return 'interactive';
  }
  return 'skip';
}

export { generateDbPassword };

export function resolveProjectName(
  positionalName: string | undefined,
  options: NewCommandOptions
): string | undefined {
  const fromFlagOrEnv = flagOrEnv(
    positionalName || options.name,
    'FRACTAL_NEW_PROJECT_NAME'
  );
  return fromFlagOrEnv;
}

export function resolveTopologyValue(
  options: NewCommandOptions
): ProjectTopology | undefined {
  const raw = flagOrEnv(options.topology, 'FRACTAL_NEW_TOPOLOGY');
  if (!raw) {
    return undefined;
  }
  if (!isValidTopology(raw)) {
    throw new NonInteractiveConfigError([
      `Topología inválida '${raw}'. Opciones válidas: monolith, monorepo, multirepo`,
    ]);
  }
  return raw;
}

export async function promptProjectName(current?: string): Promise<string> {
  if (current) {
    return current;
  }
  return input({
    message: 'Nombre del proyecto:',
    validate: (value) => {
      if (!value.trim()) return 'El nombre del proyecto es requerido';
      if (/\s/.test(value.trim())) return 'El nombre no puede contener espacios';
      return true;
    },
  }).then((value) => value.trim());
}

/**
 * Opciones de framework para el wizard.
 * Se obtienen dinámicamente de los adapters instalados (Art. II).
 */
export interface WizardFrameworkOption {
  value: string;
  name: string;
  description: string;
}

/**
 * Prompt de framework. Las opciones se obtienen dinámicamente de los adapters
 * instalados. Se muestra aunque haya una sola opción (ADR-0016 §4, FRA-84 AC-2).
 * 
 * @param options Lista de frameworks disponibles (del adapter)
 * @param defaultValue Framework por defecto
 */
export async function promptFramework(
  options: WizardFrameworkOption[],
  defaultValue?: string
): Promise<string> {
  if (options.length === 0) {
    throw new Error('No hay frameworks disponibles');
  }
  
  // Si solo hay una opción y no es interactivo, usar esa sin preguntar
  if (options.length === 1 && !process.stdin.isTTY) {
    return options[0].value;
  }
  
  return select({
    message: 'Framework del backend:',
    choices: options.map((opt) => ({
      value: opt.value,
      name: opt.name,
      description: opt.description,
    })),
    default: defaultValue ?? options[0]?.value,
  });
}

/**
 * Opciones de base de datos para el wizard.
 * Visible aunque haya una sola opción (ADR-0016 §4, FRA-84 AC-2).
 */
export interface WizardDatabaseOption {
  value: string;
  name: string;
  description: string;
}

export const WIZARD_DATABASE_OPTIONS: WizardDatabaseOption[] = [
  {
    value: 'postgresql',
    name: 'PostgreSQL',
    description: 'Base de datos relacional de producción',
  },
];

export const DEFAULT_WIZARD_DATABASE = 'postgresql';

/**
 * Prompt de base de datos (FRA-84). Visible aunque haya una sola opción.
 */
export async function promptDatabaseType(): Promise<string> {
  return select({
    message: 'Base de datos:',
    choices: WIZARD_DATABASE_OPTIONS.map((opt) => ({
      value: opt.value,
      name: opt.name,
      description: opt.description,
    })),
    default: DEFAULT_WIZARD_DATABASE,
  });
}

/**
 * Opciones de frontend para el wizard.
 * Visible aunque haya una sola opción (ADR-0016 §4, FRA-84 AC-2).
 */
export interface WizardFrontendOption {
  value: string;
  name: string;
  description: string;
}

export const WIZARD_FRONTEND_OPTIONS: WizardFrontendOption[] = [
  {
    value: 'react-vite',
    name: 'React + Vite',
    description: 'SPA con React y Vite para desarrollo rápido',
  },
];

export const DEFAULT_WIZARD_FRONTEND = 'react-vite';

/**
 * Prompt de frontend (FRA-84). Visible aunque haya una sola opción.
 */
export async function promptFrontend(): Promise<string> {
  return select({
    message: 'Framework del frontend:',
    choices: WIZARD_FRONTEND_OPTIONS.map((opt) => ({
      value: opt.value,
      name: opt.name,
      description: opt.description,
    })),
    default: DEFAULT_WIZARD_FRONTEND,
  });
}

async function promptChainDeploy(options: NewCommandOptions): Promise<boolean> {
  if (options.deploy === true) {
    return true;
  }
  return confirm({
    message: '¿Ejecutar fractal deploy ahora con estos valores?',
    default: false,
  });
}

/**
 * Wizard interactivo: orden code-first (FRA-84, ADR-0016).
 * Usa el orquestador con ChecklistArm y CodeArm para código,
 * luego recolecta infraestructura y GitHub.
 * 
 * @param frameworkOptions Opciones de framework del adapter (Art. II: agnóstico)
 * @param defaultFramework Framework por defecto del adapter
 * @param useOrchestrator Si false, usa prompts directos (solo para tests legacy)
 */
export async function promptNewWizard(
  projectName: string | undefined,
  options: NewCommandOptions,
  frameworkOptions: WizardFrameworkOption[] = [],
  defaultFramework?: string,
  useOrchestrator: boolean = true
): Promise<NewWizardParams> {
  const resolvedName = resolveProjectName(projectName, options);
  
  let finalProjectName: string | undefined;
  let framework: string | undefined;
  let database: string | undefined;
  let frontend: string | undefined;
  let topology: string | undefined;
  let shouldPromptInfra = true;
  let shouldPromptGitHub = true;
  let orchestratorResult: any = null; // FRA-85: necesitamos acceder al context más tarde

  if (useOrchestrator) {
    // Flujo real: orquestador con ChecklistArm, CodeArm, InfrastructureArm y
    // DatabaseArm (FRA-82, FRA-83, FRA-84, FRA-85, FRA-87)
    // La topología se pregunta DENTRO del CodeArm (AC-2: código primero)
    const { ChecklistArm } = await import('../wizard/arms/checklist-arm.js');
    const { CodeArm } = await import('../wizard/arms/code-arm.js');
    const { InfrastructureArm } = await import('../wizard/arms/infrastructure-arm.js');
    const { DatabaseArm } = await import('../wizard/arms/database-arm.js');
    const { orchestrateWizard } = await import('../wizard/orchestrator.js');

    const checklist = new ChecklistArm();
    const codeArm = new CodeArm(frameworkOptions, defaultFramework);
    const infraArm = new InfrastructureArm();
    const databaseArm = new DatabaseArm(options);

    orchestratorResult = await orchestrateWizard({
      arms: [checklist, codeArm, infraArm, databaseArm],
      initialContext: {
        mode: 'interactive',
        projectName: resolvedName,
        topology: options.topology,
      },
    });

    if (!orchestratorResult.success) {
      throw new NonInteractiveConfigError([
        `Error en wizard: ${orchestratorResult.error?.message || 'desconocido'}`,
      ]);
    }

    const { context } = orchestratorResult;
    
    // Leer valores del contexto del orquestador (FRA-84: fix bug de projectName perdido)
    finalProjectName = context.projectName;
    if (!finalProjectName) {
      throw new NonInteractiveConfigError(['Error: el nombre del proyecto no fue recolectado']);
    }
    
    framework = context.framework;
    database = context.database;
    frontend = context.frontend;
    topology = context.topology;
    
    if (!topology || !isValidTopology(topology)) {
      throw new NonInteractiveConfigError([
        `Topología inválida '${topology}'. Opciones válidas: monolith, monorepo, multirepo`,
      ]);
    }
    
    // FRA-85: InfrastructureArm ya recolectó los datos si el checklist lo habilitó
    shouldPromptInfra = false; // Ya manejado por el orquestador
    shouldPromptGitHub = context.checklist?.hasGitHubToken === 'yes';
  } else {
    // Flujo legacy (solo tests): prompts directos
    console.log('\n🎨 Código del proyecto\n');
    finalProjectName = await promptProjectName(resolvedName);
    framework = frameworkOptions.length > 0 
      ? await promptFramework(frameworkOptions, defaultFramework)
      : defaultFramework;
    
    // En path legacy, validar topology
    topology = options.topology;
    if (!topology) {
      topology = await promptTopology();
    } else if (!isValidTopology(topology)) {
      throw new NonInteractiveConfigError([
        `Topología inválida '${topology}'. Opciones válidas: monolith, monorepo, multirepo`,
      ]);
    }
    
    database = await promptDatabaseType();
    frontend = await promptFrontend();
  }
  
  if (!finalProjectName) {
    throw new NonInteractiveConfigError(['Error: el nombre del proyecto no fue recolectado']);
  }

  // Infraestructura: leer del contexto del orquestador (FRA-85)
  let deployParams;
  if (useOrchestrator) {
    // FRA-85: InfrastructureArm ya recolectó los datos si el checklist lo habilitó
    const { context } = orchestratorResult;
    if (context.infrastructure) {
      // Camino con infraestructura
      deployParams = {
        serverIp: context.infrastructure.serverIp,
        sshUser: context.infrastructure.sshUser,
        authMethod: context.infrastructure.authMethod,
        sshKeyPath: context.infrastructure.sshKeyPath,
        sshPassword: context.infrastructure.sshPassword,
        domain: context.infrastructure.domain,
        email: context.infrastructure.email,
        dnsProvider: context.infrastructure.dnsProvider,
        dnsApiToken: context.infrastructure.dnsApiToken,
        productionBranch: 'main',
      };
    } else {
      // Camino local-only: valores dummy para mantener la estructura de NewWizardParams
      deployParams = {
        serverIp: '',
        sshUser: 'root',
        authMethod: 'key' as const,
        domain: '',
        email: '',
        dnsProvider: 'manual' as const,
        productionBranch: 'main',
      };
    }
  } else {
    // Flujo legacy (solo tests): prompts directos
    console.log('\n🏗️  Infraestructura y deploy\n');
    console.log('Valores que no pueden tener default (servidor, DNS)\n');
    console.log('SSH — limitaciones conocidas:');
    for (const gap of SSH_AUTH_GAPS) {
      console.log(`   • ${gap}`);
    }
    console.log();

    deployParams = await promptDeployParams(false, undefined, {
      skipGitRepository: true,
    });
  }

  // GitHub: si checklist lo habilitó
  let githubToken: string | undefined;
  let githubOwner: string | undefined;
  
  if (shouldPromptGitHub || !useOrchestrator) {
    if (useOrchestrator) {
      console.log('\nConfiguración de GitHub\n');
    }
    
    const token = await password({
      message: 'Token de GitHub para crear el repo (Enter para omitir):',
      mask: '*',
    });
    githubToken = token.trim() || undefined;

    if (githubToken && !flagOrEnv(options.githubOwner, 'FRACTAL_NEW_GITHUB_OWNER')) {
      const owner = await input({
        message: 'Owner de GitHub (usuario u organización, Enter para el usuario del token):',
      });
      githubOwner = owner.trim() || undefined;
    }
  }

  const githubRepo =
    flagOrEnv(options.githubRepo, 'FRACTAL_NEW_GITHUB_REPO') ?? finalProjectName;

  const githubVisibilityRaw =
    flagOrEnv(options.githubVisibility, 'FRACTAL_NEW_GITHUB_VISIBILITY') ?? 'private';
  const githubVisibility: 'private' | 'public' =
    githubVisibilityRaw === 'public' ? 'public' : 'private';

  // FRA-87: la contraseña de DB la recolecta el DatabaseArm, que solo corre
  // con deploy (FRA-85 AC-8). Sin deploy no hay DB_PASSWORD ni secret huérfano.
  let dbPassword = '';
  let dbPasswordGenerated = false;
  let chainDeploy = false;

  if (useOrchestrator) {
    const { context } = orchestratorResult;
    if (context.databasePassword) {
      dbPassword = context.databasePassword.password;
      dbPasswordGenerated = context.databasePassword.passwordGenerated;
    }
    if (context.infrastructure) {
      chainDeploy = await promptChainDeploy(options);
    }
  } else {
    // Flujo legacy: siempre pide contraseña porque siempre recolecta infraestructura
    console.log('\nSecrets del workflow\n');
    console.log('   No se escribe un .env local: un .env subido pisaría /home/deploy/.env (FRA-76).');
    ({ dbPassword, dbPasswordGenerated } = await promptDbPassword());
    chainDeploy = await promptChainDeploy(options);
  }

  return {
    projectName: finalProjectName,
    topology: topology as ProjectTopology,
    framework: framework || defaultFramework,
    database: database || DEFAULT_WIZARD_DATABASE,
    frontend: frontend || DEFAULT_WIZARD_FRONTEND,
    force: options.force,
    serverIp: deployParams.serverIp,
    sshUser: deployParams.sshUser,
    authMethod: deployParams.authMethod,
    sshPassword: deployParams.sshPassword,
    sshKeyPath: deployParams.sshKeyPath,
    domain: deployParams.domain,
    email: deployParams.email,
    dnsProvider: deployParams.dnsProvider,
    dnsApiToken: deployParams.dnsApiToken,
    productionBranch:
      flagOrEnv(options.productionBranch, 'FRACTAL_NEW_PRODUCTION_BRANCH', 'FRACTAL_DEPLOY_PRODUCTION_BRANCH') ??
      deployParams.productionBranch,
    githubToken,
    githubOwner: githubOwner || flagOrEnv(options.githubOwner, 'FRACTAL_NEW_GITHUB_OWNER'),
    githubRepo,
    githubVisibility,
    dbPassword,
    dbPasswordGenerated,
    chainDeploy,
  };
}

function requireValue(
  errors: string[],
  value: string | undefined,
  label: string
): string | undefined {
  if (!value) {
    errors.push(`${label} es requerida`);
    return undefined;
  }
  return value;
}

/**
 * Modo no interactivo: el mismo set del wizard, por flag y/o env.
 * Falla con la lista completa de variables/flags faltantes o inválidas.
 */
export function loadNewWizardFromEnvAndFlags(
  projectName: string | undefined,
  options: NewCommandOptions,
  frameworkOptions: WizardFrameworkOption[] = [],
  defaultFramework?: string
): NewWizardParams {
  const errors: string[] = [];

  const resolvedName = resolveProjectName(projectName, options);
  if (!resolvedName) {
    errors.push('el nombre del proyecto es requerido (argumento, --name o FRACTAL_NEW_PROJECT_NAME)');
  }

  let topology: ProjectTopology = DEFAULT_TOPOLOGY;
  try {
    topology = resolveTopologyValue(options) ?? DEFAULT_TOPOLOGY;
  } catch (error) {
    if (error instanceof NonInteractiveConfigError) {
      errors.push(...error.problems);
    } else {
      throw error;
    }
  }

  const serverIp = flagOrEnv(options.serverIp, 'FRACTAL_NEW_SERVER_IP', 'FRACTAL_DEPLOY_SERVER_IP');
  if (!serverIp) {
    errors.push('FRACTAL_NEW_SERVER_IP (o FRACTAL_DEPLOY_SERVER_IP / --server-ip) es requerida');
  } else if (validateIpv4(serverIp) !== true) {
    errors.push(`IP inválida: "${serverIp}" (formato IPv4 esperado)`);
  }

  const sshUser =
    flagOrEnv(options.sshUser, 'FRACTAL_NEW_SSH_USER', 'FRACTAL_DEPLOY_SSH_USER') ?? 'root';

  const authMethodRaw =
    flagOrEnv(options.authMethod, 'FRACTAL_NEW_AUTH_METHOD', 'FRACTAL_DEPLOY_AUTH_METHOD') ?? 'key';
  if (authMethodRaw !== 'key' && authMethodRaw !== 'password') {
    errors.push(`auth method inválido: "${authMethodRaw}" (valores: key | password)`);
  }
  const authMethod = authMethodRaw as SshAuthMethod;

  let sshKeyPath: string | undefined;
  let sshPassword: string | undefined;
  if (authMethod === 'key') {
    sshKeyPath = flagOrEnv(
      options.sshKeyPath,
      'FRACTAL_NEW_SSH_KEY_PATH',
      'FRACTAL_DEPLOY_SSH_KEY_PATH'
    );
    if (!sshKeyPath) {
      errors.push('FRACTAL_NEW_SSH_KEY_PATH (o FRACTAL_DEPLOY_SSH_KEY_PATH / --ssh-key-path) es requerida con AUTH_METHOD=key');
    }
  } else if (authMethod === 'password') {
    sshPassword = flagOrEnv(
      options.sshPassword,
      'FRACTAL_NEW_SSH_PASSWORD',
      'FRACTAL_DEPLOY_SSH_PASSWORD'
    );
    if (!sshPassword) {
      errors.push('FRACTAL_NEW_SSH_PASSWORD (o FRACTAL_DEPLOY_SSH_PASSWORD / --ssh-password) es requerida con AUTH_METHOD=password');
    }
  }

  const domain = flagOrEnv(options.domain, 'FRACTAL_NEW_DOMAIN', 'FRACTAL_DEPLOY_DOMAIN');
  if (!domain) {
    errors.push('FRACTAL_NEW_DOMAIN (o FRACTAL_DEPLOY_DOMAIN / --domain) es requerida');
  } else if (validateDomain(domain) !== true) {
    errors.push(`dominio inválido: "${domain}"`);
  }

  const email = flagOrEnv(options.email, 'FRACTAL_NEW_EMAIL', 'FRACTAL_DEPLOY_EMAIL');
  if (!email) {
    errors.push('FRACTAL_NEW_EMAIL (o FRACTAL_DEPLOY_EMAIL / --email) es requerida');
  } else if (validateEmail(email) !== true) {
    errors.push(`email inválido: "${email}"`);
  }

  const dnsProviderRaw =
    flagOrEnv(
      options.dnsProvider,
      'FRACTAL_NEW_DNS_PROVIDER',
      'FRACTAL_DEPLOY_DNS_PROVIDER'
    ) ?? 'manual';
  if (
    dnsProviderRaw !== 'cloudflare' &&
    dnsProviderRaw !== 'route53' &&
    dnsProviderRaw !== 'manual'
  ) {
    errors.push(
      `DNS provider inválido: "${dnsProviderRaw}" (valores: cloudflare | route53 | manual)`
    );
  }
  const dnsProvider = dnsProviderRaw as DnsProvider;

  let dnsApiToken: string | undefined;
  if (dnsProvider === 'cloudflare' || dnsProvider === 'route53') {
    dnsApiToken = flagOrEnv(
      options.dnsApiToken,
      'FRACTAL_NEW_DNS_API_TOKEN',
      'FRACTAL_DEPLOY_DNS_API_TOKEN'
    );
    if (!dnsApiToken) {
      errors.push(
        `FRACTAL_NEW_DNS_API_TOKEN (o FRACTAL_DEPLOY_DNS_API_TOKEN) es requerida con DNS_PROVIDER=${dnsProvider}`
      );
    }
  }

  // GitHub es opcional (FRA-86, AC-2): sin token, no se crea repo remoto
  const githubToken = flagOrEnv(options.githubToken, 'FRACTAL_NEW_GITHUB_TOKEN');
  const githubOwner = flagOrEnv(options.githubOwner, 'FRACTAL_NEW_GITHUB_OWNER');
  const githubRepo =
    flagOrEnv(options.githubRepo, 'FRACTAL_NEW_GITHUB_REPO') ?? resolvedName ?? '';
  const githubVisibilityRaw =
    flagOrEnv(options.githubVisibility, 'FRACTAL_NEW_GITHUB_VISIBILITY') ?? 'private';
  if (githubVisibilityRaw !== 'private' && githubVisibilityRaw !== 'public') {
    errors.push(`FRACTAL_NEW_GITHUB_VISIBILITY inválida: "${githubVisibilityRaw}" (private | public)`);
  }
  const githubVisibility: 'private' | 'public' =
    githubVisibilityRaw === 'public' ? 'public' : 'private';

  // Brazo DB (FRA-87): el no interactivo siempre tiene deploy, así que la
  // contraseña se resuelve de flags/env o se genera.
  const dbPasswordResolution = resolveDbPasswordFromFlagsOrEnv(options);
  if (dbPasswordResolution.error) {
    errors.push(dbPasswordResolution.error);
  }
  const dbPassword = dbPasswordResolution.result?.dbPassword;
  const dbPasswordGenerated = dbPasswordResolution.result?.dbPasswordGenerated ?? false;

  const chainDeploy =
    options.deploy === true || isTruthyEnv(readTrimmedEnv('FRACTAL_NEW_DEPLOY'));

  const productionBranch =
    flagOrEnv(
      options.productionBranch,
      'FRACTAL_NEW_PRODUCTION_BRANCH',
      'FRACTAL_DEPLOY_PRODUCTION_BRANCH'
    ) ?? 'main';

  if (errors.length > 0) {
    throw new NonInteractiveConfigError(errors);
  }

  return {
    projectName: resolvedName!,
    topology,
    framework: defaultFramework,
    database: DEFAULT_WIZARD_DATABASE,
    frontend: DEFAULT_WIZARD_FRONTEND,
    force: options.force,
    serverIp: serverIp!,
    sshUser,
    authMethod,
    sshPassword,
    sshKeyPath,
    domain: domain!.toLowerCase(),
    email: email!.toLowerCase(),
    dnsProvider,
    dnsApiToken,
    productionBranch,
    githubToken,
    githubOwner,
    githubRepo,
    githubVisibility,
    dbPassword: dbPassword!,
    dbPasswordGenerated,
    chainDeploy,
  };
}

export async function collectNewWizardParams(
  projectName: string | undefined,
  options: NewCommandOptions,
  frameworkOptions: WizardFrameworkOption[] = [],
  defaultFramework?: string
): Promise<NewWizardParams | null> {
  const mode = resolveWizardMode(options);
  if (mode === 'skip') {
    return null;
  }
  if (mode === 'non-interactive') {
    return loadNewWizardFromEnvAndFlags(projectName, options, frameworkOptions, defaultFramework);
  }
  return promptNewWizard(projectName, options, frameworkOptions, defaultFramework);
}

/**
 * URL del remoto para encadenar deploy o para los exports.
 * No inventa `github.com/OWNER/<repo>`: sin owner ni URL conocida, undefined.
 */
export function resolveWizardRemoteUrl(
  params: Pick<NewWizardParams, 'gitRepository' | 'githubOwner' | 'githubRepo'>
): string | undefined {
  if (params.gitRepository) {
    return params.gitRepository;
  }
  if (params.githubOwner && params.githubRepo) {
    return githubHttpsUrl(params.githubOwner, params.githubRepo);
  }
  return undefined;
}

export function formatDeployEnvExports(params: NewWizardParams, gitRepository?: string): string[] {
  const lines = [
    `FRACTAL_DEPLOY_SERVER_IP=${params.serverIp}`,
    `FRACTAL_DEPLOY_SSH_USER=${params.sshUser}`,
    `FRACTAL_DEPLOY_AUTH_METHOD=${params.authMethod}`,
    params.sshKeyPath ? `FRACTAL_DEPLOY_SSH_KEY_PATH=${params.sshKeyPath}` : undefined,
    `FRACTAL_DEPLOY_DOMAIN=${params.domain}`,
    `FRACTAL_DEPLOY_EMAIL=${params.email}`,
    `FRACTAL_DEPLOY_DNS_PROVIDER=${params.dnsProvider}`,
    `FRACTAL_DEPLOY_PRODUCTION_BRANCH=${params.productionBranch}`,
    gitRepository ? `FRACTAL_DEPLOY_GIT_REPOSITORY=${gitRepository}` : undefined,
  ];
  return lines.filter((line): line is string => Boolean(line));
}
