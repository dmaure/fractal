# SPEC-0006: Contrato del adapter (v0 — alcance mínimo para `fractal new`)

**Estado:** Aprobado
**Autor:** Diego
**Fecha:** 2026-08-26
**Última revisión:** 2026-09-27 — resueltas las 2 preguntas abiertas del §8
(P1: contrato como tipos TS exportados desde core, migración a JSON Schema
diferida a M4/adapter Rails; P2: campo único de healthcheck agnóstico al
runtime — ADR-0013 nginx-only sirve una ruta estática). Pasa de Draft a
Aprobado.
**Issue:** #

---

## 1. Objetivo

Definir el contrato mínimo que un adapter (`adapter-laravel` primero) debe
cumplir para que el core pueda invocarlo a través del bridge (SPEC-0002) y
generar un proyecto base — sin todavía cubrir generación de entidades,
CRUD, ni auth, que quedan para M2/M3.

---

## 2. Motivación

SPEC-0001 (`fractal new`) y SPEC-0002 (bridge) referencian este contrato
como dependencia desde que se escribieron, pero nunca se formalizó — quedó
anotado como "Blanda, no escrito aún" porque en ese momento no bloqueaba el
diseño del CLI ni del bridge en sí. Al descomponer esos specs en tickets
ejecutables quedó claro que sí bloquea: sin este contrato, no hay forma de
que `adapter-laravel` sepa qué debe exponer, ni de que el core sepa qué
esperar de vuelta.

Este spec es deliberadamente **v0**: cubre solo lo que `fractal new` y
`fractal deploy` (SPEC-0003) necesitan hoy. El contrato completo —
generación de entidades, CRUD, capas Repository/Service, auth — se
diseñará en M2 con casos reales, mismo criterio que ya usó ADR-0002 para no
abstraer sin evidencia.

---

## 3. Historias de usuario

- Como **core**, quiero invocar "crear proyecto base" en un adapter sin
  conocer PHP ni Composer, para mantenerme agnóstico (Artículo II).
- Como **desarrollador de `adapter-laravel`**, quiero un contrato explícito
  de qué debo exponer, para implementarlo sin adivinar.
- Como **`packages/deploy`**, quiero poder preguntarle al adapter qué
  contenedores, comando de build y comando de migración corresponden al
  proyecto que estoy desplegando, sin saber que es Laravel.

---

## 4. Criterios de aceptación

### AC-1: Comando "crear proyecto base"
- **Dado** que el core invoca al adapter con el comando de creación de
  proyecto, vía el payload JSON de SPEC-0002 (AC-2)
- **Cuando** el adapter recibe nombre del proyecto, topología elegida
  (monolito / monorepo desacoplado / multirepo, ADR-0010) y path destino
- **Entonces** genera el proyecto Laravel correspondiente a esa topología y
  devuelve éxito, o un error propagable de forma legible (SPEC-0002 AC-3)

### AC-2: Declaración de versión mínima de runtime
- **Dado** que el adapter se registra ante el core
- **Cuando** el mecanismo genérico de detección de dependencias (SPEC-0002
  AC-4) necesita saber qué binarios y versiones exigir
- **Entonces** el adapter expone esa declaración (ej. PHP >= 8.2, Composer
  >= 2.x) en un formato que ese mecanismo genérico puede leer sin conocer
  Laravel específicamente

### AC-3: Declaración de runtime de deploy
- **Dado** que `packages/deploy` (SPEC-0003 AC-4) necesita saber qué
  contenedores generar para lo que se está desplegando
- **Cuando** consulta el contrato del adapter para ese target
- **Entonces** recibe: la lista de servicios (`app`, `nginx`, `db`,
  `redis`, `worker`, `scheduler` para un backend Laravel completo; solo
  `nginx` para el caso frontend estático del repo `web/` en multirepo,
  ADR-0013), el comando de build, el comando de migración, el puerto
  expuesto, y la ruta de healthcheck

### AC-4: Shape del payload documentado
- **Dado** el bridge de SPEC-0002
- **Cuando** un desarrollador implementa un adapter nuevo (Rails, M4)
- **Entonces** existe un schema (JSON Schema o tipos TypeScript) del
  payload exacto de "crear proyecto base" — sin ambigüedad sobre qué
  campos son obligatorios y qué forma tiene cada uno

