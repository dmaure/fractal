import { confirm, input, password, select } from '@inquirer/prompts';
import { randomBytes } from 'node:crypto';
import type { DnsProvider, SshAuthMethod } from '../types/deploy-command.js';
import type { NewCommandOptions, NewWizardParams } from '../types/new-command.js';
import { DEFAULT_TOPOLOGY, isValidTopology, type ProjectTopology } from '../types/topology.js';
import { promptDeployParams } from './deploy-prompts.js';
import {
  flagOrEnv,
  isTruthyEnv,
  readTrimmedEnv,
  validateDomain,
  validateEmail,
  validateIpv4,
} from './param-validators.js';
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

export function generateDbPassword(): string {
  return randomBytes(24).toString('hex');
}

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

async function promptDbPassword(): Promise<{ dbPassword: string; dbPasswordGenerated: boolean }> {
  const mode = await select<'generate' | 'ask'>({
    message: 'Contraseña de la base de datos de producción:',
    choices: [
      {
        value: 'generate',
        name: 'Generar una contraseña segura ahora',
        description: '32 caracteres hex (equivalente a openssl rand -hex 24)',
      },
      {
        value: 'ask',
        name: 'Ingresar una contraseña',
        description: 'No se escribe en el .env local (FRA-76)',
      },
    ],
    default: 'generate',
  });

  if (mode === 'generate') {
    const dbPassword = generateDbPassword();
    console.log('   Contraseña generada (guardala: no se vuelve a mostrar ni se commitea).');
    return { dbPassword, dbPasswordGenerated: true };
  }

  const dbPassword = await password({
    message: 'Contraseña de la base de datos:',
    mask: '*',
    validate: (value) => {
      if (!value) return 'La contraseña es requerida';
      if (/[\r\n]/.test(value)) return 'La contraseña no puede contener saltos de línea';
      return true;
    },
  });
  return { dbPassword, dbPasswordGenerated: false };
}

/**
 * Wizard interactivo: reutiliza los prompts de deploy (IP, SSH, DNS, email)
 * y agrega GitHub token + DB password + confirmación de encadenar deploy.
 */
export async function promptNewWizard(
  projectName: string | undefined,
  options: NewCommandOptions
): Promise<NewWizardParams> {
  const resolvedName = await promptProjectName(resolveProjectName(projectName, options));

  let topology = options.topology;
  if (!topology) {
    topology = await promptTopology();
  } else if (!isValidTopology(topology)) {
    throw new NonInteractiveConfigError([
      `Topología inválida '${topology}'. Opciones válidas: monolith, monorepo, multirepo`,
    ]);
  }

  console.log('\nValores que no pueden tener default (servidor, DNS, GitHub, secrets)\n');
  console.log('SSH — limitaciones conocidas:');
  for (const gap of SSH_AUTH_GAPS) {
    console.log(`   • ${gap}`);
  }
  console.log();

  const deployParams = await promptDeployParams(false, undefined, {
    skipGitRepository: true,
  });

  console.log('\nConfiguración de GitHub\n');
  const githubToken = await password({
    message: 'Token de GitHub para crear el repo (Enter para omitir):',
    mask: '*',
  });
  const trimmedToken = githubToken.trim() || undefined;

  let githubOwner = flagOrEnv(options.githubOwner, 'FRACTAL_NEW_GITHUB_OWNER');
  if (trimmedToken && !githubOwner) {
    githubOwner = (
      await input({
        message: 'Owner de GitHub (usuario u organización, Enter para el usuario del token):',
      })
    ).trim() || undefined;
  }

  const githubRepo =
    flagOrEnv(options.githubRepo, 'FRACTAL_NEW_GITHUB_REPO') ?? resolvedName;

  const githubVisibilityRaw =
    flagOrEnv(options.githubVisibility, 'FRACTAL_NEW_GITHUB_VISIBILITY') ?? 'private';
  const githubVisibility: 'private' | 'public' =
    githubVisibilityRaw === 'public' ? 'public' : 'private';

  console.log('\nSecrets del workflow\n');
  console.log('   No se escribe un .env local: un .env subido pisaría /home/deploy/.env (FRA-76).');
  const { dbPassword, dbPasswordGenerated } = await promptDbPassword();

  const chainDeploy =
    options.deploy === true
      ? true
      : await confirm({
          message: '¿Ejecutar fractal deploy ahora con estos valores?',
          default: false,
        });

  return {
    projectName: resolvedName,
    topology,
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
    githubToken: trimmedToken,
    githubOwner,
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
  options: NewCommandOptions
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

  const githubToken = requireValue(
    errors,
    flagOrEnv(options.githubToken, 'FRACTAL_NEW_GITHUB_TOKEN'),
    'FRACTAL_NEW_GITHUB_TOKEN (o --github-token)'
  );
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

  const providedDbPassword = flagOrEnv(
    options.dbPassword,
    'FRACTAL_NEW_DB_PASSWORD',
    'FRACTAL_DEPLOY_DB_PASSWORD'
  );
  const generate =
    options.generateDbPassword === true ||
    (options.generateDbPassword !== false && !providedDbPassword);
  let dbPassword = providedDbPassword;
  let dbPasswordGenerated = false;
  if (!dbPassword && generate) {
    dbPassword = generateDbPassword();
    dbPasswordGenerated = true;
  }
  if (!dbPassword) {
    errors.push(
      'FRACTAL_NEW_DB_PASSWORD (o --db-password) es requerida si desactivás --generate-db-password'
    );
  } else if (/[\r\n]/.test(dbPassword)) {
    errors.push('la contraseña de la base no puede contener saltos de línea');
  }

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
  options: NewCommandOptions
): Promise<NewWizardParams | null> {
  const mode = resolveWizardMode(options);
  if (mode === 'skip') {
    return null;
  }
  if (mode === 'non-interactive') {
    return loadNewWizardFromEnvAndFlags(projectName, options);
  }
  return promptNewWizard(projectName, options);
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
