/**
 * Tests con snapshots para package.json.
 */

import { describe, it, expect } from 'vitest';
import { generatePackageJson } from './package.js';

// El contenido completo de cada variante se cubre en el snapshot del árbol
// (create-project.tree.test.ts); aquí solo aserciones de comportamiento.
describe('generatePackageJson', () => {
  it('normaliza nombres de proyecto', () => {
    const result = generatePackageJson('Test Project!', 'monorepo-web');
    const parsed = JSON.parse(result);
    expect(parsed.name).toBe('test-project');
  });

  it('incluye React como dependency para web packages', () => {
    const result = generatePackageJson('test', 'monorepo-web');
    const parsed = JSON.parse(result);

    expect(parsed.dependencies.react).toBeTruthy();
    expect(parsed.dependencies['react-dom']).toBeTruthy();
  });

  it('configura scripts de Vite', () => {
    const result = generatePackageJson('test', 'monorepo-web');
    const parsed = JSON.parse(result);

    expect(parsed.scripts.dev).toBe('vite');
    expect(parsed.scripts.build).toBe('vite build');
  });
});