---

## 5. Fuera de alcance

- Comando de generación de entidades/CRUD y su contrato (M2 — se diseña
  con casos reales, no ahora)
- Comandos de autenticación, roles y permisos (M3)
- Adapter Rails (M4) — este spec define el contrato en abstracto, pero
  `adapter-rails` lo implementa recién en M4
- Capas Repository/Service (SPEC-0009, M2)

---

## 6. Dependencias

| Depende de | Tipo | Estado |
|---|---|---|
| ADR-0001 (CLI híbrido Node) | Bloqueante | Aceptado |
| ADR-0002 (arquitectura multi-target) | Bloqueante | Aceptado |
| ADR-0003 (FDL en JSON) | Blanda | Aceptado |
| SPEC-0002 (bridge Node → toolchain) | Bloqueante | Aprobado |

---

## 7. Consideraciones técnicas

**Seguridad**
- El contrato no transmite secrets — solo metadata de estructura y
  comandos.

**Compatibilidad**
- El schema del payload (AC-4) debe ser versionable desde el día uno,
  aunque v0 no defina todavía una estrategia formal de versionado — se
  revisita si aparece necesidad real de romper compatibilidad antes de M2.

**Forma del contrato (v0)**
- El contrato v0 se expresa como **tipos TypeScript exportados desde
  `packages/core`** y compartidos con los adapters a través del bridge Node
  (SPEC-0002). Da seguridad en tiempo de compilación sin sumar maquinaria de
  validación en runtime todavía; la migración a **JSON Schema como fuente de
  verdad neutral al lenguaje** queda diferida a M4, cuando el adapter Rails
  deje de poder apoyarse solo en tipos TS (§8, P1).
- La ruta de healthcheck (AC-3) se declara con un **único campo agnóstico al
  runtime** (p. ej. `healthcheck.path`): el adapter/runtime decide qué hay
  detrás — endpoint real de la app en el backend Laravel completo, ruta
  estática servida por nginx en el caso nginx-only (ADR-0013) — sin que el
  contrato filtre la topología del runtime (alineado con ADR-0002, core
  agnóstico; §8, P2).

---

## 8. Preguntas abiertas

Ninguna pendiente. Las dos preguntas se resolvieron el 2026-09-27:

- [x] ¿El schema del payload vive como JSON Schema standalone, o como
  tipos TypeScript exportados que el core y los adapters comparten? →
  **Resuelto:** el contrato v0 vive como **tipos TypeScript exportados desde
  `packages/core`**, compartidos por core y adapters a través del bridge Node
  (hoy el único adapter es Laravel, invocado vía la toolchain Node —
  ADR-0001). Se difiere la migración a **JSON Schema como fuente de verdad
  neutral al lenguaje** para cuando llegue el adapter Rails (M4), momento en
  que el contrato deje de poder apoyarse solo en tipos TS. Mantiene el
  alcance v0 mínimo y con seguridad en tiempo de compilación, sin sumar
  maquinaria de validación en runtime todavía.
- [x] ¿Cómo declara el adapter la ruta de healthcheck cuando el runtime es
  nginx-only (ADR-0013) — mismo campo que el caso backend completo, o un
  campo distinto porque no hay aplicación detrás para healthcheck real? →
  **Resuelto:** el adapter declara la ruta de healthcheck con un **único
  campo, agnóstico al runtime** (p. ej. `healthcheck.path`). El
  adapter/runtime decide qué hay detrás: en el caso backend completo apunta
  al endpoint real de la app; en el caso nginx-only (ADR-0013) apunta a una
  ruta estática servida por nginx. No se filtra la topología del runtime
  dentro del contrato (alineado con ADR-0002, core agnóstico).

---

## 9. Definition of Done

- [ ] Todos los criterios de aceptación tienen test automatizado
- [ ] Tests de snapshot de los stubs actualizados (si aplica)
- [ ] Test end-to-end pasa
- [ ] Documentación de usuario escrita
- [ ] ADRs asociados creados si hubo decisiones técnicas
- [ ] Este spec marcado como Implementado

---

## 10. Descomposición en tickets (propuesta para Linear)

