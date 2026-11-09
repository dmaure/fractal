/**
 * Tests con snapshots para composer.json.
 */

import { describe, it, expect } from 'vitest';
import { generateComposerJson } from './composer.js';
import { generateDockerfile } from './dockerfile.js';
import { PHP_VERSION } from './php-version.js';

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
    expect(parsed.require['laravel/framework']).toBe('^12.0');
    expect(parsed.require['laravel/sanctum']).toBe('^4.0');
  });

  it('configura autoload PSR-4', () => {
    const result = generateComposerJson('test', 'monolith');
    const parsed = JSON.parse(result);

    expect(parsed.autoload['psr-4']['App\\']).toBe('app/');
    expect(parsed['autoload-dev']['psr-4']['Tests\\']).toBe('tests/');
  });

  it('fija config.platform.php para alinear el lock con la imagen Docker (FRA-92)', () => {
    const parsed = JSON.parse(generateComposerJson('test', 'monolith'));
    expect(parsed.config.platform.php).toBe('8.3.0');
  });

  it('config.platform.php coincide con el PHP de la imagen Docker generada (FRA-92)', () => {
    const composer = JSON.parse(generateComposerJson('test', 'monolith'));
    const platformPhp = composer.config.platform.php; // '8.3.0'

    const dockerfile = generateDockerfile();

    // El pin de composer y el tag de la imagen Docker deben derivar de la misma
    // serie de PHP; si un futuro bump mueve solo uno, este test falla.
    expect(dockerfile).toContain(`php:${PHP_VERSION}-fpm`);
    expect(platformPhp.startsWith(`${PHP_VERSION}.`)).toBe(true);
  });
});
