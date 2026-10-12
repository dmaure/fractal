# Roadmap

**Última revisión:** 2026-10-12

> Mapa visual del avance: ver [`MAPA_DE_PROGRESO.md`](./MAPA_DE_PROGRESO.md).

> Base de esta actualización: ADRs M0 aceptados (0002/0003/0004/0006/0007),
> estructura de `docs/` y monorepo pnpm ya presentes, y lint de acoplamiento
> con script propio. M1 de deploy (SPEC-0003) mergeado pero aún Aprobado
> (falta e2e en CI y docs de usuario); SPEC-0006 (contrato del adapter) quedó
> **Implementado** el 2026-10-11 (FRA-55).

Cada milestone entrega valor verificable por sí solo.

---

## M0 — Fundaciones

**Objetivo:** reglas, documentación y CI antes de la primera feature.

| Ítem | Estado |
|---|---|
| Constitución y visión escritas | ✅ |
| Estructura de `docs/` en el repo | ✅ |
| ADR-0002: arquitectura multi-target | ✅ |
| ADR-0003: FDL como representación intermedia | ✅ |
| ADR-0004: estrategia multi-DB | ✅ |
| ADR-0006: Docker Compose como runtime | ✅ |
| ADR-0007: GitHub Actions como CI/CD | ✅ |
| CI base: lint, tests, matriz de versiones | ✅ |
| Lint de acoplamiento (Artículo II) | ✅ |
| Monorepo con workspaces configurado | ✅ |
| Visibilidad de estado del proyecto (SPEC-0031) | ✅[^spec0031] |

[^spec0031]: `completado` en `docs/progress.json` (SPEC-0031, M0; FRA-43..FRA-49
    mergeados, incluido FRA-48 `--export`). El comando de producto `fractal status`
    está implementado (lee `docs/progress.json`, regenera y valida los diagramas
    de `MAPA_DE_PROGRESO.md`, con `--check` cableado en CI) y su spec ya estaba
    marcado **Implementado**. Antes esta fila estaba en ⬜/🟡 con el MVP vía
    `scripts/progress-map.js`; se alinea a ✅ con `progress.json` (FRA-63).

**Definition of Done:** un contribuidor nuevo entiende qué construir y cómo, leyendo solo el repo.

---

## M1 — Esqueleto vertical

**Objetivo:** validar la hipótesis central con lo mínimo, de punta a punta.

| Spec | Capability | Estado |
|---|---|---|
| SPEC-0001 | `fractal new` genera proyecto Laravel base | ⬜ |
| SPEC-0002 | Bridge Node → toolchain del target | ⬜ |
| SPEC-0003 | `fractal deploy` publica en internet con HTTPS | ⬜ |

**Salida:** `fractal new` + `fractal deploy` = app vacía online, con SSL y deploy por merge.

Es el milestone más importante. Valida el diferenciador del producto antes de
invertir en generación de código.

---

## M2 — FDL y generación de entidades

**Objetivo:** el generador genera código útil, sobre una base agnóstica.

| Spec | Capability | Estado |
|---|---|---|
| SPEC-0004 | Especificación del lenguaje FDL | ✅[^spec0004] |
| SPEC-0005 | Parser y validador de FDL | ✅[^spec0005] |
| SPEC-0006 | Contrato del adapter | ✅ |
| SPEC-0007 | Motor de templating de stubs | ⬜ |
| SPEC-0008 | Entidad: migration, model, factory, seeder | ⬜ |
| SPEC-0009 | Capas Repository y Service | ⬜ |
| SPEC-0010 | API REST con validación y serialización | ⬜ |
| SPEC-0011 | Frontend React + Vite consumiendo la API (Index, Show, Form) — ADR-0005 | ⬜ |
| SPEC-0012 | Generación de tests por entidad | ⬜ |
| SPEC-0013 | Tests de snapshot de stubs | ⬜ |

**Salida:** `fractal entity Producto` genera CRUD completo y desplegable.

