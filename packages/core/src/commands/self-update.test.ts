import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { detectInstall } from './self-update.js';
import { readVersion } from '../version.js';

describe('detectInstall', () => {
  it('checkout del monorepo', () => {
    expect(detectInstall('/home/u/fractal/packages/core/dist/cli.js')).toEqual({ kind: 'checkout' });
  });

  it('instalación global: deriva el prefijo', () => {
    expect(detectInstall('/usr/local/lib/node_modules/@fractal/cli/vendor/core/dist/cli.js')).toEqual({
      kind: 'global',
      prefix: '/usr/local',
    });
  });
});

describe('readVersion', () => {
  it('lee la versión del package.json de core', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'));
    expect(readVersion()).toBe(pkg.version);
    expect(readVersion()).not.toBe('0.0.0');
  });
});
