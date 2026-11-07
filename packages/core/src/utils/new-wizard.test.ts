import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { confirm, input, password, select } from '@inquirer/prompts';
import {
  generateDbPassword,
  loadNewWizardFromEnvAndFlags,
  NonInteractiveConfigError,
  NEW_ENV_MAPPING,
  promptNewWizard,
  resolveWizardMode,
  resolveWizardRemoteUrl,
  resolveFrameworkValue,
  resolveDatabaseValue,
  resolveFrontendValue,
  SSH_AUTH_GAPS,
  formatDeployEnvExports,
} from './new-wizard.js';
import type { NewCommandOptions } from '../types/new-command.js';

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  select: vi.fn(),
  password: vi.fn(),
  confirm: vi.fn(),
}));

const ENV_KEYS = [
  'FRACTAL_NEW_PROJECT_NAME',
  'FRACTAL_NEW_TOPOLOGY',
  'FRACTAL_NEW_FRAMEWORK',
  'FRACTAL_NEW_DATABASE',
  'FRACTAL_NEW_FRONTEND',
  'FRACTAL_NEW_SERVER_IP',
  'FRACTAL_NEW_SSH_USER',
  'FRACTAL_NEW_AUTH_METHOD',
  'FRACTAL_NEW_SSH_KEY_PATH',
  'FRACTAL_NEW_SSH_PASSWORD',
  'FRACTAL_NEW_DOMAIN',
  'FRACTAL_NEW_EMAIL',
  'FRACTAL_NEW_DNS_PROVIDER',
  'FRACTAL_NEW_DNS_API_TOKEN',
  'FRACTAL_NEW_GITHUB_TOKEN',
  'FRACTAL_NEW_GITHUB_OWNER',
  'FRACTAL_NEW_GITHUB_REPO',
  'FRACTAL_NEW_GITHUB_VISIBILITY',
  'FRACTAL_NEW_DB_PASSWORD',
  'FRACTAL_NEW_DEPLOY',
  'FRACTAL_NEW_PRODUCTION_BRANCH',
  'FRACTAL_DEPLOY_SERVER_IP',
  'FRACTAL_DEPLOY_SSH_USER',
  'FRACTAL_DEPLOY_AUTH_METHOD',
  'FRACTAL_DEPLOY_SSH_KEY_PATH',
  'FRACTAL_DEPLOY_DOMAIN',
  'FRACTAL_DEPLOY_EMAIL',
  'FRACTAL_DEPLOY_DNS_PROVIDER',
  'FRACTAL_DEPLOY_DNS_API_TOKEN',
  'FRACTAL_DEPLOY_DB_PASSWORD',
  'FRACTAL_DEPLOY_PRODUCTION_BRANCH',
  'GITHUB_TOKEN',
];

function clearEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

const COMPLETE_ENV = {
  FRACTAL_NEW_SERVER_IP: '192.0.2.10',
  FRACTAL_NEW_SSH_KEY_PATH: '/tmp/id_ed25519',
  FRACTAL_NEW_DOMAIN: 'app.example.com',
  FRACTAL_NEW_EMAIL: 'ops@example.com',
  FRACTAL_NEW_GITHUB_TOKEN: 'ghp_testtoken',
};

describe('resolveWizardMode', () => {
  it('usa non-interactive cuando el flag está presente', () => {
    expect(resolveWizardMode({ nonInteractive: true }, true)).toBe('non-interactive');
    expect(resolveWizardMode({ nonInteractive: true }, false)).toBe('non-interactive');
  });

  it('usa interactive solo en TTY sin --non-interactive', () => {
    expect(resolveWizardMode({}, true)).toBe('interactive');
  });

  it('salta el wizard en no-TTY (CI / e2e actual)', () => {
    expect(resolveWizardMode({}, false)).toBe('skip');
    expect(resolveWizardMode({ topology: 'monolith' }, false)).toBe('skip');
  });
});

describe('SSH_AUTH_GAPS', () => {
  it('documenta passphrase y ssh-agent sin fingir soporte', () => {
    const text = SSH_AUTH_GAPS.join(' ');
    expect(text).toMatch(/passphrase/i);
    expect(text).toMatch(/ssh-agent/i);
  });
});

