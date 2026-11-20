import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getContract } from './contract.js';
import { createFrontend } from './create-frontend.js';
import { getPack } from './get-pack.js';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe('get-contract', () => {
  it('declara kind frontend, platform web y build estático', () => {
    const c = getContract();
    expect(c).toMatchObject({ version: '0', kind: 'frontend', platform: 'web', serve: 'static' });
    expect(c.build).toMatchObject({ buildCommand: 'npm run build', outputDir: 'dist' });
    expect(c.dev).toEqual({ command: 'npm run dev', port: 3000, apiProxy: '/api' });
    expect(c.apiBaseEnv).toBe('VITE_API_URL');
  });

  it('declara el runtime de deploy nginx-only del frontend estático (ex adapter-laravel)', () => {
    expect(getContract().deployRuntime).toEqual({
      services: ['nginx'],
      buildCommand: 'npm run build',
      port: 80,
      healthcheck: { path: '/health.txt' },
    });
  });
});

describe('create-frontend', () => {
  it('escribe el SPA completo en destinationPath', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rv-'));
    dirs.push(root);
    const dest = join(root, 'web');
    const res = await createFrontend({ name: 'My App', destinationPath: dest, mode: 'embedded' });
    expect(res.success).toBe(true);

    expect((await readdir(dest)).sort()).toEqual(['index.html', 'package.json', 'src', 'tsconfig.json', 'vite.config.ts']);
    expect((await readdir(join(dest, 'src'))).sort()).toEqual(['App.css', 'App.tsx', 'lib', 'main.tsx']);
    const pkg = JSON.parse(await readFile(join(dest, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('my-app-web');
    expect(pkg.scripts.build).toBe('vite build');
    expect(await readFile(join(dest, 'vite.config.ts'), 'utf-8')).toContain("'/api': 'http://localhost:8000'");
    expect(await readFile(join(dest, 'src', 'lib', 'api.ts'), 'utf-8')).toContain("import.meta.env.VITE_API_URL ?? ''");
  });
});

describe('create-frontend standalone', () => {
  it('agrega health.txt, .gitignore y README, y mantiene el sufijo -web', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rv-'));
    dirs.push(root);
    const dest = join(root, 'shop-web');
    const res = await createFrontend({ name: 'shop', destinationPath: dest, mode: 'standalone' });
    expect(res.success).toBe(true);
    expect((await readdir(dest)).sort()).toEqual([
      '.gitignore', 'README.md', 'index.html', 'package.json', 'public', 'src', 'tsconfig.json', 'vite.config.ts',
    ]);
    expect(await readFile(join(dest, 'public', 'health.txt'), 'utf-8')).toBe('ok');
    expect(JSON.parse(await readFile(join(dest, 'package.json'), 'utf-8')).name).toBe('shop-web');
  });
});

describe('get-pack', () => {
  it('devuelve las convenciones del frontend, deterministas', () => {
    const a = getPack('p', 'multirepo');
    expect(a).toEqual(getPack('p', 'multirepo'));
    expect(a.files.map((f) => f.path)).toEqual(['fractal/frontends/react-vite.md']);
    expect(a.files[0].contents).toContain('src, en el repo web');
    expect(getPack('p', 'monolith').files[0].contents).toContain('web/src');
  });
});
