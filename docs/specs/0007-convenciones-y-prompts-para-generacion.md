# SPEC-0007: Convenciones y prompts para generación asistida por agente

**Estado:** En revisión
**Autor:** Claude
**Fecha:** 2026-11-10
**Fecha de reorientación:** 2026-11-11
**Fecha de aprobación:** —
**ADR relacionado:** ADR-0003 (diseño del FDL); posible ADR nuevo por el descarte del motor de templating (a decisión de Diego)
**Issue:** —

---

## 1. Objetivo

En lugar de un motor de templating propio, Fractal entrega un **pack de convenciones** dentro del proyecto generado (`AGENTS.md` + prompts reutilizables) y usa el **FDL como contrato validado por el core**, para que el agente de IA del proyecto escriba el código de cada entidad siguiendo el stack real, con el mínimo código propio para mantener.

## 2. Motivación

El enfoque original de SPEC-0007 (un motor `renderPlan`/`writePlan` con brazos y plantillas) resuelve, con plantillas rígidas, algo que el agente de IA ya hace mejor y adaptado al stack real del proyecto. Un motor de templates nos obliga a mantener un sustrato de generación, migrar ~1.200 líneas de generadores y versionar un contrato de plantillas — código que compite con la meta del fractal: **crear y deployar un proyecto en 30 minutos con poco código para mantener**.

Cambiamos de dirección: Fractal no genera el código de entidad. Fractal:

1. **Valida el FDL** como contrato (el core ya tiene parser + validador, VR-1..VR-12 en `packages/core/src/fdl/`): el FDL es la fuente de verdad verificable del dominio.
2. **Deja un pack de convenciones** en el proyecto generado (`AGENTS.md` con las convenciones del stack real + prompts del tipo "agregá la entidad X siguiendo el FDL"), para que el agente de IA del proyecto produzca migración, modelo, API, frontend y tests siguiendo esas convenciones.
3. **Rescata del plumbing actual solo lo chico que aporta**: escritura segura de rutas, escritura atómica y `--dry-run` para la escritura del pack.

Así el código efectivo lo escribe el agente, adaptado al framework real; Fractal mantiene únicamente la validación del FDL (ya existente) y un pack pequeño y estable.

## 3. Historias de usuario

- Como **usuario que generó un proyecto**, quiero un pack de convenciones (`AGENTS.md` + prompts) dentro del proyecto, para que mi agente de IA agregue entidades siguiendo el FDL sin que yo redacte las reglas.
- Como **core de Fractal**, quiero validar el FDL como contrato, para darle al agente una fuente de verdad verificable antes de escribir código.
- Como **PO**, quiero el mínimo código de generación propio, para mantener poco y sostener la meta de crear + deployar en 30 minutos.
- Como **bot de QA / usuario**, quiero `--dry-run` al escribir el pack, para inspeccionar qué archivos se crean sin tocar disco.

## 4. Criterios de aceptación

Formato Given/When/Then. Deben ser verificables automáticamente.

### AC-1: FDL como contrato validado
- **Dado** un archivo FDL del proyecto
- **Cuando** se valida con el core (comando/flujo de validación del FDL)
- **Entonces** un FDL válido pasa y un FDL inválido reporta todas las violaciones (`rule`, `path`, `message`) reutilizando el validador existente (VR-1..VR-12)
- **Y** un FDL inválido no habilita el flujo de "agregar entidad" (el contrato bloquea).

### AC-2: Pack de convenciones en el proyecto generado
- **Dado** `fractal new` que genera un proyecto
- **Cuando** termina el scaffolding
- **Entonces** el proyecto incluye un `AGENTS.md` con las convenciones del stack real y un archivo FDL inicial del dominio
- **Y** `AGENTS.md` documenta cómo el agente debe mapear el FDL a las capas del stack (sin introducir términos de framework en el core).

### AC-3: Prompt reutilizable "agregá la entidad X siguiendo el FDL"
- **Dado** el pack de convenciones
- **Cuando** el usuario quiere agregar una entidad
- **Entonces** existe un prompt reutilizable (plantilla de texto) que referencia el FDL validado y `AGENTS.md`, parametrizable por el nombre de la entidad
- **Y** el prompt no contiene código generado por Fractal, solo instrucciones para el agente.

### AC-4: Escritura segura de rutas
- **Dado** un `path` del pack con `..`, absoluto o que escapa del root del proyecto
- **Cuando** se escribe el pack
- **Entonces** falla con un error explícito y no escribe ningún archivo
- **Y** hay un test por caso (`..`, absoluto, escape de root).

### AC-5: Escritura atómica
- **Dado** la escritura de un archivo del pack
- **Cuando** ocurre un fallo a mitad de la escritura
- **Entonces** la escritura es atómica (tmp + rename) y no deja el proyecto a medias
- **Y** un test verifica que ante un error no quedan archivos parciales.

### AC-6: Inspección con `--dry-run`
- **Dado** `fractal new ... --dry-run` (o el flujo equivalente de escritura del pack)
- **Cuando** se ejecuta
- **Entonces** imprime los paths del pack que se escribirían sin tocar disco
- **Y** el exit code es 0 y el tempdir queda vacío tras la corrida.

### AC-7: Agnosticismo (Art. II)
- **Dado** el plumbing y los comandos en `@fractal/core`
- **Cuando** corre `scripts/lint-coupling.js`
- **Entonces** el core no contiene términos de framework (lista prohibida de ADR-0002); las convenciones específicas del stack viven en `AGENTS.md` / `packages/adapter-*`
- **Y** el lint de acoplamiento pasa.

