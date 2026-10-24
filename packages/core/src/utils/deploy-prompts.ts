import { input, select, password, confirm } from '@inquirer/prompts';
import type { DeployParams, DnsProvider, SshAuthMethod } from '../types/deploy-command.js';
import {
  validateDomain,
  validateEmail,
  validateGitUrl,
  validateIpv4,
} from './param-validators.js';

export interface PromptDeployOptions {
  /** Si debe preguntar por el repositorio hermano (multirepo). */
  askSiblingInfo?: boolean;
  /** Rol del repositorio actual (api o web), si existe. */
  currentRole?: 'api' | 'web';
  /**
   * Omite URL git y rama de producción. Lo usa `fractal new` cuando el
   * remoto se crea con el token de GitHub (FRA-77).
   */
  skipGitRepository?: boolean;
}

const DNS_PROVIDER_OPTIONS = [
  {
    value: 'cloudflare' as const,
    name: 'Cloudflare',
    description: 'Automatización vía API (requiere token)',
  },
  {
    value: 'route53' as const,
    name: 'AWS Route53',
    description: 'Automatización vía API (requiere credenciales AWS)',
  },
  {
    value: 'manual' as const,
    name: 'Configuración manual',
    description: 'Te mostraremos los registros DNS a crear',
  },
];

const SSH_AUTH_OPTIONS = [
  {
    value: 'key' as const,
    name: 'Clave SSH (recomendado)',
    description: 'Autenticación con archivo de clave privada',
  },
  {
    value: 'password' as const,
    name: 'Contraseña',
    description: 'Autenticación con contraseña (menos seguro)',
  },
];

interface UnknownHostPromptInfo {
  host: string;
  port: number;
  keyType: string;
  fingerprint: string;
}

/**
 * Recolecta todos los datos necesarios para el deploy vía prompts interactivos.
 *
 * La firma posicional (`askSiblingInfo`, `currentRole`) se mantiene para no
 * romper callers existentes; el tercer argumento opcional lo usa `fractal new`.
 */
