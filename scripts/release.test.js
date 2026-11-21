import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { packageJsonPaths, setVersion } from './set-version.js';
import { buildCliManifest } from './pack-release.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('versiones', () => {
  it('todos los paquetes del repo tienen la misma versión', () => {
    const versions = new Set(packageJsonPaths().map((p) => JSON.parse(readFileSync(p, 'utf-8')).version));
    expect([...versions]).toHaveLength(1);
  });

  it('setVersion aplica a todos y valida el formato', () => {
    const root = mkdtempSync(join(tmpdir(), 'ver-'));
    mkdirSync(join(root, 'packages', 'a'), { recursive: true });
    writeFileSync(join(root, 'package.json'), '{"version":"0.0.0"}');
    writeFileSync(join(root, 'packages', 'a', 'package.json'), '{"version":"0.0.0"}');
    setVersion('1.2.3', root);
    expect(JSON.parse(readFileSync(join(root, 'packages', 'a', 'package.json'), 'utf-8')).version).toBe('1.2.3');
    expect(() => setVersion('latest', root)).toThrow();
  });
});

describe('buildCliManifest', () => {
  const pkgs = [
    { dir: '/r/packages/core', pkg: { name: '@fractal/core', dependencies: { commander: '^12', '@fractal/deploy': 'workspace:*' } } },
    { dir: '/r/packages/deploy', pkg: { name: '@fractal/deploy', dependencies: { ssh2: '^1' } } },
  ];

  it('vendoriza los @fractal/* y junta las deps externas', () => {
    const m = buildCliManifest(pkgs, '0.1.0');
    expect(m.dependencies).toEqual({
      commander: '^12',
      ssh2: '^1',
      '@fractal/core': 'file:vendor/core',
      '@fractal/deploy': 'file:vendor/deploy',
    });
    expect(JSON.stringify(m)).not.toContain('workspace:');
    expect(m.version).toBe('0.1.0');
  });

  it('falla ante rangos en conflicto', () => {
    const bad = [...pkgs, { dir: '/r/packages/x', pkg: { name: 'x', dependencies: { ssh2: '^2' } } }];
    expect(() => buildCliManifest(bad, '0.1.0')).toThrow(/conflicto/);
  });
});
