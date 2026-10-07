/**
 * Tests con snapshots para package.json.
 */

import { describe, it, expect } from 'vitest';
import { generatePackageJson } from './package.js';

describe('generatePackageJson', () => {
  it('genera package.json válido para monolith', () => {
    const result = generatePackageJson('test-project', 'monolith');
    expect(result).toMatchSnapshot();
  });

  it('genera package.json válido para monorepo-web', () => {
    const result = generatePackageJson('test-web', 'monorepo-web');
    expect(result).toMatchSnapshot();
  });

  it('genera package.json válido para multirepo-web', () => {
    const result = generatePackageJson('test-web', 'multirepo-web');
    expect(result).toMatchSnapshot();
  });

  it('normaliza nombres de proyecto', () => {
    const result = generatePackageJson('Test Project!', 'monolith');
    const parsed = JSON.parse(result);
    expect(parsed.name).toBe('test-project');
  });

  it('incluye React y Vite en devDependencies para monolith', () => {
    const result = generatePackageJson('test', 'monolith');
    const parsed = JSON.parse(result);

    expect(parsed.devDependencies.react).toBeTruthy();
    expect(parsed.devDependencies['react-dom']).toBeTruthy();
    expect(parsed.devDependencies.vite).toBeTruthy();
    expect(parsed.devDependencies['@vitejs/plugin-react']).toBeTruthy();
  });

  it('incluye React como dependency para web packages', () => {
    const result = generatePackageJson('test', 'monorepo-web');
    const parsed = JSON.parse(result);

    expect(parsed.dependencies.react).toBeTruthy();
    expect(parsed.dependencies['react-dom']).toBeTruthy();
  });

  it('configura scripts de Vite', () => {
    const result = generatePackageJson('test', 'monolith');
    const parsed = JSON.parse(result);

    expect(parsed.scripts.dev).toBe('vite');
    expect(parsed.scripts.build).toBe('vite build');
  });
});
