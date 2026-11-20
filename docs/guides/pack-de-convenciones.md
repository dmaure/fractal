# Guía de usuario: pack de convenciones

El **pack de convenciones** es lo que Fractal deja dentro de tu proyecto para que
tu agente de IA agregue entidades siguiendo tu stack real, sin que vos redactes
las reglas. En lugar de un motor de plantillas que genere el CRUD, Fractal
entrega un `AGENTS.md` con las convenciones, un FDL de ejemplo como contrato
validable, un prompt reutilizable y un manifiesto declarativo; el código efectivo
de cada entidad lo escribe el agente guiado por ese pack. Esta guía describe qué
contiene el pack y cómo usarlo para agregar una entidad.

> Fuente de verdad: el pack lo genera `fractal new` **dentro del proyecto del
> usuario** (no vive en este repositorio). El contenido real del stack
> (Laravel + React/Vite) lo produce el adapter en
> `packages/adapter-laravel/src/commands/get-pack.ts`; el core define la forma
> del manifiesto y lo valida/serializa, y trata el resto del pack como **dato
> opaco** (Artículo II de la Constitución). El contrato del pack está
> especificado en `docs/specs/0007-convenciones-y-prompts-para-generacion.md`
> (AC-2, AC-3 y el manifiesto en FRA-104). Esta guía refleja el código en
> `master`; si algo diverge, el código manda.

---

## Qué es el pack y dónde vive

El pack **no está en este repositorio**: se materializa en tu proyecto cuando
corrés `fractal new`. Una vez generado, es tuyo (Artículo V: vos sos dueño del
código, no hay "no toques esto"); lo editás como cualquier otro archivo del
proyecto. Fractal nunca ejecuta el código que el agente escribe a partir del
pack.

El conocimiento específico del stack vive en el **adapter**; el **core** solo
valida el FDL y el manifiesto, y escribe los archivos. Por eso el core puede
agregar targets nuevos (Rails, etc.) sin aprender nada de Laravel: el pack de
cada stack lo aporta su adapter.

---

## Qué contiene el pack

El pack del adapter de referencia (Laravel + React/Vite) deja cuatro archivos en
la raíz del proyecto generado:

| Archivo | Para qué |
|---|---|
| `AGENTS.md` | Convenciones del stack y mapeo del FDL a cada capa. |
| `fractal/domain.fdl.json` | El contrato de dominio en FDL (validable). |
| `fractal/prompts/add-entity.md` | Prompt reutilizable para agregar una entidad. |
| `fractal/manifest.json` | Manifiesto declarativo que ata todo lo anterior. |

### `AGENTS.md` — convenciones del stack

Vive en la raíz del proyecto generado y es lo que tu agente lee para saber
**cómo** escribir el código. Declara que la fuente de verdad del dominio es el
FDL (`fractal/domain.fdl.json`), que primero se actualiza y valida el contrato y
recién después se escribe el código, y cómo mapear cada entidad del FDL —con sus
`fields` (tipo, `nullable`, `unique`, `maxLength`, `precision`/`scale`,
`default`, `values` de enum) y sus `relations`— a cada capa del stack
Laravel + React/Vite:

- **Migración (`database/migrations`)** — un archivo por entidad, tabla en plural
  snake_case, mapeo de los tipos abstractos del FDL a columnas, y los
  modificadores (`nullable`, `unique`, `default`, claves foráneas de las
  relaciones).
- **Modelo (`app/Models`)** — un modelo Eloquent por entidad, con `$fillable`,
  `$casts` y las relaciones (`hasMany`, `belongsTo`, `belongsToMany`) derivadas
  del FDL.
- **API / controlador / rutas** — un controlador API por entidad con las acciones
  REST, rutas bajo `/api`, y validación en servidor derivada de los modificadores
  del FDL.
- **Frontend (`web/src` en monolito y monorepo, `src` del repo web en multirepo; React + Vite)** — tipos TypeScript y vistas/CRUD
  que consumen `/api`, con las mismas validaciones que el backend.
- **Tests** — cada entidad incluye sus tests (feature tests de la API y tests del
  modelo), camino feliz y validaciones.

Cierra con el **flujo recomendado**: editar el FDL → validarlo → usar el prompt →
correr los tests.

### `fractal/domain.fdl.json` — el contrato de dominio

Es un FDL de ejemplo, listo para editar. Trae `fdlVersion: "0"` y dos entidades
—`Author` y `Book`— con una relación modelada de los dos lados (`one-to-many` /
`many-to-one` enlazadas con `inverse`) y un enum `status` con valores
`["draft", "published"]` y default `draft`. El documento **pasa las doce reglas
del validador** (VR-1..VR-12), así que podés validarlo de entrada con:

```bash
fractal fdl check fractal/domain.fdl.json
```

Para el detalle del formato FDL (tipos, modificadores, relaciones, reglas de
validación), ver la [guía de FDL](./fdl.md).

### `fractal/prompts/add-entity.md` — el prompt reutilizable

