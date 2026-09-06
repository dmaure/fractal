import { describe, it, expect } from 'vitest';
import { formatUnknownHostWarning } from './deploy-prompts.js';

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
