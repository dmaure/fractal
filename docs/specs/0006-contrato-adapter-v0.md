# SPEC-0006: Contrato del adapter (v0 — alcance mínimo para `fractal new`)

**Estado:** Draft
**Autor:** Diego
**Fecha:** 2026-08-26
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

---

## 8. Preguntas abiertas

- [ ] ¿El schema del payload vive como JSON Schema standalone, o como
  tipos TypeScript exportados que el core y los adapters comparten?
- [ ] ¿Cómo declara el adapter la ruta de healthcheck cuando el runtime es
  nginx-only (ADR-0013) — mismo campo que el caso backend completo, o un
  campo distinto porque no hay aplicación detrás para healthcheck real?

---

## 9. Definition of Done

- [ ] Todos los criterios de aceptación tienen test automatizado
- [ ] Tests de snapshot de los stubs actualizados (si aplica)
- [ ] Test end-to-end pasa
- [ ] Documentación de usuario escrita
- [ ] ADRs asociados creados si hubo decisiones técnicas
- [ ] Este spec marcado como Implementado
