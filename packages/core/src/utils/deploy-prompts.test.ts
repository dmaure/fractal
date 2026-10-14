import { describe, it, expect, vi, beforeEach } from 'vitest';
import { input, select, password } from '@inquirer/prompts';
import { formatUnknownHostWarning, promptDeployParams } from './deploy-prompts.js';
import type { DeployParams } from '../types/deploy-command.js';

// Mock de @inquirer/prompts: vitest sube (hoist) esta llamada por encima de los
// imports estáticos, así que `promptDeployParams` ve estos dobles y no abre
// prompts reales. Las respuestas se despachan por el `message` de cada prompt
// (ver `setupPrompts`), de modo que el test no depende del orden de llamada.
vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  select: vi.fn(),
  password: vi.fn(),
  confirm: vi.fn(),
}));

describe('formatUnknownHostWarning', () => {
  it('debe mostrar huella y pedir verificación con el proveedor', () => {
    const warning = formatUnknownHostWarning({
      host: '192.0.2.10',
      port: 22,
      keyType: 'ssh-ed25519',
      fingerprint: 'SHA256:gZ7anTmGEBA09pySSmVoubDeE+2oQlXxOTHXGJj0XFM',
    });

    expect(warning).toContain("'192.0.2.10'");
    expect(warning).toContain('ssh-ed25519');
    expect(warning).toContain('SHA256:gZ7anTmGEBA09pySSmVoubDeE+2oQlXxOTHXGJj0XFM');
    expect(warning).toContain('proveedor del VPS');
  });

  it('debe incluir el puerto cuando no es el 22', () => {
    const warning = formatUnknownHostWarning({
      host: '192.0.2.10',
      port: 2222,
      keyType: 'ssh-ed25519',
      fingerprint: 'SHA256:test',
    });

    expect(warning).toContain("'192.0.2.10:2222'");
  });
});

/**
 * Config mínima que leemos de cada prompt en los tests. Los prompts reales
 * reciben bastantes más campos, pero para despachar respuestas y para capturar
 * validadores solo necesitamos `message` y `validate`.
 */
interface PromptConfig {
  message: string;
  validate?: (value: string) => boolean | string | Promise<boolean | string>;
}

/** Respuestas canónicas de un flujo completo; cada test sobreescribe lo suyo. */
interface Answers {
  serverIp: string;
  sshUser: string;
  authMethod: 'key' | 'password';
  sshKeyPath: string;
  sshPassword: string;
  domain: string;
  email: string;
  dnsProvider: 'cloudflare' | 'route53' | 'manual';
  cloudflareToken: string;
  awsCreds: string;
  gitRepository: string;
  productionBranch: string;
  siblingGitUrl: string;
  siblingDomain: string;
}

const DEFAULT_ANSWERS: Answers = {
  serverIp: '192.0.2.10',
  sshUser: 'root',
  authMethod: 'key',
  sshKeyPath: '~/.ssh/id_rsa',
  sshPassword: 'hunter2',
  domain: 'example.com',
  email: 'admin@example.com',
  dnsProvider: 'cloudflare',
  cloudflareToken: 'cf-token-123',
  awsCreds: 'AKIA123:secret456',
  gitRepository: 'https://github.com/acme/app.git',
  productionBranch: 'main',
  siblingGitUrl: 'https://github.com/acme/web.git',
  siblingDomain: 'web.example.com',
};

// --- Despacho por substring del `message` ---------------------------------
// Un mensaje no mapeado hace throw para que un prompt inesperado falle
// ruidosamente en vez de devolver `undefined` silenciosamente.

function resolveInput(message: string, a: Answers): string {
  // El hermano usa 'repositorio git del <rol>' (minúscula); el repo propio usa
  // 'URL del repositorio Git' (mayúscula). Se chequea el hermano primero.
  if (message.includes('repositorio git del')) return a.siblingGitUrl;
  if (message.includes('Dominio donde vivirá')) return a.siblingDomain;
  if (message.includes('IP')) return a.serverIp;
  if (message.includes('Usuario SSH')) return a.sshUser;
  if (message.includes('clave privada')) return a.sshKeyPath;
  if (message.includes('URL del repositorio Git')) return a.gitRepository;
  if (message.includes('Dominio de la aplicación')) return a.domain;
  if (message.includes('Email')) return a.email;
  if (message.includes('Rama')) return a.productionBranch;
  throw new Error(`input() inesperado con message: ${message}`);
}