describe('generateDbPassword', () => {
  it('genera 48 caracteres hex (24 bytes) distintos en cada llamada', () => {
    const a = generateDbPassword();
    const b = generateDbPassword();
    expect(a).toMatch(/^[0-9a-f]{48}$/);
    expect(b).toMatch(/^[0-9a-f]{48}$/);
    expect(a).not.toBe(b);
  });
});

describe('loadNewWizardFromEnvAndFlags', () => {
  beforeEach(clearEnv);
  afterEach(clearEnv);

  function load(options: NewCommandOptions = {}, name = 'demo') {
    return loadNewWizardFromEnvAndFlags(name, { topology: 'monolith', ...options });
  }

  it('con señal de deploy pero set incompleto, lista las variables requeridas que faltan', () => {
    // FRA-88: una señal de deploy (--deploy) activa el camino deploy; sin el set
    // completo, falla listando los requeridos. (Sin ninguna señal sería local-only.)
    expect(() => load({ deploy: true })).toThrow(NonInteractiveConfigError);
    try {
      load({ deploy: true });
    } catch (error) {
      expect(error).toBeInstanceOf(NonInteractiveConfigError);
      const message = (error as Error).message;
      expect(message).toContain('FRACTAL_NEW_SERVER_IP');
      expect(message).toContain('FRACTAL_NEW_DOMAIN');
      expect(message).toContain('FRACTAL_NEW_EMAIL');
      // FRA-86: FRACTAL_NEW_GITHUB_TOKEN es opcional, no requerido
      expect(message).not.toContain('FRACTAL_NEW_GITHUB_TOKEN');
      expect(message).toContain('FRACTAL_NEW_SSH_KEY_PATH');
    }
  });

  it('una señal parcial de infra (solo --server-ip) activa deploy y exige el resto', () => {
    // FRA-88: cualquier señal de infra dispara el set requerido completo.
    expect(() => load({ serverIp: '192.0.2.10' })).toThrow(NonInteractiveConfigError);
    try {
      load({ serverIp: '192.0.2.10' });
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('FRACTAL_NEW_DOMAIN');
      expect(message).toContain('FRACTAL_NEW_EMAIL');
      expect(message).toContain('FRACTAL_NEW_SSH_KEY_PATH');
      // El server-ip provisto es válido: no debe aparecer como faltante.
      expect(message).not.toContain('FRACTAL_NEW_SERVER_IP');
    }
  });

  it('acepta el set completo vía FRACTAL_NEW_* y genera DB password', () => {
    Object.assign(process.env, COMPLETE_ENV);
    const params = load();
    expect(params.serverIp).toBe('192.0.2.10');
    expect(params.domain).toBe('app.example.com');
    expect(params.email).toBe('ops@example.com');
    expect(params.githubToken).toBe('ghp_testtoken');
    expect(params.sshKeyPath).toBe('/tmp/id_ed25519');
    expect(params.sshUser).toBe('root');
    expect(params.dnsProvider).toBe('manual');
    expect(params.dbPassword).toMatch(/^[0-9a-f]{48}$/);
    expect(params.dbPasswordGenerated).toBe(true);
    expect(params.githubVisibility).toBe('private');
    expect(params.chainDeploy).toBe(false);
  });

  it('cae a FRACTAL_DEPLOY_* cuando FRACTAL_NEW_* no está', () => {
    process.env.FRACTAL_DEPLOY_SERVER_IP = '203.0.113.5';
    process.env.FRACTAL_DEPLOY_SSH_KEY_PATH = '/keys/id';
    process.env.FRACTAL_DEPLOY_DOMAIN = 'deploy.example.com';
    process.env.FRACTAL_DEPLOY_EMAIL = 'deploy@example.com';
    process.env.FRACTAL_NEW_GITHUB_TOKEN = 'ghp_from_new';
    const params = load();
    expect(params.serverIp).toBe('203.0.113.5');
    expect(params.domain).toBe('deploy.example.com');
    expect(params.email).toBe('deploy@example.com');
  });

  it('el flag gana sobre FRACTAL_NEW_* y FRACTAL_DEPLOY_*', () => {
    Object.assign(process.env, COMPLETE_ENV);
    const params = load({ serverIp: '198.51.100.1', domain: 'flag.example.com' });
    expect(params.serverIp).toBe('198.51.100.1');
    expect(params.domain).toBe('flag.example.com');
  });

  it('FRACTAL_NEW_* gana sobre FRACTAL_DEPLOY_*', () => {
    Object.assign(process.env, COMPLETE_ENV);
    process.env.FRACTAL_DEPLOY_SERVER_IP = '203.0.113.9';
    const params = load();
    expect(params.serverIp).toBe('192.0.2.10');
  });

  it('exige token DNS si el proveedor es cloudflare', () => {
    Object.assign(process.env, COMPLETE_ENV);
    process.env.FRACTAL_NEW_DNS_PROVIDER = 'cloudflare';
    expect(() => load()).toThrow(/DNS_API_TOKEN/);
  });

  it('usa --db-password en vez de generar', () => {
    Object.assign(process.env, COMPLETE_ENV);
    const params = load({ dbPassword: 'super-secret-pass' });
    expect(params.dbPassword).toBe('super-secret-pass');
    expect(params.dbPasswordGenerated).toBe(false);
  });

  it('encadena deploy con FRACTAL_NEW_DEPLOY=true', () => {
    Object.assign(process.env, COMPLETE_ENV);
    process.env.FRACTAL_NEW_DEPLOY = 'true';
    expect(load().chainDeploy).toBe(true);
  });

  it('rechaza IP y email inválidos', () => {
    Object.assign(process.env, COMPLETE_ENV);
    process.env.FRACTAL_NEW_SERVER_IP = '999.1.1.1';
    process.env.FRACTAL_NEW_EMAIL = 'nope';
    expect(() => load()).toThrow(/IP inválida/);
    try {
      load();
    } catch (error) {
      expect((error as Error).message).toContain('email inválido');
    }
  });

  it('NEW_ENV_MAPPING cubre cada campo del wizard con flag y env', () => {
    const fields = NEW_ENV_MAPPING.map((row) => row.field);
    expect(fields).toEqual(expect.arrayContaining([
      'projectName',
      'topology',
      'framework',
      'database',
      'frontend',
      'serverIp',
      'sshUser',
      'sshKeyPath',
      'domain',
      'email',
      'dnsProvider',
      'dnsApiToken',
      'githubToken',
      'dbPassword',
    ]));
    for (const row of NEW_ENV_MAPPING) {
      expect(row.flag.length).toBeGreaterThan(1);
      expect(row.newEnv.startsWith('FRACTAL_NEW_')).toBe(true);
    }
  });

  it('NEW_ENV_MAPPING: framework/database/frontend son FRACTAL_NEW_* sin fallback DEPLOY', () => {
    for (const field of ['framework', 'database', 'frontend']) {
      const row = NEW_ENV_MAPPING.find((r) => r.field === field);
      expect(row).toBeDefined();
      expect(row!.newEnv).toBe(`FRACTAL_NEW_${field.toUpperCase()}`);
      expect(row!.deployEnv).toBeUndefined();
    }
  });

  // FRA-88 AC-9: paridad de los campos de código (framework/database/frontend).
  const FRAMEWORK_OPTS = [
    { value: 'default', name: 'Default', description: 'Framework de prueba' },
  ];

  it('resuelve framework/database/frontend del flag', () => {
    const params = load({ framework: 'default', database: 'postgresql', frontend: 'react-vite' });
    expect(params.framework).toBe('default');
    expect(params.database).toBe('postgresql');
    expect(params.frontend).toBe('react-vite');
  });

  it('resuelve framework/database/frontend de FRACTAL_NEW_*', () => {
    process.env.FRACTAL_NEW_FRAMEWORK = 'default';
    process.env.FRACTAL_NEW_DATABASE = 'postgresql';
    process.env.FRACTAL_NEW_FRONTEND = 'react-vite';
    const params = loadNewWizardFromEnvAndFlags('demo', { topology: 'monolith' }, FRAMEWORK_OPTS, 'default');
    expect(params.framework).toBe('default');
    expect(params.database).toBe('postgresql');
    expect(params.frontend).toBe('react-vite');
  });

  it('el flag gana sobre FRACTAL_NEW_* en los campos de código', () => {
    process.env.FRACTAL_NEW_DATABASE = 'postgresql';
    // flag inválido debe ganar y por lo tanto fallar la validación
    expect(() => load({ database: 'mysql' })).toThrow(/base de datos inválida/);
  });

  it('database default es postgresql cuando no se provee', () => {
    const params = load();
    expect(params.database).toBe('postgresql');
    expect(params.frontend).toBe('react-vite');
  });

  it('database inválida → NonInteractiveConfigError listando opciones válidas', () => {
    expect(() => load({ database: 'mongodb' })).toThrow(NonInteractiveConfigError);
    try {
      load({ database: 'mongodb' });
    } catch (error) {
      expect((error as Error).message).toContain('base de datos inválida');
      expect((error as Error).message).toContain('postgresql');
    }
  });

  it('frontend inválido → NonInteractiveConfigError listando opciones válidas', () => {
    expect(() => load({ frontend: 'angular' })).toThrow(NonInteractiveConfigError);
    try {
      load({ frontend: 'angular' });
    } catch (error) {
      expect((error as Error).message).toContain('frontend inválido');
      expect((error as Error).message).toContain('react-vite');
    }
  });

  // FRA-90: auth-method/dns-provider NO son disparadores de deploy, pero su
  // valor explícito inválido debe rechazarse SIEMPRE, incluso en local-only.
  // Un valor inválido llega como string crudo desde el CLI/env; el cast simula
  // esa entrada sin que el tipado narrow (SshAuthMethod/DnsProvider) la oculte.
  const badAuth = { authMethod: 'invalid' } as unknown as NewCommandOptions;
  const badDns = { dnsProvider: 'bad' } as unknown as NewCommandOptions;

  it('auth-method inválido en local-only (sin infra) → NonInteractiveConfigError', () => {
    expect(() => load(badAuth)).toThrow(NonInteractiveConfigError);
    try {
      load(badAuth);
    } catch (error) {
      expect(error).toBeInstanceOf(NonInteractiveConfigError);
      expect((error as Error).message).toContain('auth method inválido');
      expect((error as Error).message).toContain('key | password');
    }
  });

  it('dns-provider inválido en local-only (sin infra) → NonInteractiveConfigError', () => {
    expect(() => load(badDns)).toThrow(NonInteractiveConfigError);
    try {
      load(badDns);
    } catch (error) {
      expect(error).toBeInstanceOf(NonInteractiveConfigError);
      expect((error as Error).message).toContain('DNS provider inválido');
      expect((error as Error).message).toContain('cloudflare | route53 | manual');
    }
  });

  it('auth-method inválido vía FRACTAL_NEW_AUTH_METHOD en local-only → error', () => {
    process.env.FRACTAL_NEW_AUTH_METHOD = 'nope';
    expect(() => load({})).toThrow(NonInteractiveConfigError);
    try {
      load({});
    } catch (error) {
      expect((error as Error).message).toContain('auth method inválido');
    }
  });

  it('dns-provider inválido vía FRACTAL_NEW_DNS_PROVIDER en local-only → error', () => {
    process.env.FRACTAL_NEW_DNS_PROVIDER = 'nope';
    expect(() => load({})).toThrow(NonInteractiveConfigError);
    try {
      load({});
    } catch (error) {
      expect((error as Error).message).toContain('DNS provider inválido');
    }
  });

  // FRA-90: local-only con valores VÁLIDOS sigue funcionando sin exigir servidor.
  it('local-only con auth-method/dns-provider válidos no lanza y queda local-only', () => {
    const params = load({ authMethod: 'key', dnsProvider: 'manual' });
    expect(params.serverIp).toBe('');
    expect(params.dbPassword).toBe('');
    expect(params.dbPasswordGenerated).toBe(false);
    expect(params.chainDeploy).toBe(false);
    expect(params.authMethod).toBe('key');
    expect(params.dnsProvider).toBe('manual');
  });

  // FRA-90: con infra completa, un auth-method inválido se sigue rechazando
  // (y una sola vez: el error no se duplica).
  it('auth-method inválido con infra completa se sigue rechazando (una sola vez)', () => {
    Object.assign(process.env, COMPLETE_ENV);
    expect(() => load(badAuth)).toThrow(NonInteractiveConfigError);
    try {
      load(badAuth);
    } catch (error) {
      const matches = (error as Error).message.match(/auth method inválido/g) ?? [];
      expect(matches).toHaveLength(1);
    }
  });

  it('dns-provider inválido con infra completa se sigue rechazando (una sola vez)', () => {
    Object.assign(process.env, COMPLETE_ENV);
    expect(() => load(badDns)).toThrow(NonInteractiveConfigError);
    try {
      load(badDns);
    } catch (error) {
      const matches = (error as Error).message.match(/DNS provider inválido/g) ?? [];
      expect(matches).toHaveLength(1);
    }
  });

  it('framework inválido (con opciones del adapter) → error', () => {
    expect(() =>
      loadNewWizardFromEnvAndFlags('demo', { topology: 'monolith', framework: 'rails' }, FRAMEWORK_OPTS, 'default')
    ).toThrow(/framework inválido/);
  });

  it('framework se acepta sin validar si no hay opciones del adapter', () => {
    const params = loadNewWizardFromEnvAndFlags('demo', { topology: 'monolith', framework: 'cualquiera' }, [], undefined);
    expect(params.framework).toBe('cualquiera');
  });

  it('resolveFrameworkValue: ausente cae al default', () => {
    expect(resolveFrameworkValue({}, FRAMEWORK_OPTS, 'default')).toEqual({ value: 'default' });
  });

  it('resolveDatabaseValue / resolveFrontendValue: defaults y errores', () => {
    expect(resolveDatabaseValue({})).toEqual({ value: 'postgresql' });
    expect(resolveFrontendValue({})).toEqual({ value: 'react-vite' });
    expect(resolveDatabaseValue({ database: 'nope' }).error).toMatch(/base de datos inválida/);
    expect(resolveFrontendValue({ frontend: 'nope' }).error).toMatch(/frontend inválido/);
  });

  // FRA-88 AC-9/AC-8: camino local-only no interactivo.
  it('local-only: solo con nombre, sin infra, no lanza y deja serverIp/dbPassword vacíos', () => {
    const params = load();
    expect(params.serverIp).toBe('');
    expect(params.dbPassword).toBe('');
    expect(params.dbPasswordGenerated).toBe(false);
    expect(params.chainDeploy).toBe(false);
    expect(params.domain).toBe('');
    expect(params.email).toBe('');
    expect(params.githubToken).toBeUndefined();
  });

  // FRA-88 AC-5: el token NUNCA se lee de GITHUB_TOKEN.
  it('no lee GITHUB_TOKEN del entorno (regresión AC-5)', () => {
    process.env.GITHUB_TOKEN = 'ghp_ci_token';
    const params = load();
    expect(params.githubToken).toBeUndefined();

    process.env.FRACTAL_NEW_GITHUB_TOKEN = 'ghp_real';
    const params2 = load();
    expect(params2.githubToken).toBe('ghp_real');
  });

  it('GitHub-only local-only: token sin infra ⇒ local-only con token retenido', () => {
    process.env.FRACTAL_NEW_GITHUB_TOKEN = 'ghp_only';
    const params = load();
    expect(params.serverIp).toBe('');
    expect(params.githubToken).toBe('ghp_only');
    expect(params.dbPassword).toBe('');
    expect(params.chainDeploy).toBe(false);
  });
});

