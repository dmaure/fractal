# SPEC-0007: Convenciones y prompts para generación asistida por agente

**Estado:** Aprobado
**Autor:** Claude
**Fecha:** 2026-11-10
**Fecha de reorientación:** 2026-11-11
**Fecha de aprobación:** 2026-11-12 (Diego)
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

### AC-9: `fractal doctor` — chequeo determinista post-deploy

`fractal doctor <target>` evalúa la salud de un deploy de forma determinista y
termina con un exit code que identifica el motivo, apto para consumir desde el
e2e de deploy.

**Alcance.** Un único comando de solo lectura que, dado un `target` (URL o
host), hace sondeos HTTP(S) y clasifica el resultado. No despliega, no modifica
el servidor ni el proyecto, y no depende de ningún framework (Art. II): la
lógica de evaluación es pura y el I/O vive aparte.

**Checks.**
1. **HTTPS/TLS responde** — el host contesta sobre HTTPS; si no, exit `2`.
2. **Página base servida** — `GET /` devuelve `200`; si devuelve otro status
   no-5xx, exit `3`.
3. **App levantada** — sin `5xx` y, si se pasó `--expect-content`, el body
   contiene ese texto; si falla, exit `4`.
4. **Redirección HTTP→HTTPS** (opcional, `--check-redirect`) — el host en HTTP
   redirige a HTTPS; si no, exit `5`.

**Contrato de exit codes (AC).**

| Code | Significado |
|------|-------------|
| `0` | Sano: todos los checks pasan. |
| `1` | Error de uso (target faltante o flag inválido). |
| `2` | HTTPS/TLS no responde. |
| `3` | La página base no se sirve (status ≠200, no-5xx). |
| `4` | La app no está levantada (5xx o falta el contenido esperado). |
| `5` | Falló la verificación de redirección HTTP→HTTPS. |

**Precedencia de fallo** (se reporta el primero que aplica): HTTPS caído >
`5xx` > status ≠200 > contenido esperado faltante > redirección.

**Flags.**

| Flag | Default | Efecto |
|------|---------|--------|
| `--expect-content <texto>` | — | Exige que el body de `GET /` contenga `<texto>`. |
| `--timeout <ms>` | `10000` | Timeout por sondeo (entero ≥1). |
| `--retries <n>` | `10` | Intentos totales **incluido el primero** (entero ≥1). |
| `--retry-delay <ms>` | `5000` | Espera entre intentos. |
| `--insecure` | off | No valida el certificado TLS. |
| `--check-redirect` | off | Verifica la redirección HTTP→HTTPS. |
| `--json` | off | Emite el resultado como JSON (incluye `reason` y el exit code). |

**Testeable.** Tests unitarios sobre la evaluación pura (`evaluateHealth`) para
cada exit code y la precedencia, sin red ni timers reales; snapshot del reporte
humano. Lint de acoplamiento en verde (Art. II).

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

## 8. Preguntas abiertas → decisiones

Al aprobar el spec (2026-11-12, Diego) se cierran las preguntas abiertas con la
opción más simple que encaja — en todos los casos la que ya quedó implementada
en FRA-102 (#117):

1. **¿Dónde se compone el pack, adapter o core?** → El **adapter** aporta las
   convenciones específicas del stack (contenido de `AGENTS.md`); el **core**
   hace la validación y la escritura atómica. (Como en #117.)
2. **¿Validación del FDL como comando dedicado o como gate?** → Comando chico
   **`fractal fdl check`** que reutiliza el validador existente
   (`packages/core/src/fdl/validator.ts`). (Como en #117.)
3. **¿Un prompt `add-entity` genérico o uno por capa?** → **Uno genérico**
   reutilizable ("agregá la entidad X siguiendo el FDL"). (Como en #117.)
4. **¿`AGENTS.md` a mano o derivado del contrato del adapter?** → **Derivado**
   de una plantilla del adapter, no a mano. (Como en #117.)
5. **¿La reorientación amerita un ADR propio?** → **No.** La reorientación ya
   queda registrada en este spec y en el ROADMAP (nota 2026-11-11), y el
   contrato de exit codes de `fractal doctor` se fija en el AC-9 de este mismo
   spec. No se abre un ADR separado.

## 9. Definition of Done

- [x] Spec aprobada por Diego (pasa de "En revisión" a "Aprobado") ✅ (2026-11-12)
- [ ] Todos los criterios de aceptación (AC-1..AC-9) verificables con test automatizado
- [ ] Tickets de implementación creados en Linear (estado Todo) con dependencias declaradas (`blockedBy`)
- [ ] (Al implementar) El lint de acoplamiento (Art. II) pasa
- [ ] (Al implementar) Tests unitarios + snapshot del pack en verde
- [ ] (Al implementar) Documentación de usuario/dev del pack (`AGENTS.md`, prompts) actualizada
- [ ] (Al implementar) `docs/progress.json` y `docs/MAPA_DE_PROGRESO.md` sincronizados vía `fractal status --write`
- [ ] Este spec marcado como Implementado (al cumplirse la DoD completa)

## 9.1 Trazabilidad

| AC | Ticket | PR | Estado |
|----|--------|----|--------|
| AC-1..AC-8 — pack de convenciones (AGENTS.md + FDL + prompt, validación y escritura atómica) | FRA-102 | #117 | Mergeado |
| AC-9 — `fractal doctor` (chequeo determinista post-deploy, contrato de exit codes) | FRA-103 | #119 | Mergeado |
| Manifiesto de configuración del pack/proyecto | FRA-104 | — | Pendiente |
| Medición de TTS y TTP en el e2e (`fractal doctor` cableado en `deploy-e2e.yml`) | FRA-105 | — | En revisión |
| Documentación de usuario del pack y de `fractal doctor` | FRA-107 | — | Pendiente |

> Tabla alineada con los títulos de Linear (fuente de verdad de los tickets) el
> 2026-11-13. El cableado de `fractal doctor` en el e2e, diferido en #119, quedó
> dentro de FRA-105: el TTP cierra cuando el doctor da sano.
