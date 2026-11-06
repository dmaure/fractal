# Guía de usuario: `fractal new`

`fractal new` genera un proyecto base listo para desarrollo y deploy. Esta
guía describe el flujo del comando tras la implementación del wizard v2
**code-first** (FRA-84, M1.5), con el adapter de referencia (Laravel) instalado.

> **Wizard v2 code-first (M1.5):** El wizard ahora sigue el principio **code-first
> con deploy opcional** (ADR-0016). El checklist inicial (FRA-83) pregunta primero
> qué datos tiene el usuario (¿tenés servidor?, ¿dominio?, ¿token de GitHub?) y
> habilita/deshabilita las secciones correspondientes. Luego, el brazo Código
> (FRA-84) pregunta por nombre, framework, topología, base de datos y frontend
> ANTES que infraestructura. Los selectores se muestran **aunque solo haya una
> opción disponible**, comunicando las opciones futuras (Rails, otras DB).

> Fuente de verdad: el comando vive en `packages/core`
> (`src/commands/new.ts`) y delega la generación al adapter vía el bridge
> (SPEC-0002). Los requisitos de runtime y la estructura generada los declara
> `packages/adapter-laravel` (SPEC-0006). Esta guía refleja el código en
> `master`; si algo diverge, el código manda.

---

## Sinopsis

```bash
fractal new [nombre-del-proyecto] [opciones]
```

| Opción | Descripción |
|---|---|
| `-t, --topology <topología>` | Topología a generar: `monolith`, `monorepo` o `multirepo`. Si se omite en TTY, se pregunta. |
| `-f, --force` | Permite generar sobre un directorio que ya existe y **no** está vacío. |
| `--non-interactive` | Sin prompts: lee flags y `FRACTAL_NEW_*` / `FRACTAL_DEPLOY_*`. Falla si falta un valor requerido. |
| `--name <nombre>` | Alternativa al argumento posicional. |
| `--server-ip`, `--ssh-user`, `--auth-method`, `--ssh-key-path`, `--ssh-password` | Datos del VPS. |
| `--domain`, `--email`, `--dns-provider`, `--dns-api-token` | Dominio, Let's Encrypt y DNS. |
| `--github-token`, `--github-owner`, `--github-repo`, `--github-visibility` | Crear el repo remoto y setear secrets. |
| `--db-password`, `--generate-db-password` | Contraseña de la base (preguntar o generar). No se escribe un `.env` local. |
| `--deploy` | Encadena a `fractal deploy` al terminar (no aplica en multirepo). |
| `--production-branch <rama>` | Rama de producción (default `main`). |

En una **terminal interactiva** el comando abre un wizard con todos los valores
que no pueden tener default (seguridad + personalización). En **CI / no-TTY**
sin `--non-interactive` se conserva la generación mínima (nombre + topología),
igual que antes de FRA-77.