export async function promptDeployParams(
  askSiblingInfo = false,
  currentRole?: 'api' | 'web',
  options: PromptDeployOptions = {}
): Promise<DeployParams> {
  const skipGitRepository = options.skipGitRepository === true;

  console.log('Configuración del servidor VPS\n');
  
  const serverIp = await input({
    message: 'Dirección IP del VPS:',
    validate: validateIpv4,
  });

  const sshUser = await input({
    message: 'Usuario SSH:',
    default: 'root',
    validate: (value) => {
      if (!value.trim()) return 'El usuario SSH es requerido';
      return true;
    },
  });

  const authMethod = await select<SshAuthMethod>({
    message: 'Método de autenticación SSH:',
    choices: SSH_AUTH_OPTIONS,
    default: 'key',
  });

  let sshPassword: string | undefined;
  let sshKeyPath: string | undefined;

  if (authMethod === 'password') {
    sshPassword = await password({
      message: 'Contraseña SSH:',
      mask: '*',
      validate: (value) => {
        if (!value) return 'La contraseña es requerida';
        return true;
      },
    });
  } else {
    sshKeyPath = await input({
      message: 'Ruta a la clave privada SSH:',
      default: '~/.ssh/id_rsa',
      validate: (value) => {
        if (!value.trim()) return 'La ruta a la clave es requerida';
        return true;
      },
    });
  }

  console.log('\nConfiguración del dominio y DNS\n');

  const domain = await input({
    message: 'Dominio de la aplicación:',
    validate: validateDomain,
  });
  
  const email = await input({
    message: 'Email para notificaciones SSL (Let\'s Encrypt):',
    validate: validateEmail,
  });

  const dnsProvider = await select<DnsProvider>({
    message: 'Proveedor DNS:',
    choices: DNS_PROVIDER_OPTIONS,
    default: 'manual',
  });

  let dnsApiToken: string | undefined;

  if (dnsProvider === 'cloudflare') {
    dnsApiToken = await password({
      message: 'Cloudflare API Token:',
      mask: '*',
      validate: (value) => {
        if (!value) return 'El API token es requerido para Cloudflare';
        return true;
      },
    });
  } else if (dnsProvider === 'route53') {
    dnsApiToken = await password({
      message: 'AWS Access Key (formato: ACCESS_KEY:SECRET_KEY):',
      mask: '*',
      validate: (value) => {
        if (!value) return 'Las credenciales AWS son requeridas para Route53';
        if (!value.includes(':')) {
          return 'Formato esperado: ACCESS_KEY:SECRET_KEY';
        }
        return true;
      },
    });
  }

  let gitRepository = '';
  let productionBranch = 'main';

  if (!skipGitRepository) {
    console.log('\nConfiguración del repositorio Git\n');

    gitRepository = await input({
      message: 'URL del repositorio Git:',
      validate: validateGitUrl,
    });

    productionBranch = await input({
      message: 'Rama de producción:',
      default: 'main',
      validate: (value) => {
        if (!value.trim()) return 'La rama de producción es requerida';
        return true;
      },
    });
  }

  let siblingInfo: { gitUrl: string; domain: string } | undefined;

  if (askSiblingInfo && currentRole) {
    const siblingRole = currentRole === 'api' ? 'web' : 'api';
    
    console.log(`\nConfiguración del repositorio hermano (${siblingRole})\n`);
    console.log(`En multirepo, cada lado necesita conocer la URL del otro para configurar`);
    console.log(`variables cruzadas (API_URL en web/, CORS_ALLOWED_ORIGIN en api/).\n`);

    const siblingGitUrl = await input({
      message: `URL del repositorio git del ${siblingRole}:`,
      validate: validateGitUrl,
    });

    const siblingDomain = await input({
      message: `Dominio donde vivirá el ${siblingRole}:`,
      validate: validateDomain,
    });

    siblingInfo = {
      gitUrl: siblingGitUrl.trim(),
      domain: siblingDomain.trim().toLowerCase(),
    };
  }

  return {
    serverIp: serverIp.trim(),
    sshUser: sshUser.trim(),
    authMethod,
    sshPassword,
    sshKeyPath: sshKeyPath?.trim(),
    domain: domain.trim().toLowerCase(),
    email: email.trim().toLowerCase(),
    dnsProvider,
    dnsApiToken,
    gitRepository: gitRepository.trim(),
    productionBranch: productionBranch.trim(),
    siblingInfo,
  };
}

/**
 * Variante NO interactiva de `promptDeployParams`: arma los `DeployParams`
 * leyendo variables de entorno `FRACTAL_DEPLOY_*` en vez de preguntar. Pensada
 * para CI/CD (el e2e real de FRA-73). Aplica las MISMAS reglas de validación que
 * `promptDeployParams` (IPv4, dominio, email) y lanza un `Error` con un mensaje
 * claro que lista cada variable faltante o inválida. No imprime ni pregunta nada.
 *
 * @param askSiblingInfo Si debe exigir la info del repositorio hermano (multirepo).
 * @param currentRole Rol del repositorio actual (api o web), si existe.
 */
