# Roadmap

**Última revisión:** 2026-11-12

> Mapa visual del avance: ver [`MAPA_DE_PROGRESO.md`](./MAPA_DE_PROGRESO.md).

> Base de esta actualización: ADRs M0 aceptados (0002/0003/0004/0006/0007),
> estructura de `docs/` y monorepo pnpm ya presentes, y lint de acoplamiento
> con script propio. M1 (SPEC-0001/0002/0003) quedó **Implementado** el
> 2026-10-26 (FRA-81, decisión de Diego): todas las tareas en
> `docs/progress.json` están `completado`, el e2e real `fractal new` +
> `fractal deploy` está mergeado (FRA-73/76) y Fractal QA post-merge #93 dio
> PASS en master `2df1d60`. SPEC-0006 (contrato del adapter) quedó
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
| CI base: lint y tests | ✅ |
| CI: matriz de versiones | ⬜[^ci-matrix] |
| Lint de acoplamiento (Artículo II) | ✅ |
| Monorepo con workspaces configurado | ✅ |
| Visibilidad de estado del proyecto (SPEC-0031) | ✅[^spec0031] |

[^spec0031]: `completado` en `docs/progress.json` (SPEC-0031, M0; FRA-43..FRA-49
    mergeados, incluido FRA-48 `--export`). El comando de producto `fractal status`
    está implementado (lee `docs/progress.json`, regenera y valida los diagramas
    de `MAPA_DE_PROGRESO.md`, con `--check` cableado en CI) y su spec ya estaba
    marcado **Implementado**. Antes esta fila estaba en ⬜/🟡 con el MVP vía
    `scripts/progress-map.js`; se alinea a ✅ con `progress.json` (FRA-63).

[^ci-matrix]: Ningún workflow define todavía una matriz de versiones.
    `.github/workflows/ci.yml` fija una sola versión por runtime (Node 22, PHP 8.2)
    y no usa `strategy.matrix`. Antes esta capacidad figuraba como ✅ dentro de la
    fila de CI base; se separa y se marca pendiente para no afirmar una matriz que
    no existe. Lint y tests sí corren en CI y siguen en ✅.

**Definition of Done:** un contribuidor nuevo entiende qué construir y cómo, leyendo solo el repo.

---

## M1 — Esqueleto vertical

**Objetivo:** validar la hipótesis central con lo mínimo, de punta a punta.

| Spec | Capability | Estado |
|---|---|---|
| SPEC-0001 | `fractal new` genera proyecto Laravel base | ✅[^spec0001] |
| SPEC-0002 | Bridge Node → toolchain del target | ✅[^spec0002] |
| SPEC-0003 | `fractal deploy` publica en internet con HTTPS | ✅[^spec0003] |

**Salida:** `fractal new` + `fractal deploy` = app vacía online, con SSL y deploy por merge.

Es el milestone más importante. Valida el diferenciador del producto antes de
invertir en generación de código.

[^spec0001]: `completado` en `docs/progress.json` (SPEC-0001, M1). Spec
    **Implementado** el 2026-10-26 por decisión de Diego (FRA-81): FRA-29,
    FRA-54 y FRA-77 mergeados; guía `docs/guides/fractal-new.md`; e2e real
    FRA-73/76 y QA PASS post-merge #93 en master `2df1d60`.
[^spec0002]: `completado` en `docs/progress.json` (SPEC-0002, M1). Spec
    **Implementado** el 2026-10-26 por decisión de Diego (FRA-81): FRA-24,
    FRA-25, FRA-41 (AC-4) y FRA-66 (AC-6, `packages/core/docs/bridge-contract-v0.md`)
    mergeados; el bridge se ejercita en el e2e real de M1.
