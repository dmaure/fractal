/**
 * Test de regresión: `fractal new` conserva su comportamiento actual
 * tras introducir el contrato de brazo y orquestador (SPEC-0032).
 *
 * Verifica que NewWizardParams se construye igual que antes.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadNewWizardFromEnvAndFlags,
  resolveWizardMode,
  generateDbPassword,
} from '../utils/new-wizard.js';
import type { NewCommandOptions } from '../types/new-command.js';

const ENV_KEYS = [
  'FRACTAL_NEW_PROJECT_NAME',
  'FRACTAL_NEW_TOPOLOGY',
  'FRACTAL_NEW_SERVER_IP',
  'FRACTAL_NEW_SSH_USER',
  'FRACTAL_NEW_AUTH_METHOD',
  'FRACTAL_NEW_SSH_KEY_PATH',
  'FRACTAL_NEW_DOMAIN',
  'FRACTAL_NEW_EMAIL',
  'FRACTAL_NEW_DNS_PROVIDER',
  'FRACTAL_NEW_GITHUB_TOKEN',
  'FRACTAL_NEW_GITHUB_OWNER',
  'FRACTAL_NEW_GITHUB_REPO',
  'FRACTAL_NEW_DB_PASSWORD',
  'FRACTAL_DEPLOY_SERVER_IP',
  'FRACTAL_DEPLOY_SSH_KEY_PATH',
  'FRACTAL_DEPLOY_DOMAIN',
  'FRACTAL_DEPLOY_EMAIL',
];

function clearEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

describe('regresión de NewWizardParams', () => {
  beforeEach(clearEnv);
  afterEach(clearEnv);

  it('modo no interactivo produce NewWizardParams con todos los campos esperados', () => {
    // Set completo vía env (mismo que el test original)
    process.env.FRACTAL_NEW_SERVER_IP = '192.0.2.10';
    process.env.FRACTAL_NEW_SSH_KEY_PATH = '/tmp/id_ed25519';
    process.env.FRACTAL_NEW_DOMAIN = 'app.example.com';
    process.env.FRACTAL_NEW_EMAIL = 'ops@example.com';
    process.env.FRACTAL_NEW_GITHUB_TOKEN = 'ghp_testtoken';

    const params = loadNewWizardFromEnvAndFlags('demo-project', {
      topology: 'monolith',
    });

    // Verificar campos existentes
    expect(params.projectName).toBe('demo-project');
    expect(params.topology).toBe('monolith');
    expect(params.serverIp).toBe('192.0.2.10');
    expect(params.sshUser).toBe('root');
    expect(params.authMethod).toBe('key');
    expect(params.sshKeyPath).toBe('/tmp/id_ed25519');
    expect(params.domain).toBe('app.example.com');
    expect(params.email).toBe('ops@example.com');
    expect(params.githubToken).toBe('ghp_testtoken');
    expect(params.dnsProvider).toBe('manual');
    expect(params.githubRepo).toBe('demo-project');
    expect(params.githubVisibility).toBe('private');
    expect(params.dbPassword).toMatch(/^[0-9a-f]{48}$/);
    expect(params.dbPasswordGenerated).toBe(true);
    expect(params.chainDeploy).toBe(false);

    // La forma de NewWizardParams no ha cambiado
    expect(params).toHaveProperty('projectName');
    expect(params).toHaveProperty('topology');
    expect(params).toHaveProperty('serverIp');
    expect(params).toHaveProperty('sshUser');
    expect(params).toHaveProperty('domain');
    expect(params).toHaveProperty('email');
    expect(params).toHaveProperty('dnsProvider');
    expect(params).toHaveProperty('githubToken');
    expect(params).toHaveProperty('githubRepo');
    expect(params).toHaveProperty('dbPassword');
  });

  it('resolveWizardMode mantiene los tres modos existentes', () => {
    const options: NewCommandOptions = {};

    // non-interactive con flag
    expect(resolveWizardMode({ nonInteractive: true }, true)).toBe('non-interactive');
    expect(resolveWizardMode({ nonInteractive: true }, false)).toBe('non-interactive');

    // interactive con TTY
    expect(resolveWizardMode(options, true)).toBe('interactive');

    // skip en no-TTY
    expect(resolveWizardMode(options, false)).toBe('skip');
  });

  it('generateDbPassword produce el formato esperado (48 hex)', () => {
    const password1 = generateDbPassword();
    const password2 = generateDbPassword();

    expect(password1).toMatch(/^[0-9a-f]{48}$/);
    expect(password2).toMatch(/^[0-9a-f]{48}$/);
    expect(password1).not.toBe(password2);
  });

  it('precedencia flag > FRACTAL_NEW_* > FRACTAL_DEPLOY_* se mantiene', () => {
    process.env.FRACTAL_NEW_SERVER_IP = '192.0.2.10';
    process.env.FRACTAL_DEPLOY_SERVER_IP = '203.0.113.5';
    process.env.FRACTAL_NEW_SSH_KEY_PATH = '/tmp/id_ed25519';
    process.env.FRACTAL_NEW_DOMAIN = 'app.example.com';
    process.env.FRACTAL_NEW_EMAIL = 'ops@example.com';
    process.env.FRACTAL_NEW_GITHUB_TOKEN = 'ghp_testtoken';

    const params = loadNewWizardFromEnvAndFlags('demo', {
      topology: 'monolith',
      serverIp: '198.51.100.1', // flag gana
    });

    expect(params.serverIp).toBe('198.51.100.1'); // flag
    expect(params.domain).toBe('app.example.com'); // FRACTAL_NEW_*
  });

  it('sigue rechazando valores inválidos', () => {
    process.env.FRACTAL_NEW_SERVER_IP = '999.1.1.1'; // inválida
    process.env.FRACTAL_NEW_SSH_KEY_PATH = '/tmp/id';
    process.env.FRACTAL_NEW_DOMAIN = 'app.example.com';
    process.env.FRACTAL_NEW_EMAIL = 'not-an-email'; // inválido
    process.env.FRACTAL_NEW_GITHUB_TOKEN = 'ghp_token';

    expect(() =>
      loadNewWizardFromEnvAndFlags('demo', { topology: 'monolith' })
    ).toThrow(/IP inválida|email inválido/);
  });

  it('los campos no han cambiado de tipo ni de significado', () => {
    process.env.FRACTAL_NEW_SERVER_IP = '192.0.2.10';
    process.env.FRACTAL_NEW_SSH_KEY_PATH = '/tmp/id_ed25519';
    process.env.FRACTAL_NEW_DOMAIN = 'app.example.com';
    process.env.FRACTAL_NEW_EMAIL = 'ops@example.com';
    process.env.FRACTAL_NEW_GITHUB_TOKEN = 'ghp_token';

    const params = loadNewWizardFromEnvAndFlags('demo', { topology: 'multirepo' });

    // Tipos esperados
    expect(typeof params.projectName).toBe('string');
    expect(params.topology).toBe('multirepo');
    expect(typeof params.serverIp).toBe('string');
    expect(typeof params.sshUser).toBe('string');
    expect(params.authMethod === 'key' || params.authMethod === 'password').toBe(true);
    expect(typeof params.domain).toBe('string');
    expect(typeof params.email).toBe('string');
    expect(['cloudflare', 'route53', 'manual']).toContain(params.dnsProvider);
    expect(typeof params.githubToken === 'string' || params.githubToken === undefined).toBe(true);
    expect(typeof params.dbPassword).toBe('string');
    expect(typeof params.dbPasswordGenerated).toBe('boolean');
    expect(typeof params.chainDeploy).toBe('boolean');
  });

  it('FRACTAL_NEW_GITHUB_TOKEN NO se lee de GITHUB_TOKEN (AC-4, FRA-86)', () => {
    // Regresión: el token de GitHub debe leerse SOLO de FRACTAL_NEW_GITHUB_TOKEN
    // o del flag --github-token, NUNCA de GITHUB_TOKEN del entorno
    process.env.GITHUB_TOKEN = 'ghp_should_not_be_used';
    process.env.FRACTAL_NEW_SERVER_IP = '192.0.2.10';
    process.env.FRACTAL_NEW_SSH_KEY_PATH = '/tmp/id_ed25519';
    process.env.FRACTAL_NEW_DOMAIN = 'app.example.com';
    process.env.FRACTAL_NEW_EMAIL = 'ops@example.com';

    const params = loadNewWizardFromEnvAndFlags('demo', { topology: 'monolith' });

    // githubToken debe ser undefined porque no se proveyó FRACTAL_NEW_GITHUB_TOKEN
    expect(params.githubToken).toBeUndefined();

    // Ahora con FRACTAL_NEW_GITHUB_TOKEN seteado
    process.env.FRACTAL_NEW_GITHUB_TOKEN = 'ghp_correct_token';
    const params2 = loadNewWizardFromEnvAndFlags('demo2', { topology: 'monolith' });

    expect(params2.githubToken).toBe('ghp_correct_token');
    expect(params2.githubToken).not.toBe('ghp_should_not_be_used');

    delete process.env.GITHUB_TOKEN;
    delete process.env.FRACTAL_NEW_GITHUB_TOKEN;
  });
});
