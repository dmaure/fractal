import { describe, it, expect } from 'vitest';
import { DEFAULT_DNS_RECORDS, evaluateDnsPropagation, isRootDomain } from './types.js';

describe('isRootDomain', () => {
  it('considera raíz a un dominio apex de 2 etiquetas', () => {
    expect(isRootDomain('codigofractal.dev')).toBe(true);
    expect(isRootDomain('example.com')).toBe(true);
  });

  it('considera subdominio a un dominio de 3 o más etiquetas', () => {
    expect(isRootDomain('prueba.codigofractal.dev')).toBe(false);
    expect(isRootDomain('a.b.example.com')).toBe(false);
  });
});

describe('DEFAULT_DNS_RECORDS', () => {
  const ip = '192.0.2.1';

  it('incluye la variante www para el dominio raíz (FRA-71)', () => {
    const records = DEFAULT_DNS_RECORDS('codigofractal.dev', ip);

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ type: 'A', name: '@', value: ip });
    expect(records[1]).toMatchObject({ type: 'A', name: 'www', value: ip });
    // El FQDN efectivo del registro www sería www.codigofractal.dev.
    expect(records.some(r => r.name === 'www')).toBe(true);
  });

  it('NO incluye la variante www cuando el dominio ya es un subdominio (FRA-71)', () => {
    const records = DEFAULT_DNS_RECORDS('prueba.codigofractal.dev', ip);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ type: 'A', name: '@', value: ip });
    expect(records.some(r => r.name === 'www')).toBe(false);
  });
});

describe('evaluateDnsPropagation (FRA-71 / FRA-73)', () => {
  const ip = '192.0.2.1';

  it('en dominio raíz exige root y www', () => {
    const ok = evaluateDnsPropagation('codigofractal.dev', ip, ip, ip);
    expect(ok.propagated).toBe(true);
    expect(ok.wwwIp).toBe(ip);

    const onlyRoot = evaluateDnsPropagation('codigofractal.dev', ip, ip, null);
    expect(onlyRoot.propagated).toBe(false);
    expect(onlyRoot.message).toContain('www=sin resolver');
  });

  it('en subdominio alcanza con el A del subdominio; no exige www', () => {
    const ok = evaluateDnsPropagation('e2e-1.codigofractal.dev', ip, ip, null);
    expect(ok.propagated).toBe(true);
    expect(ok.rootIp).toBe(ip);
    expect(ok.wwwIp).toBeUndefined();
    expect(ok.message).not.toContain('www=');

    const missing = evaluateDnsPropagation('e2e-1.codigofractal.dev', ip, null, null);
    expect(missing.propagated).toBe(false);
    expect(missing.message).toContain('root=sin resolver');
    expect(missing.message).not.toContain('www=');
  });
});
