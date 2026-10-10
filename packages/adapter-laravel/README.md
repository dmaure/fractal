# adapter-laravel

Adapter de Fractal para Laravel 11.

Este paquete implementa el contrato de adapter (SPEC-0006) para generar proyectos Laravel idiomáticos en tres topologías: monolito, monorepo desacoplado y multirepo.

## Estructura generada

El adapter genera un proyecto Laravel 11 ejecutable con:

### Archivos de configuración
- `composer.json` — dependencias Laravel 11 (laravel/framework ^11.0, laravel/sanctum ^4.0)
- `package.json` — dependencias del SPA React + Vite
- `.env.example` — variables de entorno sin credenciales reales
- `.gitignore` — incluye `.env`, `vendor/`, `node_modules/`, etc.
- `README.md` — instrucciones de inicio

### Esqueleto Laravel ejecutable
- `artisan` — CLI de Laravel (ejecutable con `php artisan`)
- `bootstrap/app.php` — configuración de la aplicación Laravel 11
- `bootstrap/providers.php` — registro de service providers
- `config/app.php` — configuración principal
- `config/database.php` — configuración de base de datos
- `app/Providers/AppServiceProvider.php` — service provider base
- `app/Http/Controllers/Api/HealthController.php` — endpoint /api/health
- `routes/api.php` — rutas API (incluye /api/health)
- `routes/web.php` — rutas web (SPA catch-all)
- `routes/console.php` — comandos Artisan custom
- `database/migrations/` — directorio de migraciones (vacío inicialmente)
- `database/seeders/` — directorio de seeders (vacío inicialmente)
- `storage/` — estructura completa con .gitignore en cada subdirectorio

### Frontend (topología monolito)
- `resources/js/app.tsx` — componente React principal
- `resources/css/app.css` — estilos base
- `public/index.php` — entry point Laravel

### Frontend (topologías monorepo/multirepo)
- `web/src/App.tsx` — componente React principal
- `web/src/main.tsx` — entry point React
- `web/src/App.css` — estilos base
- `web/vite.config.ts` — configuración Vite
- `web/index.html` — HTML del SPA

## Cómo levantar un proyecto generado

### Monolito

```bash
cd mi-proyecto
composer install
cp .env.example .env
php artisan key:generate
php artisan serve
```

El endpoint `/api/health` responde en `http://localhost:8000/api/health`.

Verificar rutas con:

```bash
php artisan route:list
```

### Monorepo desacoplado

```bash
cd mi-proyecto

# Backend
cd api
composer install
cp .env.example .env
php artisan key:generate
php artisan serve  # http://localhost:8000
cd ..

# Frontend
cd web
npm install
npm run dev  # http://localhost:3000
```

### Multirepo

Igual que monorepo, pero `api/` y `web/` son repositorios git independientes (`mi-proyecto-api/` y `mi-proyecto-web/`).

## Decisiones de diseño

### Stubs versionados (ADR-0014)

Los archivos del esqueleto Laravel se generan a partir de stubs TypeScript versionados en este paquete, no mediante `composer create-project`. Esto garantiza:

- **Determinismo:** los snapshots capturan el resultado exacto
- **Offline-first:** `fractal new` funciona sin red (salvo install de dependencias)
- **Control de versión:** coherencia con `laravel/framework ^11.0` declarado en `composer.json`

### Estructura Laravel 11

El adapter genera la estructura de Laravel 11:

- `bootstrap/app.php` usa `Application::configure()` en vez del kernel HTTP/Console separado
- `bootstrap/providers.php` lista los service providers en vez de `config/app.php`
- Routing declarado en `bootstrap/app.php` con named parameters

### Seguridad (Artículo VI de la Constitución)

- `.env.example` no contiene `APP_KEY` real — se genera localmente con `php artisan key:generate`
- `.env` en `.gitignore` desde el primer commit
- Sin credenciales de bases de datos de ejemplo capaces de llegar a producción

### Frontend React + Sanctum Bearer (ADR-0005)

- SPA React compilado con Vite
- Autenticación con Laravel Sanctum en modo API token (Bearer)
- Mismo stack en las tres topologías; solo varía la ubicación del código

## Tests

Cada stub tiene test de snapshot (Artículo X de la Constitución):

```bash
pnpm test
```

Los snapshots se actualizan con:

```bash
pnpm test -- --update-snapshot
```

## Referencias

- `docs/specs/0006-contrato-adapter-v0.md` — contrato del adapter
- `docs/specs/0001-fractal-new-laravel-base.md` — especificación de `fractal new`
- `docs/adr/0014-stubs-laravel-versionados.md` — decisión de usar stubs propios
- `docs/adr/0010-topologia-proyecto-generado-sin-inertia.md` — topologías soportadas
- `docs/adr/0005-frontend-laravel.md` — stack frontend React + Sanctum Bearer