> **Nota:** esto es una **propuesta**. Esta sesión no tiene acceso de
> escritura a Linear; el PM/Claude debe cargar estos tickets como `FRA-NN`,
> declarar las dependencias como relación real (`blockedBy`, ver
> AGENT_PLAYBOOK) y moverlos a **Ready for AI**. Los tickets se derivan
> directamente de los criterios de aceptación del §4 y de la forma del
> contrato del §7; no agregan alcance más allá de este spec. El orden refleja
> las dependencias entre ellos: T1 es la base de los otros tres.

### T1 — Definir los tipos TypeScript del contrato v0 en `packages/core`

- **Context:** SPEC-0006 fija que el contrato v0 se expresa como tipos
  TypeScript exportados desde `packages/core` (§7, "Forma del contrato") y
  compartidos con los adapters vía el bridge (SPEC-0002). Hoy no existe ese
  módulo de tipos, y AC-4 exige un shape sin ambigüedad del payload.
- **Objective:** Exportar desde `packages/core` los tipos del contrato v0:
  payload de "crear proyecto base", declaración de versión mínima de runtime
  y declaración de runtime de deploy.
- **Technical Context:** Los tipos viven en `packages/core` (no en un
  adapter) y son agnósticos de framework (Artículo II, ADR-0002). La ruta de
  healthcheck se modela con un **único campo agnóstico** (p. ej.
  `healthcheck.path`), sin variantes por runtime (§8 P2). El payload es
  serializable en JSON, consistente con el transporte stdin/stdout del bridge
  (SPEC-0002 AC-2, ADR-0003).
- **Implementation Notes:** Cubrir el shape de: nombre de proyecto, topología
  (monolito / monorepo / multirepo, ADR-0010) y path destino (AC-1); la
  declaración de binarios y versiones mínimas (AC-2); y la declaración de
  runtime de deploy — lista de servicios, comando de build, comando de
  migración, puerto expuesto, `healthcheck.path` (AC-3). Marcar qué campos son
  obligatorios. Dejar preparado el versionado del schema aunque v0 no formalice
  la estrategia (§7 Compatibilidad).
- **Acceptance Criteria:** AC-4 (shape del payload documentado como tipos TS);
  soporte de tipos para AC-1, AC-2 y AC-3.
- **Tests:** Tests de tipos / compilación que verifiquen que un payload válido
  compila y uno con campos faltantes falla; test del lint de acoplamiento
  confirmando que los tipos no mencionan ningún framework.
- **Documentation:** Documentar el contrato (forma del payload, respuesta,
  campos obligatorios) — insumo también para SPEC-0002 AC-6.
- **Dependencies:** ADR-0001 (Aceptado), ADR-0002 (Aceptado), SPEC-0002
  (Aprobado). Sin bloqueos de otros tickets — es la base.
- **Definition of Done:** Tipos exportados desde `packages/core`, tests en
  verde, lint de acoplamiento limpio, contrato documentado.

### T2 — Consumir la declaración de runtime del contrato en `packages/deploy`

- **Context:** `packages/deploy` hoy codifica el set de contenedores en
  constantes hardcodeadas (`BACKEND_FULL_SERVICES` / `FRONTEND_STATIC_SERVICES`
  en `runtime/types.ts`, ver SPEC-0003 §10, ticket FRA-29), a la espera de que
  SPEC-0006 formalice cómo un adapter declara su runtime. AC-3 de este spec lo
  formaliza.
- **Objective:** Reemplazar el set hardcodeado por la declaración de runtime
  que expone el contrato del adapter (T1), sin romper la implementación actual.
- **Technical Context:** `packages/deploy` no puede conocer ningún framework
  (Artículo II, AC-12 de SPEC-0003). Todo dato específico del target —
  servicios, build, migración, puerto, `healthcheck.path` — proviene del
  contrato. El caso nginx-only (ADR-0013) usa el mismo campo único de
  healthcheck (§8 P2).
- **Implementation Notes:** Sustituir las constantes por la lectura de la
  declaración del contrato; preservar el comportamiento observable actual
  (mismos servicios para backend completo y para nginx-only) para no romper los
  snapshots existentes salvo lo estrictamente necesario.
