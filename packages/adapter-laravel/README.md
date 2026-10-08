# @fractal/adapter-laravel

Adapter para Laravel que implementa el contrato v0 de Fractal.

Este paquete contiene **todo** el conocimiento de Laravel, cumpliendo con el Artículo II de la Constitución: `packages/core` y `packages/deploy` no contienen ninguna referencia a Laravel.

## Contrato del Adapter v0

Implementa [SPEC-0006: Contrato del adapter v0](../../docs/specs/0006-contrato-adapter-v0.md).

### AC-1: Comando "crear proyecto base"

```typescript
import { createProject } from '@fractal/adapter-laravel';

const response = await createProject({
  name: 'mi-proyecto',
  topology: 'monolith', // 'monolith' | 'monorepo' | 'multirepo'
  destinationPath: '/path/to/destination',
  target: 'laravel',
});

if (response.success) {
  console.log(`Proyecto generado en: ${response.data.projectPath}`);
} else {
  console.error(`Error: ${response.error.message}`);
}
```

### AC-2: Declaración de versión mínima de runtime

El adapter declara los requisitos de runtime para proyectos Laravel:

- **PHP**: >= 8.2.0
- **Composer**: >= 2.5.0

```typescript
import { getAdapterContract } from '@fractal/adapter-laravel';

const contract = getAdapterContract();
console.log(contract.runtimeRequirements.binaries);
// [
//   { name: 'php', minVersion: '8.2.0', displayName: 'PHP' },
//   { name: 'composer', minVersion: '2.5.0', displayName: 'Composer' }
// ]
```

### AC-3: Declaración de runtime de deploy

El adapter expone dos configuraciones de runtime según el contexto:

**Backend completo** (monolith, monorepo api/):
```typescript
{
  services: ['app', 'nginx', 'db', 'cache', 'worker', 'scheduler'],
  buildCommand: 'composer install --no-dev --optimize-autoloader',
  migrateCommand: 'php artisan migrate --force',
  port: 8000,
  healthcheck: { path: '/api/health' }
}
```

**Frontend estático** (multirepo web/):
```typescript
{
  services: ['nginx'],
  buildCommand: 'npm run build',
  port: 80,
  healthcheck: { path: '/health.txt' }
}
```

## Topologías soportadas

Implementa [ADR-0010: Topología del proyecto generado](../../docs/adr/0010-topologia-proyecto-generado-sin-inertia.md).

### Monolith

Un repositorio sin packages separados. El SPA (React + Vite) vive en `resources/js` y consume rutas bajo `/api` del mismo Laravel.

**Estructura generada:**
```
mi-proyecto/
├── app/
│   └── Http/Controllers/Api/
├── resources/
│   ├── js/
│   └── css/
├── public/
├── routes/
│   ├── api.php
│   └── web.php
├── composer.json
├── package.json
└── .env.example
```

### Monorepo

Un repositorio con `api/` (Laravel) y `web/` (SPA Vite) como packages, orquestados con Turborepo.

**Estructura generada:**
```
mi-proyecto/
├── api/
│   ├── app/
│   ├── routes/
│   ├── composer.json
│   └── .env.example
├── web/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
├── turbo.json
└── package.json (raíz)
```

### Multirepo

Dos carpetas de proyecto separadas, cada una su propio repositorio git.

**Estructura generada:**
```
mi-proyecto-api/
├── app/
├── routes/
├── composer.json
├── .env.example
└── fractal.project.yml

mi-proyecto-web/
├── src/
├── public/
│   └── health.txt
├── package.json
├── vite.config.ts
└── fractal.project.yml
```

Los archivos `fractal.project.yml` contienen manifiestos para coordinación en el primer `fractal deploy` ([ADR-0012](../../docs/adr/0012-deploy-multirepo-orquestacion-inicial.md)).

## Stack de frontend

Implementa [ADR-0005: Frontend Laravel](../../docs/adr/0005-frontend-laravel.md):

- **Framework SPA**: React 18
- **Build**: Vite 5
- **Autenticación**: Laravel Sanctum en modo API token (Bearer)

Las tres topologías comparten el mismo stack de frontend. Solo difieren en dónde vive el código.

## Propagación de errores

Cumple con [SPEC-0002 AC-3](../../docs/specs/0002-bridge-node-toolchain.md):

```typescript
{
  success: false,
  error: {
    message: "Error al generar monolito: EACCES permission denied",
    step: "generación-monolito"
  }
}
```

Los errores son legibles y no exponen stacktraces crudos.

## Tests

Este paquete incluye:

- Tests unitarios de cada generador de topología
- Tests de propagación de errores
- **Snapshots** de los stubs generados (Artículo X de la Constitución)

```bash
pnpm test
```

## Lint de acoplamiento

El CI verifica que este paquete no filtra conocimiento de Laravel hacia `packages/core` o `packages/deploy`:

```bash
pnpm lint:coupling
```

Términos prohibidos fuera de `packages/adapter-*`: `laravel`, `artisan`, `eloquent`, `blade`, `composer`.

## Referencias

- [SPEC-0006: Contrato del adapter v0](../../docs/specs/0006-contrato-adapter-v0.md)
- [ADR-0002: Arquitectura multi-target](../../docs/adr/0002-arquitectura-multi-target.md)
- [ADR-0005: Frontend Laravel](../../docs/adr/0005-frontend-laravel.md)
- [ADR-0010: Topología del proyecto generado](../../docs/adr/0010-topologia-proyecto-generado-sin-inertia.md)
- [Constitución de Fractal](../../docs/CONSTITUTION.md)