describe('formatDeployEnvExports', () => {
  it('no incluye secrets (token, password, db)', () => {
    const lines = formatDeployEnvExports({
      projectName: 'demo',
      topology: 'monolith',
      serverIp: '192.0.2.10',
      sshUser: 'root',
      authMethod: 'key',
      sshKeyPath: '/tmp/id',
      domain: 'example.com',
      email: 'a@example.com',
      dnsProvider: 'manual',
      productionBranch: 'main',
      githubRepo: 'demo',
      githubVisibility: 'private',
      githubToken: 'SECRET',
      dbPassword: 'db-secret',
      dbPasswordGenerated: true,
      chainDeploy: false,
    }, 'https://github.com/acme/demo.git');

    const blob = lines.join('\n');
    expect(blob).toContain('FRACTAL_DEPLOY_SERVER_IP=192.0.2.10');
    expect(blob).toContain('FRACTAL_DEPLOY_GIT_REPOSITORY=https://github.com/acme/demo.git');
    expect(blob).not.toContain('SECRET');
    expect(blob).not.toContain('db-secret');
  });

  it('sin remote no inventa github.com/OWNER', () => {
    const lines = formatDeployEnvExports({
      projectName: 'demo',
      topology: 'monolith',
      serverIp: '192.0.2.10',
      sshUser: 'root',
      authMethod: 'key',
      sshKeyPath: '/tmp/id',
      domain: 'example.com',
      email: 'a@example.com',
      dnsProvider: 'manual',
      productionBranch: 'main',
      githubRepo: 'demo',
      githubVisibility: 'private',
      dbPassword: 'db-secret',
      dbPasswordGenerated: true,
      chainDeploy: false,
    });
    expect(lines.join('\n')).not.toContain('OWNER');
    expect(lines.join('\n')).not.toContain('GIT_REPOSITORY');
  });
});