[^spec0003]: `completado` en `docs/progress.json` (SPEC-0003, M1). Spec
    **Implementado** el 2026-10-26 por decisión de Diego (FRA-81). La reversión
    a En curso del 2026-10-14 (e2e de FRA-64 servía un `index.html` estático
    con `nginx:alpine`) queda cerrada: FRA-73 (#87) y FRA-76 (#88) corren
    `fractal new` + `fractal deploy` contra un VPS Vultr efímero, y Fractal QA
    post-merge #93 dio **PASS** en master `2df1d60`. FRA-80 es un bug Low
    aparte y no forma parte de este cierre.

---

## M1.5 — Wizard v2: code-first y modularidad

**Objetivo:** rediseñar el wizard de `fractal new` para reflejar el principio
code-first con deploy opcional y una arquitectura modular de brazos (ADR-0016).

| Spec | Capability | Estado |
|---|---|---|
| SPEC-0032 | Wizard v2: checklist inicial, brazos modulares, orden code-first | ✅[^spec0032] |

**Salida:** `fractal new` pregunta primero por el código (framework, topología, DB,
frontend), después por infraestructura (opcional), GitHub (opcional) y deploy (opcional).
El usuario puede generar un proyecto local sin datos de deploy.

**Nota:** este milestone desbloqueó M2 y quedó **Implementado** el 2026-11-11. El
wizard v2 era prerequisito para encarar SPEC-0007; una vez listo el wizard, SPEC-0007
se reorientó a **convenciones y prompts para el agente de IA** (ya no un motor de
templating, ver M2).

[^spec0032]: Wizard v2 **Implementado** el 2026-11-11: las siete tareas del spec
    (FRA-82..FRA-88) están completadas, PR #113 mergeado y Fractal QA dio PASS.
    `docs/specs/0032-wizard-v2-code-first-modular-arms.md` quedó en estado
    **Implementado**. La sincronización de `docs/progress.json` / `MAPA_DE_PROGRESO.md`
    la aplica Fractal QA vía `fractal status --write`.

---

## M2 — FDL y generación de entidades por el agente

**Objetivo:** el FDL es el contrato que el core valida; el agente de IA del proyecto genera el código útil siguiendo un pack de convenciones, sobre una base agnóstica.

| Spec | Capability | Estado |
|---|---|---|
| SPEC-0004 | Especificación del lenguaje FDL | ✅[^spec0004] |
| SPEC-0005 | Parser y validador de FDL | ✅[^spec0005] |
| SPEC-0006 | Contrato del adapter | ✅ |
| SPEC-0007 | Convenciones y prompts para generación por agente (FDL como contrato) | 🟡[^spec0007] |

**Salida:** con `fractal new` el proyecto trae el pack (`AGENTS.md` + FDL + prompts); el agente genera el CRUD completo y desplegable desde el FDL validado siguiendo esas convenciones.

> **Nota (2026-11-11):** M2 se reorientó — Fractal no implementa un motor de templating ni specs de generador por capa. El core valida el FDL (contrato) y el **agente de IA del proyecto** escribe el código siguiendo el pack de convenciones (`AGENTS.md` + FDL + prompts) que entrega SPEC-0007. Lo que antes se pensaba como specs de generador por capa —entidad (migration/model/factory/seeder), capas Repository/Service, API REST, frontend React + Vite, tests por entidad y snapshots/verificación del pack— queda **absorbido por el agente vía SPEC-0007**: son convenciones del pack, no capabilities propias de Fractal. Los números SPEC-0008..0013 se retiran y no se reutilizan (PROCESO, «Numeración»).

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
> Nota: el milestone M2 sigue abierto. SPEC-0006 fue la primera de sus specs en
> cerrarse; el FDL (SPEC-0004/0005) también quedó **Implementado**, así que lo que
> continúa pendiente es SPEC-0007 (convenciones y prompts para el agente).

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
[^spec0007]: **Reorientado** (decisión de Diego, 2026-11-11): se descarta el motor de templating propio. El FDL es el contrato que el core valida y el agente de IA del proyecto escribe el código siguiendo un pack de convenciones. Del plumbing anterior se rescata solo lo chico (validación de rutas, escritura atómica, `--dry-run`). Spec **Aprobado** el 2026-11-12 (reescrito en #114). En curso: el pack de convenciones se entregó en **#117** (FRA-102, mergeado) y `fractal doctor` en **#119** (FRA-103, mergeado). La medición de TTS/TTP en el e2e, con `fractal doctor` cableado, está en FRA-105; quedan pendientes el manifiesto del pack (FRA-104) y la doc de usuario (FRA-107).

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
| SPEC-0021 | Deploy agnóstico verificado en Rails | ⬜ |

> **Nota (2026-11-11):** con la reorientación de M2, el adapter Rails solo necesita
> entregar el **proyecto base** (SPEC-0017) y validar el **deploy agnóstico**
> (SPEC-0021). Las entidades y el CRUD, la API REST y la auth para Rails las escribe
> el **agente de IA** siguiendo el pack de convenciones (SPEC-0007), igual que en
> Laravel — no hacen falta specs de generador Rails por capa. Eso es, además, la
> prueba multi-target buscada: el mismo FDL validado, el agente generando código
> Rails real. Los números SPEC-0018..0020 se retiran y no se reutilizan.

**Criterio de éxito duro:** cero cambios en `packages/core` durante todo este milestone.
Si el core necesita modificarse, se abre un ADR explicando por qué el diseño original falló.

---

## M5 — Módulos avanzados

> **Nota (2026-11-11):** con la reorientación de M2, los módulos avanzados
> —módulos instalables, GraphQL, multi-tenancy, auditoría de cambios, media
> library— dejan de ser specs de generador de Fractal. El **agente de IA** los
> agrega al proyecto siguiendo convenciones y prompts reutilizables del pack
> (SPEC-0007), sobre el FDL validado por el core; donde sean una capacidad del
> proyecto generado, se entregan como módulos instalables (`fractal module`,
> CONSTITUTION Art. IX.B). Fractal no mantiene un generador por módulo. Los
> números SPEC-0022..0026 se retiran y no se reutilizan (PROCESO, «Numeración»).

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
