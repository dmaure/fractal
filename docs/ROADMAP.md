# Roadmap

**Última revisión:** 2026-08-02

Cada milestone entrega valor verificable por sí solo.

---

## M0 — Fundaciones

**Objetivo:** reglas, documentación y CI antes de la primera feature.

| Ítem | Estado |
|---|---|
| Constitución y visión escritas | ✅ |
| Estructura de `docs/` en el repo | ⬜ |
| ADR-0002: arquitectura multi-target | ⬜ |
| ADR-0003: FDL como representación intermedia | ⬜ |
| ADR-0004: estrategia multi-DB | ⬜ |
| ADR-0006: Docker Compose como runtime | ⬜ |
| ADR-0007: GitHub Actions como CI/CD | ⬜ |
| CI base: lint, tests, matriz de versiones | ⬜ |
| Lint de acoplamiento (Artículo II) | ⬜ |
| Monorepo con workspaces configurado | ⬜ |

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
| SPEC-0004 | Especificación del lenguaje FDL | ⬜ |
| SPEC-0005 | Parser y validador de FDL | ⬜ |
| SPEC-0006 | Contrato del adapter | ⬜ |
| SPEC-0007 | Motor de templating de stubs | ⬜ |
| SPEC-0008 | Entidad: migration, model, factory, seeder | ⬜ |
| SPEC-0009 | Capas Repository y Service | ⬜ |
| SPEC-0010 | API REST con validación y serialización | ⬜ |
| SPEC-0011 | Frontend React + Inertia (Index, Show, Form) | ⬜ |
| SPEC-0012 | Generación de tests por entidad | ⬜ |
| SPEC-0013 | Tests de snapshot de stubs | ⬜ |

**Salida:** `fractal entity Producto` genera CRUD completo y desplegable.

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