describe('resolveWizardRemoteUrl', () => {
  it('usa gitRepository cuando existe', () => {
    expect(
      resolveWizardRemoteUrl({
        gitRepository: 'https://github.com/acme/demo.git',
        githubRepo: 'demo',
      })
    ).toBe('https://github.com/acme/demo.git');
  });

  it('arma la URL solo si hay owner y repo', () => {
    expect(
      resolveWizardRemoteUrl({ githubOwner: 'acme', githubRepo: 'demo' })
    ).toBe('https://github.com/acme/demo.git');
  });

  it('no inventa github.com/OWNER/<repo> si falta owner', () => {
    expect(resolveWizardRemoteUrl({ githubRepo: 'demo' })).toBeUndefined();
    expect(resolveWizardRemoteUrl({ githubOwner: '', githubRepo: 'demo' })).toBeUndefined();
  });
});

interface PromptConfig {
  message: string;
  description?: string;
  choices?: Array<{ value: string; name: string; description?: string }>;
}

interface InteractiveAnswers {
  serverIp: string;
  sshUser: string;
  authMethod: 'key' | 'password';
  sshKeyPath: string;
  domain: string;
  email: string;
  dnsProvider: 'cloudflare' | 'route53' | 'manual';
  githubToken: string;
  githubOwner: string;
  dbPasswordMode: 'generate' | 'ask';
  dbPassword: string;
  chainDeploy: boolean;
  projectName?: string;
  topology?: 'monolith' | 'monorepo' | 'multirepo';
}

