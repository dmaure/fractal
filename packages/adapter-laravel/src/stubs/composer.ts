/**
 * Generador de composer.json para proyectos Laravel.
 */

export function generateComposerJson(
  name: string,
  topology: 'monolith' | 'monorepo' | 'multirepo-api'
): string {
  const packageName = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

  const composerConfig = {
    name: `fractal/${packageName}`,
    type: 'project',
    description: `Proyecto Laravel generado por Fractal (${topology})`,
    keywords: ['laravel', 'fractal'],
    license: 'MIT',
    require: {
      php: '^8.2',
      'laravel/framework': '^11.0',
      'laravel/sanctum': '^4.0',
    },
    'require-dev': {
      'laravel/pint': '^1.0',
      'phpunit/phpunit': '^11.0',
    },
    autoload: {
      'psr-4': {
        'App\\': 'app/',
      },
    },
    'autoload-dev': {
      'psr-4': {
        'Tests\\': 'tests/',
      },
    },
    scripts: {
      'post-autoload-dump': [
        'Illuminate\\Foundation\\ComposerScripts::postAutoloadDump',
        '@php artisan package:discover --ansi',
      ],
    },
    extra: {
      'laravel': {
        'dont-discover': [],
      },
    },
    config: {
      'optimize-autoloader': true,
      'preferred-install': 'dist',
      'sort-packages': true,
      'allow-plugins': true,
      'audit': {
        'block': false,
      },
    },
    'minimum-stability': 'stable',
    'prefer-stable': true,
  };

  return JSON.stringify(composerConfig, null, 2);
}