- **Acceptance Criteria:** AC-3 (declaración de runtime de deploy consumida
  desde el contrato); se mantiene AC-12 de SPEC-0003.
- **Tests:** Actualizar/añadir tests de `runtime` y snapshots de
  `docker-compose.yml` para backend completo y nginx-only; test de acoplamiento.
- **Documentation:** Actualizar `packages/deploy` y la nota de SPEC-0003 §10 que
  anticipaba esta generalización.
- **Dependencies:** **Bloqueado por T1.** ADR-0006, ADR-0013 (Aceptados),
  SPEC-0003 (Aprobado).
- **Definition of Done:** Sin constantes hardcodeadas de servicios, tests y
  snapshots en verde, lint de acoplamiento limpio.

### T3 — Chequeo de versión mínima de runtime vía el contrato

- **Context:** SPEC-0002 AC-4 está "Implementado parcialmente": detecta binario
  ausente, pero el chequeo de versión mínima quedó pendiente de que SPEC-0006
  defina cómo el adapter declara esa versión (ver SPEC-0002 §4, AC-4). AC-2 de
  este spec provee esa declaración.
- **Objective:** Implementar `checkBinaryVersion(binaryName, minVersion)` en
  `packages/core/src/bridge/binary-check.ts`, alimentado por la declaración de
  versión mínima del contrato (T1).
- **Technical Context:** El mecanismo es genérico y agnóstico de framework: el
  core no sabe que Laravel exige PHP 8.2+/Composer 2.x; ese umbral lo declara el
  adapter (SPEC-0001 §7). Multiplataforma, en línea con el `checkBinaryAvailable`
  existente.
- **Implementation Notes:** Leer la versión mínima desde la declaración del
  contrato; comparar versiones de forma robusta; mensaje claro indicando qué
  falta o qué versión mínima se requiere (SPEC-0002 AC-4).
- **Acceptance Criteria:** AC-2 (declaración de versión mínima leída por el
  mecanismo genérico); completa SPEC-0002 AC-4.
- **Tests:** Tests de `binary-check` para versión suficiente, insuficiente y
  binario ausente; verificación de agnosticismo de framework.
- **Documentation:** Actualizar la nota de estado de SPEC-0002 AC-4 una vez
  implementado.
- **Dependencies:** **Bloqueado por T1.** ADR-0001 (Aceptado), SPEC-0002
  (Aprobado).
- **Definition of Done:** `checkBinaryVersion` implementado y exportado, tests
  en verde, lint de acoplamiento limpio.

### T4 — Implementar "crear proyecto base" en `adapter-laravel` contra el contrato

- **Context:** AC-1 exige que el adapter genere el proyecto Laravel para la
  topología elegida a partir del payload del contrato. Es lo que consume
  `fractal new` (SPEC-0001) a través del bridge.
- **Objective:** Que `adapter-laravel` implemente el comando "crear proyecto
  base" cumpliendo el contrato v0 (T1) y devolviendo éxito o error propagable y
  legible (SPEC-0002 AC-3).
- **Technical Context:** El conocimiento de PHP/Composer/Laravel vive solo en
  `adapter-laravel` (Artículo II). El adapter recibe nombre, topología (ADR-0010)
  y path; también expone su declaración de versión mínima (AC-2) y su
  declaración de runtime de deploy (AC-3) según el contrato.
- **Implementation Notes:** Generar la topología correspondiente (monolito /
  monorepo desacoplado / multirepo); errores propagables sin stacktrace crudo
  (SPEC-0002 AC-3). No cubrir entidades/CRUD/auth (fuera de alcance, §5).
- **Acceptance Criteria:** AC-1 (comando de creación) y exposición de AC-2/AC-3
  desde `adapter-laravel`.
- **Tests:** Tests del adapter para las tres topologías y para la propagación de
  error; snapshots de los stubs generados (Artículo X).
- **Documentation:** README de `adapter-laravel` describiendo el comando y su
  contrato.
- **Dependencies:** **Bloqueado por T1.** Complementa a SPEC-0001. ADR-0002,
  ADR-0005, ADR-0010 (Aceptados), SPEC-0002 (Aprobado).
- **Definition of Done:** Comando implementado contra el contrato, tests y
  snapshots en verde, lint de acoplamiento limpio.
