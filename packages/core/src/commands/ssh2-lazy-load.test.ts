import { describe, it, expect, vi } from 'vitest';

/**
 * Regresión de FRA-46.
 *
 * `@fractal/deploy` arrastra `ssh2` (módulo nativo con interop CommonJS/ESM
 * problemática). Antes, `packages/core/src/commands/deploy.ts` importaba
 * `@fractal/deploy` de forma ESTÁTICA, así que cargar el CLI —y por lo tanto
 * cualquier comando, incluido `fractal status`— disparaba la carga de `ssh2`
 * y rompía el binario entero incluso antes de poder correr `status`.
 *
 * Estos tests fijan que:
 *  - importar el módulo del comando deploy NO carga `@fractal/deploy`, y
 *  - cargar el módulo del CLI completo tampoco lo hace.
 *
 * `@fractal/deploy` es la única vía por la que el core llega a `ssh2`, así que
 * no cargarlo garantiza que ni el CLI ni `fractal status` requieran `ssh2`.
 */
const loadState = vi.hoisted(() => ({ deployPkgLoaded: false }));

vi.mock('@fractal/deploy', () => {
  // Se ejecuta solo si algún módulo importa `@fractal/deploy` (estáticamente o
  // vía `import()`), momento en que marcamos que la dependencia se cargó.
  loadState.deployPkgLoaded = true;
  const NoopClass = class {};
  return {
    SshClient: NoopClass,
    ServerValidator: NoopClass,
    ManifestManager: NoopClass,
    CrossVarWriter: NoopClass,
    SystemHardening: NoopClass,
    RuntimeManager: NoopClass,
    DnsManager: { setup: async () => ({}) },
    StateManager: NoopClass,
    SslManager: NoopClass,
    adaptSshClient: () => ({}),
    CicdManager: NoopClass,
  };
});

describe('FRA-46: carga diferida de @fractal/deploy (ssh2)', () => {
  it('importar el comando deploy no carga @fractal/deploy', async () => {
    await import('./deploy.js');
    expect(loadState.deployPkgLoaded).toBe(false);
  });

  it('cargar el CLI no carga @fractal/deploy (ni ssh2)', async () => {
    await import('../cli.js');
    expect(loadState.deployPkgLoaded).toBe(false);
  });

  it('el comando status no depende de @fractal/deploy', async () => {
    const mod = await import('./status.js');
    expect(typeof mod.statusCommand).toBe('function');
    expect(loadState.deployPkgLoaded).toBe(false);
  });
});