> SPEC-0006 (contrato del adapter) quedó **Implementado** el 2026-10-11
> (FRA-55, cierre documental). Sus cuatro tickets base están mergeados —
> T1/FRA-39 (tipos TS del contrato en core), T2/FRA-40 (consumo en
> `packages/deploy`), T3/FRA-41 (chequeo de versión mínima de runtime) y
> T4/FRA-42 (comando "crear proyecto base" en `adapter-laravel`)— y también
> el trabajo que lo entrega de punta a punta: FRA-52 (esqueleto Laravel
> ejecutable), FRA-54 (conectar `fractal new` al adapter vía el bridge),
> FRA-53 (snapshots del árbol por topología) y FRA-51 (`fractal deploy` lee el
> `deployRuntime` del contrato por target). `fractal new` ya genera las tres
> topologías contra el contrato y la Definition of Done del §9 del spec se
> cumple por completo (evidencia en SPEC-0006 §9.1). Por eso pasa de 🟡 a **✅**.
> Nota: el milestone M2 sigue abierto; SPEC-0006 es la primera de sus specs en
> cerrarse, el resto (FDL, generación de entidades) continúa pendiente.

> SPEC-0004 (lenguaje FDL) está **Implementado**
> (`docs/specs/0004-lenguaje-fdl.md`, Estado: Implementado) y su cadena de
> implementación —FRA-56 a FRA-61 (PRs #67–#72)— está mergeada; por eso
> `docs/progress.json` marca SPEC-0004 y la capability FDL como `completado` y
> esta fila se alinea a ✅ (FRA-63). El spec quedó marcado como
> **Implementado** el 2026-10-12 por decisión de Diego (FRA-63).
> La evidencia de sus criterios de aceptación está en SPEC-0004 §11.1.
>
> SPEC-0005 (parser y validador) **no se redactó como spec independiente**: quedó
> **absorbido en SPEC-0004** (sus tareas T2–T5 se ejecutaron bajo el módulo FDL,
> FRA-57..FRA-60). Por eso no tiene entrada propia en `progress.json` y su fila
> se marca ✅ (absorbido). Ver `docs/specs/0005-parser-y-validador-de-fdl.md` y
> SPEC-0004 §11.2.

[^spec0004]: `completado` en `docs/progress.json` (SPEC-0004, T1..T6 / FRA-56..FRA-61).
    El spec está **Implementado** (2026-10-12, por decisión de Diego en FRA-63); el ✅ refleja `progress.json: completado`.
[^spec0005]: Absorbido en SPEC-0004 (ver `docs/specs/0005-parser-y-validador-de-fdl.md`).
    Sin entrada propia en `progress.json`; sus tareas se trazan bajo SPEC-0004.

---

## M3 — Autenticación y autorización

| Spec | Capability | Estado |
|---|---|---|
| SPEC-0014 | Roles y permisos (core) | ⬜ |
| SPEC-0015 | OAuth | ⬜ |
| SPEC-0016 | 2FA con TOTP | ⬜ |

---

## M4 — Adapter Rails

**Objetivo:** probar que la arquitectura multi-target funciona.

| Spec | Capability | Estado |
|---|---|---|
| SPEC-0017 | Adapter Rails: proyecto base | ⬜ |
| SPEC-0018 | Adapter Rails: entidades y CRUD | ⬜ |
| SPEC-0019 | Adapter Rails: API REST | ⬜ |
| SPEC-0020 | Adapter Rails: auth | ⬜ |
| SPEC-0021 | Deploy agnóstico verificado en Rails | ⬜ |

**Criterio de éxito duro:** cero cambios en `packages/core` durante todo este milestone.
Si el core necesita modificarse, se abre un ADR explicando por qué el diseño original falló.

---

## M5 — Módulos avanzados

| Spec | Capability | Estado |
|---|---|---|
| SPEC-0022 | Sistema de módulos instalables | ⬜ |
| SPEC-0023 | GraphQL | ⬜ |
| SPEC-0024 | Multi-tenancy | ⬜ |
| SPEC-0025 | Auditoría de cambios | ⬜ |
| SPEC-0026 | Media library | ⬜ |

---

## M6 — Operación

| Spec | Capability | Estado |
|---|---|---|
| SPEC-0027 | Backups automatizados | ⬜ |
| SPEC-0028 | Monitoreo y alertas | ⬜ |
| SPEC-0029 | Entorno de staging | ⬜ |
| SPEC-0030 | Comando `upgrade` de proyectos generados | ⬜ |

---

## Criterio de priorización

Ante duda sobre qué hacer primero, se elige lo que:

1. Reduce el Time-to-Production
2. Desbloquea más specs pendientes
3. Valida una hipótesis riesgosa antes que una segura

En ese orden.