const INTERACTIVE_DEFAULTS: InteractiveAnswers = {
  serverIp: '192.0.2.10',
  sshUser: 'root',
  authMethod: 'key',
  sshKeyPath: '~/.ssh/id_ed25519',
  domain: 'app.example.com',
  email: 'ops@example.com',
  dnsProvider: 'manual',
  githubToken: '',
  githubOwner: '',
  dbPasswordMode: 'generate',
  dbPassword: 'typed-db-password',
  chainDeploy: false,
};

function setupInteractivePrompts(overrides: Partial<InteractiveAnswers> = {}): {
  answers: InteractiveAnswers;
  order: string[];
} {
  const answers = { ...INTERACTIVE_DEFAULTS, ...overrides };
  const order: string[] = [];

  vi.mocked(input).mockImplementation(((config: PromptConfig) => {
    order.push(`input:${config.message}`);
    if (config.message.includes('Nombre del proyecto')) {
      return Promise.resolve(answers.projectName ?? 'demo');
    }
    if (config.message.includes('IP')) return Promise.resolve(answers.serverIp);
    if (config.message.includes('Usuario SSH')) return Promise.resolve(answers.sshUser);
    if (config.message.includes('clave privada')) return Promise.resolve(answers.sshKeyPath);
    if (config.message.includes('Dominio')) return Promise.resolve(answers.domain);
    if (config.message.includes('Email')) return Promise.resolve(answers.email);
    if (config.message.includes('Owner de GitHub')) return Promise.resolve(answers.githubOwner);
    throw new Error(`input() inesperado: ${config.message}`);
  }) as unknown as typeof input);

  vi.mocked(select).mockImplementation(((config: PromptConfig) => {
    order.push(`select:${config.message}`);
    if (config.message.includes('Framework del backend')) {
      // Devolver el primer valor disponible de las opciones
      const firstChoice = (config as any).choices?.[0]?.value;
      return Promise.resolve(firstChoice || 'test-framework');
    }
    if (config.message.includes('topología')) return Promise.resolve(answers.topology ?? 'monolith');
    if (config.message.includes('Base de datos')) return Promise.resolve('postgresql');
    if (config.message.includes('Framework del frontend')) return Promise.resolve('react-vite');
    if (config.message.includes('autenticación')) return Promise.resolve(answers.authMethod);
    if (config.message.includes('Proveedor DNS')) return Promise.resolve(answers.dnsProvider);
    if (config.message.includes('Contraseña de la base de datos de producción')) {
      return Promise.resolve(answers.dbPasswordMode);
    }
    throw new Error(`select() inesperado: ${config.message}`);
  }) as unknown as typeof select);

  vi.mocked(password).mockImplementation(((config: PromptConfig) => {
    order.push(`password:${config.message}`);
    if (config.message.includes('Token de GitHub')) return Promise.resolve(answers.githubToken);
    if (config.message.includes('Contraseña de la base de datos')) {
      return Promise.resolve(answers.dbPassword);
    }
    throw new Error(`password() inesperado: ${config.message}`);
  }) as unknown as typeof password);

  vi.mocked(confirm).mockImplementation(((config: PromptConfig) => {
    order.push(`confirm:${config.message}`);
    if (config.message.includes('fractal deploy')) return Promise.resolve(answers.chainDeploy);
    throw new Error(`confirm() inesperado: ${config.message}`);
  }) as unknown as typeof confirm);

  return { answers, order };
}