export function loadDeployParamsFromEnv(
  askSiblingInfo = false,
  currentRole?: 'api' | 'web',
  options: PromptDeployOptions = {}
): DeployParams {
  const skipGitRepository = options.skipGitRepository === true;
  const errors: string[] = [];
  const env = process.env;

  // Devuelve el valor recortado, o undefined si está ausente o vacío.
  const get = (name: string): string | undefined => {
    const v = env[name];
    return v && v.trim() ? v.trim() : undefined;
  };

  // Servidor
  const serverIp = get('FRACTAL_DEPLOY_SERVER_IP');
  if (!serverIp) {
    errors.push('FRACTAL_DEPLOY_SERVER_IP es requerida');
  } else if (validateIpv4(serverIp) !== true) {
    errors.push(
      `FRACTAL_DEPLOY_SERVER_IP inválida: "${serverIp}" (formato IPv4 esperado, ej: 192.168.1.1)`
    );
  }

  const sshUser = get('FRACTAL_DEPLOY_SSH_USER') ?? 'root';

  const authMethodRaw = get('FRACTAL_DEPLOY_AUTH_METHOD') ?? 'key';
  if (authMethodRaw !== 'key' && authMethodRaw !== 'password') {
    errors.push(
      `FRACTAL_DEPLOY_AUTH_METHOD inválida: "${authMethodRaw}" (valores: key | password)`
    );
  }
  const authMethod = authMethodRaw as SshAuthMethod;

  let sshKeyPath: string | undefined;
  let sshPassword: string | undefined;
  if (authMethod === 'key') {
    sshKeyPath = get('FRACTAL_DEPLOY_SSH_KEY_PATH');
    if (!sshKeyPath) {
      errors.push('FRACTAL_DEPLOY_SSH_KEY_PATH es requerida con FRACTAL_DEPLOY_AUTH_METHOD=key');
    }
  } else if (authMethod === 'password') {
    sshPassword = get('FRACTAL_DEPLOY_SSH_PASSWORD');
    if (!sshPassword) {
      errors.push(
        'FRACTAL_DEPLOY_SSH_PASSWORD es requerida con FRACTAL_DEPLOY_AUTH_METHOD=password'
      );
    }
  }

  // Dominio y DNS
  const domainRaw = get('FRACTAL_DEPLOY_DOMAIN');
  if (!domainRaw) {
    errors.push('FRACTAL_DEPLOY_DOMAIN es requerida');
  } else if (validateDomain(domainRaw) !== true) {
    errors.push(`FRACTAL_DEPLOY_DOMAIN inválido: "${domainRaw}" (ej: example.com)`);
  }

  const emailRaw = get('FRACTAL_DEPLOY_EMAIL');
  if (!emailRaw) {
    errors.push('FRACTAL_DEPLOY_EMAIL es requerida');
  } else if (validateEmail(emailRaw) !== true) {
    errors.push(`FRACTAL_DEPLOY_EMAIL inválido: "${emailRaw}" (ej: admin@example.com)`);
  }

  const dnsProviderRaw = get('FRACTAL_DEPLOY_DNS_PROVIDER') ?? 'manual';
  if (
    dnsProviderRaw !== 'cloudflare' &&
    dnsProviderRaw !== 'route53' &&
    dnsProviderRaw !== 'manual'
  ) {
    errors.push(
      `FRACTAL_DEPLOY_DNS_PROVIDER inválido: "${dnsProviderRaw}" (valores: cloudflare | route53 | manual)`
    );
  }
  const dnsProvider = dnsProviderRaw as DnsProvider;

  let dnsApiToken: string | undefined;
  if (dnsProvider === 'cloudflare' || dnsProvider === 'route53') {
    dnsApiToken = get('FRACTAL_DEPLOY_DNS_API_TOKEN');
    if (!dnsApiToken) {
      errors.push(
        `FRACTAL_DEPLOY_DNS_API_TOKEN es requerida con FRACTAL_DEPLOY_DNS_PROVIDER=${dnsProvider}`
      );
    }
  }

  // Repositorio Git (omitido cuando fractal new crea el remoto)
  const gitRepository = skipGitRepository
    ? (get('FRACTAL_DEPLOY_GIT_REPOSITORY') ?? '')
    : get('FRACTAL_DEPLOY_GIT_REPOSITORY');
  if (!skipGitRepository && !gitRepository) {
    errors.push('FRACTAL_DEPLOY_GIT_REPOSITORY es requerida');
  }

  const productionBranch = get('FRACTAL_DEPLOY_PRODUCTION_BRANCH') ?? 'main';
  const dbPassword = get('FRACTAL_DEPLOY_DB_PASSWORD');

  // Hermano (multirepo con coordinación pendiente o --reconfigure)
  let siblingInfo: { gitUrl: string; domain: string } | undefined;
  if (askSiblingInfo && currentRole) {
    const siblingGitUrl = get('FRACTAL_DEPLOY_SIBLING_GIT_URL');
    const siblingDomain = get('FRACTAL_DEPLOY_SIBLING_DOMAIN');
    if (!siblingGitUrl) {
      errors.push('FRACTAL_DEPLOY_SIBLING_GIT_URL es requerida en multirepo con coordinación pendiente');
    }
    if (!siblingDomain) {
      errors.push('FRACTAL_DEPLOY_SIBLING_DOMAIN es requerida en multirepo con coordinación pendiente');
    } else if (validateDomain(siblingDomain) !== true) {
      errors.push(`FRACTAL_DEPLOY_SIBLING_DOMAIN inválido: "${siblingDomain}" (ej: api.example.com)`);
    }
    if (siblingGitUrl && siblingDomain) {
      siblingInfo = { gitUrl: siblingGitUrl, domain: siblingDomain.toLowerCase() };
    }
  }

  if (errors.length > 0) {
    throw new Error(
      'No se pudo armar la configuración de deploy no interactiva. ' +
        'Revisá las variables de entorno FRACTAL_DEPLOY_*:\n' +
        errors.map((e) => `  • ${e}`).join('\n')
    );
  }

  return {
    serverIp: serverIp!,
    sshUser,
    authMethod,
    sshPassword,
    sshKeyPath,
    domain: domainRaw!.toLowerCase(),
    email: emailRaw!.toLowerCase(),
    dnsProvider,
    dnsApiToken,
    gitRepository: gitRepository!,
    productionBranch,
    dbPassword,
    siblingInfo,
  };
}

