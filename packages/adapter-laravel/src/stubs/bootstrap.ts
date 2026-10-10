/**
 * Generadores de archivos bootstrap/ para Laravel 11.
 */

/**
 * Genera bootstrap/app.php para Laravel 11.
 * 
 * Define la aplicación Laravel y configura routing, middleware y excepciones.
 */
export function generateBootstrapApp(): string {
  return `<?php

use Illuminate\\Foundation\\Application;
use Illuminate\\Foundation\\Configuration\\Exceptions;
use Illuminate\\Foundation\\Configuration\\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        //
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })->create();
`;
}

/**
 * Genera bootstrap/providers.php para Laravel 11.
 * 
 * Define los service providers que la aplicación carga.
 */
export function generateBootstrapProviders(): string {
  return `<?php

return [
    App\\Providers\\AppServiceProvider::class,
];
`;
}

/**
 * Genera bootstrap/cache/.gitignore para Laravel 11.
 * 
 * Ignora todo el contenido de cache/ excepto el propio .gitignore.
 */
export function generateBootstrapCacheGitignore(): string {
  return `*
!.gitignore
`;
}