Si no se pasa `--topology` en TTY, el prompt de topología usa **monolito**
como default (`DEFAULT_TOPOLOGY`).

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
2. **Wizard code-first** (FRA-83, FRA-84, FRA-85, wizard v2): orquesta el
   checklist y los brazos Código e Infraestructura:
   
   **a. Checklist inicial**: pregunta primero qué datos tiene el usuario:
   - ¿Tenés un servidor para desplegar? (sí / no / lo agrego después)
   - ¿Tenés un dominio y querés DNS automático? (sí / manual / no) — solo si respondió sí a servidor
   - ¿Tenés un token de GitHub? (sí / no)
   
   Las respuestas habilitan o deshabilitan las secciones posteriores:
   - **Servidor "no" o "lo agrego después"** → saltea toda la sección de infraestructura (FRA-85)
   - **GitHub token "no"** → no crea repositorio remoto
   
   **b. Brazo Código**: recolecta los datos del código en orden code-first
   (nombre, framework, topología, base de datos, frontend), **antes** que
   infraestructura (ADR-0016 §6).
   
   **c. Brazo Infraestructura** (FRA-85): recolecta IP, SSH, dominio, email SSL
   y DNS. Se ejecuta **al final** y solo si el checklist lo habilitó (respuesta
   "sí" a servidor). Si se salta, el proyecto se genera como **local-only** sin
   datos de deploy.

   **d. Brazo Base de datos** (FRA-87): pide la contraseña de producción con
   política generate-or-ask. Es **condicional**: solo corre si el brazo
   Infraestructura dejó datos de deploy. En local-only no se pide ni se genera
   contraseña, y no queda ningún secret de DB sin uso.
   
   En modo no-interactivo, las respuestas se derivan de los datos en el contexto
   (si pasaste `--server-ip`, se asume que tenés servidor).
   
   Ver [Wizard](#wizard-code-first) para detalles.
3. **GitHub** (si habilitado por el checklist): token, owner, repo, visibilidad.
4. **Resuelve el adapter** instalado por convención (`@fractal/adapter-*` con
   metadata `fractal` válida en su `package.json`). En v0 debe haber
   exactamente uno.
5. **Obtiene el contrato** del adapter (acción `get-contract` del bridge).
6. **Verifica los requisitos de runtime** (PHP/Composer y sus versiones
   mínimas) leídos del contrato.
7. **Genera la estructura** del proyecto (acción `create-project` del bridge).
8. **Inicializa git** según la topología y, en multirepo, genera los
   manifiestos `fractal.project.yml` (excluidos de git).
9. **Con token de GitHub:** crea el repo remoto, pushea el commit inicial y
    setea (o imprime) los secrets del workflow, incluyendo `SSH_KNOWN_HOSTS`.
10. **Hand-off** según el camino (FRA-85):
    - **Local-only** (sin datos de servidor): muestra `cd <proyecto>` y comandos
      para correr en local, sin mencionar `fractal deploy`
    - **Con infraestructura**: muestra `cd <proyecto>` + `fractal deploy` (o
      encadena el deploy si pasaste `--deploy`)

---

## Wizard: code-first

> **Nota:** El wizard v2 integra el **checklist inicial** (FRA-83) que pregunta
> primero qué datos tiene el usuario, y el **brazo Código** (FRA-84) que recolecta
> datos de código antes que infraestructura. Si respondés "no" a servidor en el
> checklist, nunca se te piden IP/SSH/dominio/DNS. Si respondés "no" a GitHub
> token, no se crea repo remoto.

Principio de ADR-0016 implementado en FRA-84 (M1.5): el wizard pregunta primero
por el código, después por infraestructura (opcional).

### Sección 1: Código (obligatoria)

**Orden:** nombre → framework → topología → base de datos → frontend.

Todos los selectores se muestran **aunque haya una sola opción disponible**
(ADR-0016 §4). Esto comunica las opciones que llegarán en el futuro (Rails en
M4, otras bases de datos y frontends).

| Prompt | Opciones actuales | Default | Futuro |
|---|---|---|---|
| **Framework del backend** | Laravel | Laravel | Rails (M4) |
| **Topología** | monolith, monorepo, multirepo | monolith | — |
| **Base de datos** | PostgreSQL | PostgreSQL | MySQL, otros |
| **Framework del frontend** | React + Vite | React + Vite | Vue, Svelte |

Todos los defaults son navegables con Enter (Art. IV): responder Enter a cada
prompt produce un proyecto funcional (monolito Laravel + PostgreSQL + React).

### Sección 2: Infraestructura (opcional, FRA-85)

**Camino local-only:** Si respondiste "no" o "lo agrego después" al checklist
de servidor, el brazo de infraestructura se **saltea completamente**. El proyecto
se genera sin datos de deploy, listo para correr en local. El hand-off final
solo muestra cómo arrancar el servidor de desarrollo, sin mencionar `fractal
deploy`. Más adelante, cuando tengas un servidor, podés desplegar con
`fractal deploy`.

**Camino con infraestructura:** Si respondiste "sí" a servidor, el wizard
pregunta los valores que **no** admiten un default seguro (user-specific,
FRA-77):

- **VPS:** IP, usuario SSH, método de autenticación (clave o contraseña), ruta
  a la clave privada (si usás clave).
- **Dominio y SSL:** dominio, email para notificaciones de Let's Encrypt.
- **DNS:** proveedor (Cloudflare automatizado, o manual) y token de API si
  elegiste Cloudflare.
- **Contraseña de base de datos** (brazo Base de datos, FRA-87): se pregunta o
  se genera solo cuando hay datos de infraestructura. No se pide en el camino
  local-only. Ver [Contraseña de la base](#contraseña-de-la-base-fra-76-fra-87).

Los prompts y validaciones de IP, SSH, dominio, email y DNS son los mismos
que `fractal deploy` (`packages/core/src/utils/deploy-prompts.ts`). Route53
sigue sin estar implementado: si lo elegís, el comando aborta igual que deploy.

### Sección 3: GitHub (opcional e independiente, FRA-86)

**GitHub es un brazo independiente** de la infraestructura (AC-5). Podés crear
el repo en GitHub **sin** proveer datos de servidor, o viceversa. El token es
**opcional**: sin token, no se crea ningún repo remoto.

Con `--github-token` / `FRACTAL_NEW_GITHUB_TOKEN` el CLI:

1. Crea el repo (privado por default) bajo el usuario del token o
   `--github-owner`.
2. Pushea el commit inicial a `--production-branch` (default `main`) **sin**
   dejar el token en `git remote -v`.
3. **Setea solo los secrets de GitHub** en el repo remoto:

   | Secret | Origen |
   |---|---|
   | `DOCKER_REGISTRY_USER` | login de GitHub |
   | `DOCKER_REGISTRY_TOKEN` | el mismo token (necesita `write:packages` para ghcr.io) |

4. **Si además hay datos de infraestructura** (servidor), setea los secrets de
   infraestructura:

   | Secret | Origen |
   |---|---|
   | `SSH_HOST` | IP del VPS |
   | `SSH_USER` | `deploy` (usuario post-hardening, no el de provisioning) |
   | `SSH_PRIVATE_KEY` | Contenido de `--ssh-key-path` si no está cifrada |
   | `SSH_KNOWN_HOSTS` | `ssh-keyscan` contra la IP (si el VPS aún no responde, se imprime el comando) |
   | `DB_PASSWORD` | la del wizard (generada o ingresada) |

   `APP_KEY` no se inventa acá: la genera el primer `fractal deploy` al armar
   el compose.

**Importante (AC-4):** `FRACTAL_NEW_GITHUB_TOKEN` **NO** se lee de `GITHUB_TOKEN`.
Esta separación evita reutilizar por accidente el token del entorno de CI. Solo
se lee de `--github-token` o `FRACTAL_NEW_GITHUB_TOKEN`.

Scopes mínimos del token: `repo`, `workflow`, `write:packages`.

En **multirepo** se crean `${nombre}-api` y `${nombre}-web`.

### SSH — gaps documentados

El wizard **no** soporta:

- **Claves con passphrase.** No se pide la passphrase ni se reenvía a
  `ssh-keygen`. Usá una clave sin cifrar o descifrala antes.
- **ssh-agent.** No se consulta el agent. La clave privada tiene que ser un
  archivo en disco (`--ssh-key-path` / `FRACTAL_NEW_SSH_KEY_PATH`).

### Contraseña de la base (FRA-76, FRA-87)

La recolecta el **brazo Base de datos**, que solo corre cuando hay deploy
(datos de infraestructura). Sin deploy no hay prompt, no se genera nada y
`DB_PASSWORD` no se setea como secret: nada de secrets sin uso.

Con deploy, la política es **generate-or-ask**: generar una contraseña segura
ahora (48 caracteres hex, equivalente a `openssl rand -hex 24`) o ingresarla.
En modo no interactivo, la precedencia es `--db-password` >
`FRACTAL_NEW_DB_PASSWORD` > `FRACTAL_DEPLOY_DB_PASSWORD`; un valor provisto
siempre gana, y sin valor se genera (`--generate-db-password` es el default).

**No** se
escribe un `.env` local del proyecto: un upload de `.env` pisaría
`/home/deploy/.env` en el VPS. Si encadenás `fractal deploy`, esa contraseña
se escribe en el servidor (base64 por SSH, no en claro en el argv). Si no,
queda como secret de GitHub y en `FRACTAL_DEPLOY_DB_PASSWORD` para el deploy
posterior.

### Modo no interactivo

```bash
fractal new mi-app --topology monolith --non-interactive \
  --server-ip 203.0.113.10 \
  --ssh-key-path ~/.ssh/id_ed25519 \
  --domain app.example.com \
  --email ops@example.com \
  --github-token "$FRACTAL_NEW_GITHUB_TOKEN"
```

Si falta una variable requerida, el comando aborta listando exactamente qué
falta. Precedencia: **flag > `FRACTAL_NEW_*` > `FRACTAL_DEPLOY_*`**.

| Campo | Flag | `FRACTAL_NEW_*` | `FRACTAL_DEPLOY_*` (fallback) |
|---|---|---|---|
| Nombre | argumento / `--name` | `FRACTAL_NEW_PROJECT_NAME` | — |
| Topología | `-t/--topology` | `FRACTAL_NEW_TOPOLOGY` | — |
| IP | `--server-ip` | `FRACTAL_NEW_SERVER_IP` | `FRACTAL_DEPLOY_SERVER_IP` |
| Usuario SSH | `--ssh-user` | `FRACTAL_NEW_SSH_USER` | `FRACTAL_DEPLOY_SSH_USER` |
| Auth SSH | `--auth-method` | `FRACTAL_NEW_AUTH_METHOD` | `FRACTAL_DEPLOY_AUTH_METHOD` |
| Clave SSH | `--ssh-key-path` | `FRACTAL_NEW_SSH_KEY_PATH` | `FRACTAL_DEPLOY_SSH_KEY_PATH` |
| Password SSH | `--ssh-password` | `FRACTAL_NEW_SSH_PASSWORD` | `FRACTAL_DEPLOY_SSH_PASSWORD` |
| Dominio | `--domain` | `FRACTAL_NEW_DOMAIN` | `FRACTAL_DEPLOY_DOMAIN` |
| Email SSL | `--email` | `FRACTAL_NEW_EMAIL` | `FRACTAL_DEPLOY_EMAIL` |
| DNS | `--dns-provider` | `FRACTAL_NEW_DNS_PROVIDER` | `FRACTAL_DEPLOY_DNS_PROVIDER` |
| Token DNS | `--dns-api-token` | `FRACTAL_NEW_DNS_API_TOKEN` | `FRACTAL_DEPLOY_DNS_API_TOKEN` |
| Rama | `--production-branch` | `FRACTAL_NEW_PRODUCTION_BRANCH` | `FRACTAL_DEPLOY_PRODUCTION_BRANCH` |
| Token GitHub | `--github-token` | `FRACTAL_NEW_GITHUB_TOKEN` | — |
| Owner GitHub | `--github-owner` | `FRACTAL_NEW_GITHUB_OWNER` | — |
| Repo GitHub | `--github-repo` | `FRACTAL_NEW_GITHUB_REPO` | — |
| Visibilidad | `--github-visibility` | `FRACTAL_NEW_GITHUB_VISIBILITY` | — |
| DB password | `--db-password` | `FRACTAL_NEW_DB_PASSWORD` | `FRACTAL_DEPLOY_DB_PASSWORD` |
| Encadenar deploy | `--deploy` | `FRACTAL_NEW_DEPLOY` | — |

`FRACTAL_NEW_GITHUB_TOKEN` es propio de `new` (crear repo + secrets). **No se
lee `GITHUB_TOKEN`** a propósito (FRA-86, AC-4): en CI de este monorepo ese
token es el del repo de Fractal, no el del proyecto generado. Esta invariante
está protegida con test de regresión.

Al terminar, si no encadenaste deploy, el CLI imprime los `export
FRACTAL_DEPLOY_*` (sin secrets) para `fractal deploy --non-interactive`.

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
php artisan serve   # http://localhost:8000  — / muestra la landing y /api/health responde
```

El `.env.example` generado usa SQLite y drivers de archivo/sync por defecto, así
que el proyecto corre en local sin servicios externos (sin MySQL ni Redis).

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
# Wizard interactivo (TTY): nombre, topología, VPS, DNS, GitHub, DB
fractal new blog

# Generación mínima en CI (no TTY, sin --non-interactive)
fractal new tienda --topology monorepo

# QA bot / no interactivo con el set completo
fractal new tienda --topology monolith --non-interactive \
  --server-ip "$FRACTAL_DEPLOY_SERVER_IP" \
  --ssh-key-path "$FRACTAL_DEPLOY_SSH_KEY_PATH" \
  --domain "$FRACTAL_DEPLOY_DOMAIN" \
  --email "$FRACTAL_DEPLOY_EMAIL" \
  --github-token "$FRACTAL_NEW_GITHUB_TOKEN"

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

### Modo no interactivo incompleto

```
❌ Error: No se pudo armar la configuración de fractal new no interactiva. Revisá flags y variables FRACTAL_NEW_* / FRACTAL_DEPLOY_*:
  • FRACTAL_NEW_SERVER_IP (o FRACTAL_DEPLOY_SERVER_IP / --server-ip) es requerida
  • FRACTAL_NEW_DOMAIN (o FRACTAL_DEPLOY_DOMAIN / --domain) es requerida
```

`--non-interactive` exige el set completo del wizard. Si solo querés generar
el proyecto (CI actual), omití `--non-interactive` y pasá `--topology`.

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
