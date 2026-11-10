import { describe, it, expect, afterEach } from 'vitest';
import {
  validateIpv4,
  validateDomain,
  validateEmail,
  validateGitUrl,
  validateProjectName,
  flagOrEnv,
  readTrimmedEnv,
  isTruthyEnv,
} from './param-validators.js';

describe('param-validators', () => {
  it('acepta IPv4 con octetos 0-255 y rechaza el resto', () => {
    expect(validateIpv4('192.0.2.10')).toBe(true);
    expect(validateIpv4('')).not.toBe(true);
    expect(validateIpv4('not-an-ip')).not.toBe(true);
    expect(typeof validateIpv4('256.1.1.1')).toBe('string');
    expect(typeof validateIpv4('999.999.999.999')).toBe('string');
  });

  it('valida dominio y email con las mismas reglas que deploy', () => {
    expect(validateDomain('example.com')).toBe(true);
    expect(validateDomain('bad domain')).not.toBe(true);
    expect(validateEmail('admin@example.com')).toBe(true);
    expect(validateEmail('nope')).not.toBe(true);
  });

  it('acepta URLs git de GitHub/GitLab o con sufijo .git', () => {
    expect(validateGitUrl('https://github.com/acme/app')).toBe(true);
    expect(validateGitUrl('git@gitlab.com:acme/app.git')).toBe(true);
    expect(validateGitUrl('ftp://x')).not.toBe(true);
    expect(validateGitUrl('')).not.toBe(true);
  });

  it('valida el nombre del proyecto: acepta minúsculas/dígitos/guiones y rechaza el resto (FRA-94)', () => {
    // Nombres válidos usados en la suite y en el día a día.
    expect(validateProjectName('demo')).toBe(true);
    expect(validateProjectName('my-app')).toBe(true);
    expect(validateProjectName('test-project')).toBe(true);
    expect(validateProjectName('miapp')).toBe(true);
    expect(validateProjectName('app1')).toBe(true);
    // Inválidos: mayúsculas, guión bajo, signos y espacios.
    expect(typeof validateProjectName('Bad_Name!')).toBe('string');
    expect(typeof validateProjectName('con espacios')).toBe('string');
    expect(typeof validateProjectName('mal_nombre')).toBe('string');
    expect(typeof validateProjectName('-empieza-con-guion')).toBe('string');
    expect(typeof validateProjectName('')).toBe('string');
  });
});

describe('flagOrEnv / readTrimmedEnv (mapping FRACTAL_NEW_* → FRACTAL_DEPLOY_*)', () => {
  const keys = ['FRACTAL_NEW_SERVER_IP', 'FRACTAL_DEPLOY_SERVER_IP'];

  afterEach(() => {
    for (const key of keys) {
      delete process.env[key];
    }
  });

  it('el flag gana sobre las variables de entorno', () => {
    process.env.FRACTAL_NEW_SERVER_IP = '10.0.0.1';
    process.env.FRACTAL_DEPLOY_SERVER_IP = '10.0.0.2';
    expect(flagOrEnv('  192.0.2.10  ', ...keys)).toBe('192.0.2.10');
  });

  it('FRACTAL_NEW_* gana sobre FRACTAL_DEPLOY_* cuando no hay flag', () => {
    process.env.FRACTAL_NEW_SERVER_IP = '10.0.0.1';
    process.env.FRACTAL_DEPLOY_SERVER_IP = '10.0.0.2';
    expect(flagOrEnv(undefined, ...keys)).toBe('10.0.0.1');
  });

  it('cae a FRACTAL_DEPLOY_* si FRACTAL_NEW_* está ausente', () => {
    process.env.FRACTAL_DEPLOY_SERVER_IP = '10.0.0.2';
    expect(readTrimmedEnv(...keys)).toBe('10.0.0.2');
  });
});

describe('isTruthyEnv', () => {
  it('reconoce 1/true/yes/si', () => {
    expect(isTruthyEnv('1')).toBe(true);
    expect(isTruthyEnv('true')).toBe(true);
    expect(isTruthyEnv('YES')).toBe(true);
    expect(isTruthyEnv('si')).toBe(true);
    expect(isTruthyEnv('no')).toBe(false);
    expect(isTruthyEnv(undefined)).toBe(false);
  });
});