function resolveSelect(message: string, a: Answers): string {
  if (message.includes('autenticación')) return a.authMethod;
  if (message.includes('Proveedor DNS')) return a.dnsProvider;
  throw new Error(`select() inesperado con message: ${message}`);
}

function resolvePassword(message: string, a: Answers): string {
  if (message.includes('Contraseña SSH')) return a.sshPassword;
  if (message.includes('Cloudflare API Token')) return a.cloudflareToken;
  if (message.includes('AWS Access Key')) return a.awsCreds;
  throw new Error(`password() inesperado con message: ${message}`);
}

/**
 * Instala implementaciones mockeadas de input/select/password que responden
 * según el `message`. Devuelve el set de respuestas efectivo para poder
 * compararlo en los asserts. El `as unknown as typeof ...` es necesario porque
 * los prompts reales devuelven un `CancelablePromise`, no un `Promise` pelado.
 */
function setupPrompts(overrides: Partial<Answers> = {}): Answers {
  const answers: Answers = { ...DEFAULT_ANSWERS, ...overrides };

  vi.mocked(input).mockImplementation(
    ((config: PromptConfig) =>
      Promise.resolve(resolveInput(config.message, answers))) as unknown as typeof input
  );
  vi.mocked(select).mockImplementation(
    ((config: PromptConfig) =>
      Promise.resolve(resolveSelect(config.message, answers))) as unknown as typeof select
  );
  vi.mocked(password).mockImplementation(
    ((config: PromptConfig) =>
      Promise.resolve(resolvePassword(config.message, answers))) as unknown as typeof password
  );

  return answers;
}

/** Busca el `validate` pasado al prompt `input` cuyo message contenga el texto. */
function findInputValidate(
  messageSubstring: string
): PromptConfig['validate'] | undefined {
  const call = vi
    .mocked(input)
    .mock.calls.find(([config]) =>
      (config as PromptConfig).message.includes(messageSubstring)
    );
  return call ? (call[0] as PromptConfig).validate : undefined;
}

