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