describe('promptNewWizard (rama interactiva, AC-12)', () => {
  beforeEach(() => {
    clearEnv();
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(clearEnv);

  it('pregunta el set no-defaultable en orden, token opcional y repo = nombre', async () => {
    const { order } = setupInteractivePrompts({ githubToken: '' });

    // Sin framework options por ahora (se integrará completamente en futuros tickets)
    const params = await promptNewWizard('demo-app', { topology: 'monolith' }, [], undefined, false);

    expect(order).toEqual([
      'select:Base de datos:',
      'select:Framework del frontend:',
      'input:Dirección IP del VPS:',
      'input:Usuario SSH:',
      'select:Método de autenticación SSH:',
      'input:Ruta a la clave privada SSH:',
      'input:Dominio de la aplicación:',
      'input:Email para notificaciones SSL (Let\'s Encrypt):',
      'select:Proveedor DNS:',
      'password:Token de GitHub para crear el repo (Enter para omitir):',
      'select:Contraseña de la base de datos de producción:',
      'confirm:¿Ejecutar fractal deploy ahora con estos valores?',
    ]);
    expect(params.projectName).toBe('demo-app');
    expect(params.topology).toBe('monolith');
    expect(params.githubToken).toBeUndefined();
    expect(params.githubRepo).toBe('demo-app');
    expect(params.githubOwner).toBeUndefined();
    expect(params.serverIp).toBe('192.0.2.10');
    expect(params.domain).toBe('app.example.com');
    expect(order.some((step) => step.includes('Owner de GitHub'))).toBe(false);
  });

  it('generate-or-ask: generate produce 48 hex y marca dbPasswordGenerated', async () => {
    setupInteractivePrompts({ dbPasswordMode: 'generate' });

    const params = await promptNewWizard('demo', { topology: 'monolith' }, [], undefined, false);

    const dbSelect = vi.mocked(select).mock.calls.find(([config]) =>
      (config as PromptConfig).message.includes('Contraseña de la base de datos de producción')
    );
    expect(dbSelect).toBeDefined();
    const generate = (dbSelect![0] as PromptConfig).choices?.find((choice) => choice.value === 'generate');
    expect(generate?.description).toMatch(/48 caracteres hex/);
    expect(params.dbPassword).toMatch(/^[0-9a-f]{48}$/);
    expect(params.dbPasswordGenerated).toBe(true);
    expect(vi.mocked(password).mock.calls.some(([config]) =>
      (config as PromptConfig).message === 'Contraseña de la base de datos:'
    )).toBe(false);
  });

  it('generate-or-ask: ask usa la contraseña ingresada y no genera', async () => {
    setupInteractivePrompts({ dbPasswordMode: 'ask', dbPassword: 'manual-secret' });

    const params = await promptNewWizard('demo', { topology: 'monolith' }, [], undefined, false);

    expect(params.dbPassword).toBe('manual-secret');
    expect(params.dbPasswordGenerated).toBe(false);
  });

  it('con token pregunta owner y no defaulta el token', async () => {
    setupInteractivePrompts({ githubToken: 'ghp_from_prompt', githubOwner: 'acme' });

    const params = await promptNewWizard('demo', { topology: 'monolith' }, [], undefined, false);

    expect(params.githubToken).toBe('ghp_from_prompt');
    expect(params.githubOwner).toBe('acme');
  });
});

describe('promptNewWizard (rama orquestador real, FRA-84)', () => {
  beforeEach(() => {
    clearEnv();
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(clearEnv);

  it('propaga el projectName del contexto del orquestador (ChecklistArm + CodeArm reales)', async () => {
    // Usuario "ingresa" el nombre del proyecto en el CodeArm.
    vi.mocked(input).mockImplementation(((config: PromptConfig) => {
      if (config.message.includes('Nombre del proyecto')) {
        return Promise.resolve('mi-proyecto-real');
      }
      throw new Error(`input() inesperado: ${config.message}`);
    }) as unknown as typeof input);

    vi.mocked(select).mockImplementation(((config: PromptConfig) => {
      const msg = config.message;
      // ChecklistArm: sin servidor ni GitHub → no se piden infra/github después.
      if (msg.includes('¿Tenés un servidor para desplegar?')) return Promise.resolve('no');
      if (msg.includes('¿Tenés un token de GitHub')) return Promise.resolve('no');
      // CodeArm: framework / topología / base de datos / frontend (defaults).
      if (msg.includes('Framework del backend')) {
        const firstChoice = (config as { choices?: Array<{ value: string }> }).choices?.[0]?.value;
        return Promise.resolve(firstChoice ?? 'test-framework');
      }
      if (msg.includes('topología')) return Promise.resolve('monolith');
      if (msg.includes('Base de datos')) return Promise.resolve('postgresql');
      if (msg.includes('Framework del frontend')) return Promise.resolve('react-vite');
      // Sin servidor el DatabaseArm no corre (FRA-87): no hay prompt de contraseña.
      throw new Error(`select() inesperado: ${msg}`);
    }) as unknown as typeof select);

    vi.mocked(confirm).mockImplementation(((config: PromptConfig) => {
      if (config.message.includes('fractal deploy')) return Promise.resolve(false);
      throw new Error(`confirm() inesperado: ${config.message}`);
    }) as unknown as typeof confirm);

    const frameworkOptions = [
      { value: 'test-framework', name: 'Test FW', description: 'Framework de prueba' },
    ];

    // useOrchestrator=true: ejercita el bloque de orquestador real (new-wizard.ts
    // líneas 326-346 + guard 369), donde vivía el bug de shadowing de projectName.
    const params = await promptNewWizard(
      undefined,
      {},
      frameworkOptions,
      'test-framework',
      true
    );

    expect(params.projectName).toBe('mi-proyecto-real');
    // FRA-87: local-only ⇒ ni se pide ni se genera DB_PASSWORD, ni se ofrece deploy
    expect(params.dbPassword).toBe('');
    expect(params.dbPasswordGenerated).toBe(false);
    expect(params.chainDeploy).toBe(false);
    expect(password).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });
});
