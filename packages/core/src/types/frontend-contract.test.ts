import { describe, it, expect } from 'vitest';
import { computeLayout, layoutRoot } from './frontend-contract.js';

describe('computeLayout (FRA-115)', () => {
  it('monolith: backend en "." y frontends en web/', () => {
    const l = computeLayout('monolith', 'shop', [{ target: 'fake-web', platform: 'web' }]);
    expect(l.backend.path).toBe('.');
    expect(l.frontends.map((f) => f.path)).toEqual(['web']);
  });

  it('monorepo: api/ + web/ + mobile/', () => {
    const l = computeLayout('monorepo', 'shop', [
      { target: 'fake-web', platform: 'web' },
      { target: 'fake-rn', platform: 'mobile' },
    ]);
    expect(l.backend.path).toBe('api');
    expect(l.frontends.map((f) => f.path)).toEqual(['web', 'mobile']);
  });

  it('multirepo: <nombre>-api + <nombre>-web', () => {
    const l = computeLayout('multirepo', 'shop', [{ target: 'fake-web', platform: 'web' }]);
    expect(l.backend.path).toBe('shop-api');
    expect(l.frontends[0]).toMatchObject({ path: 'shop-web', dir: 'web' });
  });

  it('sin frontends devuelve solo el backend', () => {
    expect(computeLayout('monorepo', 'x').frontends).toEqual([]);
  });

  it('dos frontends de la misma plataforma no colisionan', () => {
    const l = computeLayout('monorepo', 'x', [
      { target: 'a', platform: 'web' },
      { target: 'b', platform: 'web' },
    ]);
    expect(l.frontends.map((f) => f.path)).toEqual(['web', 'web-b']);
  });

  it('layoutRoot: multirepo usa el directorio padre', () => {
    expect(layoutRoot('multirepo', '/tmp/p/shop')).toBe('/tmp/p');
    expect(layoutRoot('monolith', '/tmp/p/shop')).toBe('/tmp/p/shop');
  });
});