describe('promptDeployParams (AC-1 · recolección de datos)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // El flujo imprime encabezados de sección con console.log; lo silenciamos.
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('debe recolectar todos los datos de AC-1 (clave SSH + DNS Cloudflare, sin hermano)', async () => {
    setupPrompts();

    const result: DeployParams = await promptDeployParams();

    // Todos los campos de AC-1 presentes en el objeto devuelto.
    expect(result).toMatchObject({
      serverIp: '192.0.2.10',
      sshUser: 'root',
      authMethod: 'key',
      sshKeyPath: '~/.ssh/id_rsa',
      domain: 'example.com',
      email: 'admin@example.com',
      dnsProvider: 'cloudflare',
      dnsApiToken: 'cf-token-123',
      gitRepository: 'https://github.com/acme/app.git',
      productionBranch: 'main',
    });
    expect(result.siblingInfo).toBeUndefined();

    // Y el usuario fue efectivamente consultado por cada dato de AC-1:
    // IP, usuario SSH, dominio, repositorio Git y rama de producción.
    expect(input).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('IP') })
    );
    expect(input).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Usuario SSH') })
    );
    expect(input).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Dominio de la aplicación') })
    );
    expect(input).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('URL del repositorio Git') })
    );
    expect(input).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Rama') })
    );
    // Método de autenticación y proveedor DNS (selects).
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('autenticación') })
    );
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Proveedor DNS') })
    );
    // Credencial DNS pedida como password (no se muestra en claro).
    expect(password).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Cloudflare API Token') })
    );
  });

  it('debe pedir la contraseña SSH cuando el método de autenticación es "password"', async () => {
    setupPrompts({ authMethod: 'password', dnsProvider: 'manual' });

    const result = await promptDeployParams();

    expect(result.authMethod).toBe('password');
    expect(result.sshPassword).toBe('hunter2');
    expect(result.sshKeyPath).toBeUndefined();

    // Se emitió el prompt de contraseña y NO el de ruta de clave privada.
    expect(password).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Contraseña SSH') })
    );
    expect(input).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('clave privada') })
    );
  });

  it('debe omitir la credencial DNS cuando el proveedor es "manual"', async () => {
    setupPrompts({ dnsProvider: 'manual' });

    const result = await promptDeployParams();

    expect(result.dnsProvider).toBe('manual');
    expect(result.dnsApiToken).toBeUndefined();
    // Con clave SSH + DNS manual no hay ningún prompt de password.
    expect(password).not.toHaveBeenCalled();
  });

  it('debe recolectar las credenciales AWS en formato ACCESS_KEY:SECRET_KEY para Route53', async () => {
    setupPrompts({ dnsProvider: 'route53' });

    // NOTA: recolectar la credencial de Route53 a NIVEL DE PROMPT es intencional,
    // aunque `fractal deploy` rechaza `route53` aguas abajo (solo Cloudflare y manual
    // están soportados, según spec §10 nota AC-3/5/6). Este test verifica el
    // comportamiento actual del prompt, no el soporte end-to-end del proveedor.
    const result = await promptDeployParams();

    expect(result.dnsProvider).toBe('route53');
    expect(result.dnsApiToken).toBe('AKIA123:secret456');
    expect(result.dnsApiToken).toContain(':');
    expect(password).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('AWS Access Key') })
    );
  });

  it('debe normalizar los datos: trim en todos los strings, lowercase en dominio y email', async () => {
    setupPrompts({
      serverIp: '  192.0.2.10  ',
      sshUser: '  deploy  ',
      sshKeyPath: '  ~/.ssh/key  ',
      domain: '  EXAMPLE.COM  ',
      email: '  Admin@Example.COM ',
      gitRepository: '  https://github.com/acme/app.git  ',
      productionBranch: '  production  ',
    });

    const result = await promptDeployParams();

    expect(result.domain).toBe('example.com');
    expect(result.email).toBe('admin@example.com');
    expect(result.serverIp).toBe('192.0.2.10');
    expect(result.sshUser).toBe('deploy');
    expect(result.sshKeyPath).toBe('~/.ssh/key');
    expect(result.gitRepository).toBe('https://github.com/acme/app.git');
    expect(result.productionBranch).toBe('production');
  });

  it('debe recolectar la info del hermano en la coordinación inicial multirepo (ADR-0012)', async () => {
    setupPrompts({
      siblingGitUrl: '  https://github.com/acme/web.git  ',
      siblingDomain: '  WEB.EXAMPLE.COM ',
    });

    // currentRole 'api' => el hermano es 'web'; los prompts mencionan 'web'.
    const result = await promptDeployParams(true, 'api');

    expect(result.siblingInfo).toBeDefined();
    expect(result.siblingInfo?.gitUrl).toBe('https://github.com/acme/web.git');
    expect(result.siblingInfo?.domain).toBe('web.example.com');

    expect(input).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('repositorio git del web') })
    );
    expect(input).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Dominio donde vivirá el web') })
    );
  });

  it('no debe preguntar por el hermano cuando askSiblingInfo es false (default)', async () => {
    setupPrompts();

    const result = await promptDeployParams();

    expect(result.siblingInfo).toBeUndefined();
    expect(input).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('repositorio git del') })
    );
  });

  it('debe instalar validadores de AC-1 que rechazan datos inválidos y aceptan válidos', async () => {
    setupPrompts();
    await promptDeployParams();

    // IP: rechaza texto no-IP y vacío, acepta un IPv4.
    // AC-1 queda fijado (pinned) a aceptar SOLO IPv4 bien formadas (octetos 0-255):
    // además de rechazar no-IP y vacío, ahora rechaza octetos fuera de rango.
    const ipValidate = findInputValidate('IP');
    expect(ipValidate).toBeDefined();
    expect(ipValidate!('not-an-ip')).not.toBe(true);
    expect(ipValidate!('')).not.toBe(true);
    expect(ipValidate!('192.0.2.10')).toBe(true);
    // Octetos fuera de rango deben rechazarse (devuelven un string de error).
    expect(typeof ipValidate!('999.999.999.999')).toBe('string');
    expect(typeof ipValidate!('256.1.1.1')).toBe('string');

    // Dominio: rechaza un dominio con espacios, acepta uno válido.
    const domainValidate = findInputValidate('Dominio de la aplicación');
    expect(domainValidate).toBeDefined();
    expect(domainValidate!('bad domain')).not.toBe(true);
    expect(domainValidate!('example.com')).toBe(true);

    // Email: rechaza algo sin formato de email, acepta uno válido.
    const emailValidate = findInputValidate('Email');
    expect(emailValidate).toBeDefined();
    expect(emailValidate!('nope')).not.toBe(true);
    expect(emailValidate!('admin@example.com')).toBe(true);

    // Repositorio Git: rechaza una URL sin marcadores de git, acepta GitHub.
    const gitValidate = findInputValidate('URL del repositorio Git');
    expect(gitValidate).toBeDefined();
    expect(gitValidate!('ftp://x')).not.toBe(true);
    expect(gitValidate!('https://github.com/acme/app')).toBe(true);
  });
});