### AC-8: Determinismo y offline
- **Dado** el mismo proyecto y FDL
- **Cuando** se escribe el pack dos veces
- **Entonces** produce los mismos archivos byte-idénticos, sin acceso a red
- **Y** un snapshot del pack es estable y funciona como fuente de verdad.

## 5. Fuera de alcance

- Un **motor de templating** (`renderPlan`/`writePlan`, brazos de generación, contrato de plantillas): se descarta; el agente escribe el código.
- La **generación efectiva del código de entidad** (migración/modelo/API/frontend/tests): la produce el agente de IA del proyecto siguiendo el pack, no Fractal.
- Reescribir los **generadores Laravel existentes** del scaffolding base (`fractal new`): siguen como están, con la misma salida.
- Un **DSL/lenguaje de plantillas nuevo** (Handlebars/EJS/Mustache).
- `fractal module` y los **módulos del proyecto generado** (Art. IX.B / M5).
- Marcar este spec como **Implementado** (lo decide Diego al cumplirse la DoD).

## 6. Dependencias

| Depende de | Tipo | Estado |
|---|---|---|
| SPEC-0004 (lenguaje FDL) | Bloqueante | Implementado |
| SPEC-0005 (parser y validador de FDL) | Bloqueante | Implementado |
| SPEC-0006 (contrato adapter v0) | Bloqueante | Implementado |
| SPEC-0001 (`fractal new` base) | Bloqueante | Implementado |
| SPEC-0032 (wizard v2 / brazos) | Blanda | Aprobado |
| ADR-0003 (diseño del FDL) | Blanda | Aprobado |

## 7. Consideraciones técnicas

- **Rendimiento:** el pack se escribe en una sola pasada, offline (protege el TTP).
- **Seguridad:** validación de rutas (sin `..`, sin absolutos, sin escapar del root); escritura atómica (tmp + rename); Fractal no ejecuta el código que escribe el agente; el pack no incluye secretos.
- **Compatibilidad / Art. II:** el plumbing y los comandos viven en `@fractal/core` sin términos de framework (pasa `scripts/lint-coupling.js`); las convenciones del stack real quedan en `AGENTS.md` / `packages/adapter-*`.
- **Reuso:** el validador del FDL ya existe (`packages/core/src/fdl/validator.ts`, VR-1..VR-12); solo se expone/engancha, no se reimplementa.
- **Forma propuesta del pack** (indicativa, sujeta a §8):
  - `AGENTS.md` — convenciones del stack real (cómo mapear el FDL a cada capa: migración, modelo, API, frontend, tests).
  - `fractal/domain.fdl.json` (o equivalente) — el FDL del dominio, contrato validable.
  - `fractal/prompts/add-entity.md` — "agregá la entidad {X} siguiendo el FDL y `AGENTS.md`".

## 8. Preguntas abiertas

- [ ] ¿El pack se compone en el adapter (convenciones específicas del stack) con plumbing agnóstico en el core, o todo en el core? (Default propuesto: convenciones en el adapter; escritura/validación en el core.)
- [ ] ¿La validación del FDL se expone como comando dedicado (`fractal fdl check`) o como gate dentro de otro flujo? (Default propuesto: comando pequeño + reuso del validador.)
- [ ] ¿Un único prompt genérico "add-entity" o uno por capa (migración/modelo/API/frontend/tests)? (Default propuesto: uno genérico que referencia `AGENTS.md`; se divide si hace falta.)
- [ ] ¿`AGENTS.md` del proyecto generado se mantiene a mano o se deriva del contrato del adapter? (Default propuesto: plantilla del adapter, versionada con el contrato.)
- [ ] ¿Esta reorientación (descarte del motor de templating) amerita un ADR propio? (Decisión de arquitectura → Diego, PO.)

## 9. Definition of Done

- [ ] Spec aprobada por Diego (pasa de "En revisión" a "Aprobado")
- [ ] Todos los criterios de aceptación (AC-1..AC-8) verificables con test automatizado
- [ ] Tickets de implementación creados en Linear (estado Todo) con dependencias declaradas (`blockedBy`)
- [ ] (Al implementar) El lint de acoplamiento (Art. II) pasa
- [ ] (Al implementar) Tests unitarios + snapshot del pack en verde
- [ ] (Al implementar) Documentación de usuario/dev del pack (`AGENTS.md`, prompts) actualizada
- [ ] (Al implementar) `docs/progress.json` y `docs/MAPA_DE_PROGRESO.md` sincronizados vía `fractal status --write`
- [ ] Este spec marcado como Implementado (al cumplirse la DoD completa)

## 9.1 Trazabilidad (AC → ticket)

Los tickets son provisionales (T1..T6); los números FRA definitivos los asigna Linear al crearlos.

| AC | Cubre | Ticket (prov.) |
|---|---|---|
| AC-1 | FDL como contrato validado (reuso del validador) | T1 |
| AC-4, AC-5 | Helpers de escritura segura (rutas) y atómica | T2 |
| AC-6 | `--dry-run` de la escritura del pack | T3 |
| AC-2, AC-8 | Pack de convenciones (`AGENTS.md` + FDL) determinista | T4 |
| AC-3 | Prompt reutilizable "agregá la entidad X" | T5 |
| AC-7 | Agnosticismo + lint de acoplamiento | T6 |