Es una plantilla de texto con **solo instrucciones** para el agente (sin código
generado por Fractal). Describe el objetivo —"agregá la entidad `{{ENTIDAD}}`"—
con el placeholder `{{ENTIDAD}}` que reemplazás por el nombre real, y le indica
al agente leer primero el FDL y `AGENTS.md`, actualizar y **validar** el contrato
antes de escribir nada, generar cada capa siguiendo las convenciones, y agregar
los tests.

### `fractal/manifest.json` — el manifiesto declarativo (FRA-104)

Es el manifiesto que ata las piezas del pack: le dice al agente (y a cualquier
herramienta) dónde están las convenciones, el contrato de datos y los prompts, y
sobre qué framework/topología trabaja. Sus campos:

| Campo | Ejemplo (adapter Laravel) | Qué declara |
|---|---|---|
| `manifestVersion` | `"0"` | Versión del formato del manifiesto. |
| `project.name` | el nombre de tu proyecto | Identificador del proyecto. |
| `framework.adapter` | `"laravel"` | Adapter que produjo el pack. |
| `framework.name` | `"Laravel + React (Vite)"` | Nombre legible del stack. |
| `topology` | `"monolith"` · `"monorepo"` · `"multirepo"` | Topología del proyecto. |
| `conventions` | `"AGENTS.md"` | Ruta a las convenciones. |
| `data.fdl` | `"fractal/domain.fdl.json"` | Ruta al contrato de dominio FDL. |
| `prompts` | `["fractal/prompts/add-entity.md"]` | Prompts reutilizables del pack. |

El core valida el manifiesto (campos requeridos y cross-check de que las rutas
referenciadas existen en el pack) y lo serializa de forma determinista.

---

## `fractal fdl check` — validar el contrato

`fractal fdl check <path>` valida un archivo FDL como contrato (VR-1..VR-12) y es
la pieza del pack que usás cada vez que tocás el dominio. Es un comando chico que
reutiliza el validador del core; no tiene flags propios más allá de `-h`:

```
Usage: fractal fdl check [options] <path>

Valida un archivo FDL como contrato (VR-1..VR-12); sale != 0 si es inválido

Options:
  -h, --help  display help for command
```

Comportamiento:

- Sale con código `0` si el FDL es **válido**.
- Sale con código `1` si es **inválido** (reporta todas las violaciones VR-1..VR-12,
  no solo la primera) o si el archivo es **ilegible** (no existe, no es JSON válido).

```bash
# Validar el contrato de dominio del proyecto generado
fractal fdl check fractal/domain.fdl.json
```

Para entender los diagnósticos y las reglas de validación, ver la
[guía de FDL](./fdl.md#reglas-de-validación-vr-1--vr-12).

---

## Agregar una entidad usando el agente

Este es el flujo central del pack: así agregás una entidad nueva (o modificás una
existente) apoyándote en el contrato validado y en tu agente de IA.

1. **Editá el contrato.** Abrí `fractal/domain.fdl.json` y agregá la entidad con
   sus `fields` (tipo y modificadores) y sus `relations` (con `inverse` cuando
   modeles los dos lados).
2. **Validá el contrato.** Corré `fractal fdl check fractal/domain.fdl.json` y no
   avances hasta que pase sin violaciones: el contrato bloquea el resto del flujo
   si está mal.
3. **Usá el prompt con tu agente.** Abrí tu agente de IA y pasale el prompt
   `fractal/prompts/add-entity.md`, reemplazando `{{ENTIDAD}}` por el nombre de la
   entidad (p. ej. `Book`).
4. **Dejá que el agente genere las capas.** Guiado por `AGENTS.md`, el agente
   escribe la migración, el modelo, la API/controlador/rutas, el frontend y los
   tests, en las capas correctas y respetando los tipos y modificadores del FDL.
5. **Corré la suite de tests** del proyecto para validar el resultado y ajustá lo
   que haga falta.

```bash
# 1-2. Editás fractal/domain.fdl.json y validás el contrato
fractal fdl check fractal/domain.fdl.json

# 3-4. Usás fractal/prompts/add-entity.md con tu agente (reemplazando {{ENTIDAD}})
#      y el agente genera migración/modelo/API/frontend/tests.

# 5. Corrés la suite de tests del proyecto (ejemplo con el stack de referencia)
php artisan test
```

El FDL manda: si el código y el contrato divergen, se corrige el código para que
coincida con el FDL validado.

---

## Referencias

- [`docs/specs/0007-convenciones-y-prompts-para-generacion.md`](../specs/0007-convenciones-y-prompts-para-generacion.md) — especificación del pack (AC-2, AC-3 y el manifiesto en FRA-104).
- [`packages/adapter-laravel/src/commands/get-pack.ts`](../../packages/adapter-laravel/src/commands/get-pack.ts) — contenido real del pack para el stack Laravel + React/Vite.
- [`docs/guides/fdl.md`](./fdl.md) — guía del formato FDL (tipos, modificadores, relaciones y reglas de validación).
- [`docs/guides/fractal-new.md`](./fractal-new.md) — generación del proyecto base, el comando que deja el pack adentro.
- [`docs/guides/fractal-doctor.md`](./fractal-doctor.md) — chequeo determinista post-deploy (misma SPEC-0007).
- [`docs/CONSTITUTION.md`](../CONSTITUTION.md) — Artículo II (core agnóstico) y Artículo V (el código generado es el producto).
