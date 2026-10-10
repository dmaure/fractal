/**
 * Tests con snapshots para composer.json.
 */

import { describe, it, expect } from 'vitest';
import { generateComposerJson } from './composer.js';

// El contenido completo de cada variante se cubre en el snapshot del árbol
// (create-project.tree.test.ts); aquí solo aserciones de comportamiento.
describe('generateComposerJson', () => {
  it('normaliza nombres de proyecto con caracteres especiales', () => {
    const result = generateComposerJson('Test Project!', 'monolith');
    const parsed = JSON.parse(result);
    expect(parsed.name).toBe('fractal/test-project');
  });

  it('incluye dependencias Laravel requeridas', () => {
    const result = generateComposerJson('test', 'monolith');
    const parsed = JSON.parse(result);

    expect(parsed.require.php).toBe('^8.2');
    expect(parsed.require['laravel/framework']).toBe('^11.0');
    expect(parsed.require['laravel/sanctum']).toBe('^4.0');
  });

  it('configura autoload PSR-4', () => {
    const result = generateComposerJson('test', 'monolith');
    const parsed = JSON.parse(result);

    expect(parsed.autoload['psr-4']['App\\']).toBe('app/');
    expect(parsed['autoload-dev']['psr-4']['Tests\\']).toBe('tests/');
  });
});
