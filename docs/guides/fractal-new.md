# Guía de usuario: `fractal new`

`fractal new` genera un proyecto base listo para desarrollo y deploy. Esta
guía describe el flujo real del comando y sus tres topologías, con el adapter
de referencia (Laravel) instalado.

> Fuente de verdad: el comando vive en `packages/core`
> (`src/commands/new.ts`) y delega la generación al adapter vía el bridge
> (SPEC-0002). Los requisitos de runtime y la estructura generada los declara
> `packages/adapter-laravel` (SPEC-0006). Esta guía refleja el código en
> `master`; si algo diverge, el código manda.

---

## Sinopsis

```bash
fractal new <nombre-del-proyecto> [opciones]
```

| Opción | Descripción |
|---|---|
| `-t, --topology <topología>` | Topología a generar: `monolith`, `monorepo` o `multirepo`. Si se omite, se pregunta de forma interactiva. |
| `-f, --force` | Permite generar sobre un directorio que ya existe y **no** está vacío. |

Si no se pasa `--topology`, el comando abre un prompt interactivo con las tres
opciones; la opción por defecto es **monolito** (`DEFAULT_TOPOLOGY`).

---

## Requisitos previos

Antes de generar, `fractal new` consulta al adapter su declaración de runtime
(`RuntimeRequirements`) y verifica que los binarios estén instalados **y** que
cumplan la versión mínima. Con el adapter Laravel, los requisitos declarados
son:

| Binario | Versión mínima | Origen en el código |
|---|---|---|
| PHP | **8.2.0** | `LARAVEL_RUNTIME_REQUIREMENTS` en `packages/adapter-laravel/src/contract.ts` |
| Composer | **2.5.0** | `LARAVEL_RUNTIME_REQUIREMENTS` en `packages/adapter-laravel/src/contract.ts` |

