/**
 * Generador de routes/console.php para Laravel 11.
 */

export function generateConsoleRoutes(): string {
  return `<?php

use Illuminate\\Foundation\\Inspiring;
use Illuminate\\Support\\Facades\\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote')->hourly();
`;
}

/**
 * Genera routes/web.php para las topologías desacopladas (monorepo/multirepo).
 *
 * En estas topologías el backend Laravel es solo-API: expone sus rutas bajo
 * /api (ver routes/api.php) y el SPA se sirve desde el paquete web/. Este
 * archivo debe existir igualmente porque bootstrap/app.php registra el grupo
 * de rutas web con \`withRouting(web: ...)\`; si falta, Laravel falla al
 * arrancar (require de routes/web.php) y \`artisan package:discover\` sale con
 * código 1. No define rutas de aplicación a propósito.
 */
export function generateApiWebRoutes(): string {
  return `<?php

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| Topología desacoplada: el SPA se sirve desde el paquete web/ y el backend
| solo expone su API bajo /api (ver routes/api.php). Este archivo existe
| porque bootstrap/app.php registra el grupo de rutas web; no declara rutas
| de aplicación.
|
*/
`;
}