/**
 * Default (en segundos) del presupuesto de tiempo para subir el proyecto al
 * servidor. Deliberadamente muy por encima del readyTimeout de conexión SSH
 * (120s): la subida (pack + transfer SFTP + extract) de proyectos grandes no
 * debe morir con ese timeout corto de conexión.
 */
export const DEFAULT_UPLOAD_TIMEOUT_SECONDS = 600;

/**
 * Lee `FRACTAL_DEPLOY_UPLOAD_TIMEOUT` (en segundos) y lo devuelve en
 * milisegundos, consistente con el resto de las perillas `FRACTAL_DEPLOY_*`.
 * Un valor ausente, vacío, no numérico (NaN) o no positivo cae al default de
 * 600s. Este presupuesto es independiente del readyTimeout de conexión (120s).
 */
export function loadUploadTimeoutMsFromEnv(): number {
  const raw = process.env.FRACTAL_DEPLOY_UPLOAD_TIMEOUT?.trim();
  const seconds = raw ? Number(raw) : NaN;
  const effectiveSeconds =
    Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_UPLOAD_TIMEOUT_SECONDS;
  return effectiveSeconds * 1000;
}

/**
 * Prompt para confirmar que el usuario quiere proceder con el deploy.
 */
export async function confirmDeploy(params: DeployParams): Promise<boolean> {
  console.log('\n📋 Resumen de la configuración:');
  console.log(`   Servidor: ${params.sshUser}@${params.serverIp}`);
  console.log(`   Dominio: ${params.domain}`);
  console.log(`   DNS: ${params.dnsProvider}`);
  console.log(`   Repositorio: ${params.gitRepository}`);
  console.log(`   Rama: ${params.productionBranch}`);
  
  if (params.siblingInfo) {
    console.log(`\n   Repositorio hermano: ${params.siblingInfo.gitUrl}`);
    console.log(`   Dominio hermano: ${params.siblingInfo.domain}`);
  }
  
  console.log();

  return await confirm({
    message: '¿Proceder con la validación del servidor?',
    default: true,
  });
}

/**
 * Texto de advertencia TOFU para un host SSH desconocido.
 */
export function formatUnknownHostWarning(info: UnknownHostPromptInfo): string {
  const hostLabel =
    info.port === 22 ? `'${info.host}'` : `'${info.host}:${info.port}'`;

  return [
    `La autenticidad del host ${hostLabel} no pudo establecerse.`,
    `Huella ${info.keyType}: ${info.fingerprint}`,
    'Verificá esta huella con la consola del proveedor del VPS antes de continuar.',
  ].join('\n');
}

/**
 * Confirmación interactiva de una clave de host desconocida (TOFU).
 * Default false: hay que aceptar explícitamente, como `yes` en OpenSSH.
 */
export async function confirmUnknownHost(
  info: UnknownHostPromptInfo
): Promise<boolean> {
  console.log(`\n${formatUnknownHostWarning(info)}\n`);

  return await confirm({
    message: '¿Confiar en este host y guardar la clave en known_hosts?',
    default: false,
  });
}
