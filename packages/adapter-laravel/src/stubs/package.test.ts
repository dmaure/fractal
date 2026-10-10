/**
 * Tests con snapshots para package.json.
 */

import { describe, it, expect } from 'vitest';
import { generatePackageJson } from './package.js';

// El contenido completo de cada variante se cubre en el snapshot del árbol
// (create-project.tree.test.ts); aquí solo aserciones de comportamiento.
describe('generatePackageJson', () => {
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