La comparación de versiones es tolerante a formatos comunes (`8.3`, `v8.3.0`,
`8.3.0-dev`) y multiplataforma (usa `which`/`where` para localizar el binario y
prueba `--version`, `-v`, `-V`, `version` para leer la versión). Si un binario
falta o su versión es insuficiente, el comando se detiene **antes** de escribir
nada (ver [Errores típicos](#errores-típicos)).

> El core no conoce PHP ni Composer: esos umbrales los declara el adapter
> (Artículo II). El chequeo genérico vive en
> `packages/core/src/bridge/binary-check.ts`.

Para el CLI en sí, ver los requisitos de desarrollo del repositorio
(Node.js >= 20, pnpm) en el [README](../../README.md).

---

## Flujo del comando

Al correr `fractal new mi-proyecto`, el comando ejecuta en orden:

1. **Valida el directorio destino** (`<cwd>/<nombre>`). Procede si el directorio
   no existe, está vacío, o contiene únicamente un `.git` sin historia. Si
   existe y tiene contenido, exige `--force`.
2. **Resuelve la topología**: la de `--topology`, o la elegida en el prompt
   interactivo.
3. **Resuelve el adapter** instalado por convención (`@fractal/adapter-*` con
   metadata `fractal` válida en su `package.json`). En v0 debe haber
   exactamente uno.
4. **Obtiene el contrato** del adapter (acción `get-contract` del bridge).
5. **Verifica los requisitos de runtime** (PHP/Composer y sus versiones
   mínimas) leídos del contrato.
6. **Genera la estructura** del proyecto (acción `create-project` del bridge).
7. **Inicializa git** según la topología y, en multirepo, genera los
   manifiestos `fractal.project.yml` (excluidos de git).

---

## Topologías

Las tres topologías comparten el mismo stack (backend Laravel + SPA React/Vite,
autenticación Sanctum Bearer, ADR-0005); solo cambia **dónde vive el código** y
**cuántos repositorios git** se crean (ADR-0010).

### Monolito (`monolith`)

Un único repositorio. API y SPA conviven en la misma estructura Laravel (el SPA
en `resources/js`). Es la topología por defecto.

```bash
fractal new mi-app --topology monolith
# o, de forma interactiva:
fractal new mi-app
```

Resultado:

- Un directorio `mi-app/` con un único repositorio git y commit inicial.
- Próximo paso sugerido: `cd mi-app`.

Para levantarlo (ver el README del adapter para el detalle):

```bash
cd mi-app
composer install
cp .env.example .env
php artisan key:generate
php artisan serve   # http://localhost:8000  — /api/health responde
```

### Monorepo desacoplado (`monorepo`)

Un único repositorio con `api/` y `web/` como packages, orquestados con
Turborepo (`turbo.json`) y pnpm.

```bash
fractal new mi-app --topology monorepo
```

Resultado:

- Un directorio `mi-app/` con un único repositorio git (su `.gitignore`
  incluye `node_modules/`) y commit inicial.
- Próximo paso sugerido: `cd mi-app`.

Para levantarlo:

```bash
cd mi-app

# Backend
cd api
composer install
cp .env.example .env
php artisan key:generate
php artisan serve   # http://localhost:8000
cd ..

# Frontend
cd web
npm install
npm run dev         # http://localhost:3000
```

### Multirepo (`multirepo`)

Dos repositorios git **independientes**, cada uno con su propio pipeline CI/CD.
A diferencia de las otras topologías, no se crea un solo directorio con el
nombre pedido: se crean dos directorios hermanos en el directorio actual.

```bash
fractal new mi-app --topology multirepo
```

Resultado:

- `mi-app-api/` — repositorio de la API (Laravel), git inicializado con commit
  inicial.
- `mi-app-web/` — repositorio del frontend (SPA React), git inicializado con
  commit inicial.
- En cada repo se genera un manifiesto `fractal.project.yml` (rol `api` / `web`)
  que queda **excluido de git** vía `.gitignore` — no se incluye en el commit
  inicial. Lo consume `fractal deploy` para coordinar el despliegue multirepo.
- Próximos pasos sugeridos: `cd mi-app-api` y `cd ../mi-app-web`.

El arranque de cada repo es análogo al backend y al frontend del monorepo.

---

## Ejemplos

```bash
# Monolito, interactivo (elegís la topología en el prompt)
fractal new blog

# Monorepo, no interactivo
fractal new tienda --topology monorepo

# Multirepo
fractal new plataforma --topology multirepo

# Regenerar sobre un directorio existente no vacío
fractal new blog --force
```

---

## Errores típicos

### Directorio destino no vacío

```
❌ Error: El directorio 'mi-app' no está vacío. Usa --force para proceder de todas formas.
```

El directorio ya existe y tiene contenido. Usá `--force` para generar de todas
formas, o elegí otro nombre. Un directorio que solo contiene un `.git` sin
commits se considera vacío y no requiere `--force`.

### Topología inválida

```
❌ Error: Topología inválida 'mono'. Opciones válidas: monolith, monorepo, multirepo
```

El valor de `--topology` debe ser exactamente `monolith`, `monorepo` o
`multirepo`.

### Requisitos de runtime no satisfechos

```
❌ Requisitos de runtime no satisfechos:

   • PHP: versión 8.1.2 instalada, se requiere 8.2.0 o superior
   • Composer: no encontrado, se requiere 2.5.0 o superior
```

Falta un binario requerido o su versión es menor a la mínima declarada por el
adapter. Instalá o actualizá PHP (>= 8.2.0) y/o Composer (>= 2.5.0) y volvé a
correr el comando. El chequeo ocurre antes de generar: no queda nada a medias.

### No se encontró un adapter

```
❌ Error al resolver adapter: No se encontró ningún adapter instalado. Asegúrate de que haya un paquete @fractal/adapter-* con metadata válida en su package.json.
```

No hay ningún `@fractal/adapter-*` resoluble. En una instalación de desarrollo,
corré `pnpm install` en la raíz del monorepo para compilar los paquetes.

### Múltiples adapters instalados

```
❌ Error al resolver adapter: Se encontraron múltiples adapters (laravel, rails). La selección interactiva de adapter se implementará en M4. Por ahora, solo debe haber un adapter instalado.
```

En v0 solo puede haber un adapter instalado; la selección interactiva entre
varios llega en M4 (adapter Rails).

---

## Referencias

- [`packages/adapter-laravel/README.md`](../../packages/adapter-laravel/README.md) — estructura generada y cómo levantar el proyecto
- [`docs/specs/0001-fractal-new-laravel-base.md`](../specs/0001-fractal-new-laravel-base.md) — especificación de `fractal new`
- [`docs/specs/0006-contrato-adapter-v0.md`](../specs/0006-contrato-adapter-v0.md) — contrato del adapter
- [`docs/adr/0010-topologia-proyecto-generado-sin-inertia.md`](../adr/0010-topologia-proyecto-generado-sin-inertia.md) — topologías soportadas
- [`docs/adr/0012-deploy-multirepo-orquestacion-inicial.md`](../adr/0012-deploy-multirepo-orquestacion-inicial.md) — manifiesto multirepo
- [`docs/adr/0005-frontend-laravel.md`](../adr/0005-frontend-laravel.md) — stack frontend React + Sanctum Bearer
