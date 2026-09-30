# SPEC-0031: Visibilidad de estado del proyecto — mapa de avance

**Estado:** Aprobado
**Autor:** Diego
**Fecha:** 2026-09-27
**Última revisión:** 2026-09-27
**Issue:** #

---

## 1. Objetivo

Dar visibilidad continua y confiable del avance del proyecto: un comando
`fractal status` que lee una fuente de verdad estructurada (`progress.json`),
imprime un resumen legible en terminal y regenera/valida el mapa visual de
avance (`MAPA_DE_PROGRESO.md`) para que deje de mantenerse a mano.

---

## 2. Motivación

Hoy el estado del proyecto se mantiene **a mano** en `docs/MAPA_DE_PROGRESO.md`
(dos diagramas Mermaid escritos manualmente). El propio documento reconoce el
problema y propone su "generación automática" para que "el mapa deje de
actualizarse a mano y no pueda quedar desincronizado de la fuente de verdad".

Un mapa mantenido a mano se desactualiza: cambia un milestone y el diagrama
queda mintiendo hasta que alguien se acuerda de editarlo. Eso erosiona la
confianza en el mapa justo cuando más se lo necesita — para ubicarse en el día
a día.

Además, esta capability es **dogfooding**: Fractal genera aplicaciones
production-ready; que el propio proyecto tenga un comando de estado legible y
autogenerado es coherente con lo que promete a sus usuarios, y sirve de banco
de pruebas mientras Diego trabaja. Ya existe una **semilla** ejecutable de esta
capability como dev-tool del repo: `scripts/progress-map.js` (más el
`pnpm progress` que lo invoca), que lee `docs/progress.json` y regenera el
Diagrama 1. Este spec formaliza y completa esa idea como capability de producto.

---

## 3. Historias de usuario

- Como **desarrollador del proyecto (Diego)**, quiero ver de un vistazo en la
  terminal qué milestones están completados / en curso / pendientes, para
  ubicarme sin abrir varios documentos.
- Como **desarrollador del proyecto**, quiero que el mapa visual se regenere
  desde una única fuente de verdad, para que nunca quede desincronizado del
  estado real.
- Como **CI del repo**, quiero validar que el mapa está sincronizado con la
  fuente de verdad, para bloquear merges que dejarían el mapa mintiendo.
- Como **usuario de una app generada por Fractal**, quiero (a futuro) el mismo
  `fractal status` sobre mi propio proyecto, para ver su estado con la misma
  herramienta.

---

## 4. Criterios de aceptación

Formato Given/When/Then. Verificables automáticamente. Aplican a la capability
completa de producto (`fractal status` en `packages/core`); el dev-script
`scripts/progress-map.js` ya existente es la semilla que estos criterios
generalizan.

### AC-1: Resumen de estado en terminal
- **Dado** un proyecto con un `progress.json` válido en la raíz del proyecto
- **Cuando** el usuario ejecuta `fractal status`
- **Entonces** imprime cada milestone como `<glifo> <id> — <nombre>:
  <entregable>` y un conteo con porcentaje de `completado` / `en_curso` /
  `pendiente`, con exit code 0

### AC-2: Fuente de verdad estructurada
- **Dado** que `progress.json` es la única fuente de verdad del estado
- **Cuando** `fractal status` necesita datos de avance
- **Entonces** los lee exclusivamente de `progress.json` (no de Linear, Notion
  ni de los diagramas mismos), y falla con un error claro y accionable si el
  archivo falta, no parsea, o tiene un `estado` fuera del enum permitido
  (`completado | en_curso | pendiente`)

### AC-3: Regeneración del mapa visual (ambos diagramas)
- **Dado** un `MAPA_DE_PROGRESO.md` con los marcadores de auto-generación
- **Cuando** el usuario ejecuta `fractal status` en modo escritura (por
  defecto)
- **Entonces** regenera el **Diagrama 1 (milestones)** y el **Diagrama 2
  (capacidades y módulos)** desde `progress.json`, coloreando los nodos por su
  `estado`, de forma **idempotente** (ejecutarlo dos veces no produce diff)

### AC-4: Modo `--check` para CI
- **Dado** un `progress.json` y un `MAPA_DE_PROGRESO.md`
- **Cuando** el usuario o la CI ejecuta `fractal status --check`
- **Entonces** regenera en memoria y **no escribe**; sale con código 0 si el
  mapa está sincronizado, y con código distinto de 0 y un mensaje accionable si
  está desactualizado

### AC-5: Marcadores ausentes o inválidos
- **Dado** un `MAPA_DE_PROGRESO.md` sin los marcadores de auto-generación
  esperados (o con ellos invertidos)
- **Cuando** se ejecuta `fractal status` (escritura o `--check`)
- **Entonces** falla con un error claro que nombra los marcadores esperados, en
  vez de corromper el documento

---

## 5. Fuera de alcance

- Sub-nodos por spec dentro de cada milestone en el diagrama (iteración futura
  del mapa; hoy el modelo es a nivel de milestone y de capability/concepto).
- Integración con Linear / Notion como fuente de datos (decisión de Diego:
  `progress.json` es la fuente de verdad; ver §7).
- Cualquier UI web o dashboard; esto es CLI + documento en el repo.
- Cambiar el contenido semántico del Diagrama 2 más allá de moverlo a
  generación desde `progress.json` (extender el modelo de datos de capacidades
  se hace en este mismo spec, pero sin agregar capacidades nuevas al mapa).

---

## 6. Dependencias

| Depende de | Tipo | Estado |
|---|---|---|
| ADR-0001 (CLI híbrido Node) | Bloqueante | Aceptado |
| ADR-0003 (JSON como representación intermedia) | Blanda | Aceptado |
| SPEC-0002 (bridge Node → toolchain) | Blanda | Aprobado |

> Nota: el MVP `scripts/progress-map.js` no depende de ninguno de estos —
> es Node stdlib puro. Las dependencias aplican a la migración a la capability
> de producto `fractal status` dentro de `packages/core`.

---

## 7. Consideraciones técnicas

Restricciones conocidas, no diseño.

**Fuente de verdad: JSON (decisión de Diego)**
- El estado se modela en un **archivo JSON estructurado** (`progress.json`), no
  en los diagramas ni en un servicio externo. Justificación: es legible y
  mantenible por humanos y máquinas, versiona en git junto al código, y
  **no acopla el proyecto a Linear ni a Notion** (Linear puede ser reemplazado
  por Notion; el mapa debe seguir funcionando de forma self-contained en el
  repo). Consistente con la convención del proyecto de preferir JSON (ADR-0003).

**Enum de estado**
- `estado` está restringido a `completado | en_curso | pendiente`, con glifos
  `✅ | 🟡 | ⬜` (los mismos de `ROADMAP.md` más el intermedio 🟡 del mapa). Un
  valor fuera del enum es error (AC-2).

**Patrón auto-generación + `--check`**
- La regeneración es entre marcadores HTML (`<!-- progress-map:auto:start -->` /
  `<!-- progress-map:auto:end -->`) e **idempotente**. El modo `--check` no
  escribe y sirve como guardia de CI, mismo patrón que otros generadores del
  repo. El comando debe ser robusto ante JSON ausente/ inválido y marcadores
  ausentes.

**Agnosticismo (Artículo II)**
- La lógica de `fractal status` vive en `packages/core` y es agnóstica de
  framework: opera sobre `progress.json` y markdown, sin conocer ningún target.

**Seguridad**
- No maneja secrets; solo lee/escribe archivos del repo del proyecto.

**Compatibilidad**
- El shape de `progress.json` debe poder crecer (p. ej. capacidades/paquetes
  para el Diagrama 2) sin romper a `fractal status` existente.

---

## 8. Preguntas abiertas

Ninguna pendiente. Las decisiones de diseño están tomadas por Diego (Opción C —
implementar ahora):

- [x] Fuente de verdad → **JSON self-contained en el repo** (`progress.json`),
  no Linear/Notion.
- [x] Formato de salida → resumen en terminal + regeneración del mapa con modo
  `--check` para CI.
- [x] Semilla → el dev-script `scripts/progress-map.js` ya existe y valida el
  enfoque; la capability de producto lo generaliza en `packages/core`.

---

## 9. Definition of Done

- [ ] Todos los criterios de aceptación tienen test automatizado
- [ ] `fractal status` implementado en `packages/core`, agnóstico de framework
- [ ] Diagrama 1 y Diagrama 2 generados desde `progress.json`, idempotentes
- [x] Modo `--check` cableado en CI (FRA-45)
- [ ] Lint de acoplamiento limpio (sin términos de framework en core)
- [ ] Documentación de usuario escrita
- [ ] Este spec marcado como Implementado

---

## 10. Descomposición en tickets (propuesta para Linear)

> **Nota:** esto es una **propuesta**. Esta sesión no tiene acceso de escritura
> a Linear; el PM/Claude debe cargar estos tickets como `FRA-NN`, declarar las
> dependencias como relación real (`blockedBy`, ver AGENT_PLAYBOOK) y moverlos a
> **Ready for AI**. Los tickets se derivan de los criterios de aceptación del §4
> y no agregan alcance. **Punto de partida:** ya existe un MVP dev-script,
> `scripts/progress-map.js` (invocado por `pnpm progress`), que cubre lectura de
> `progress.json`, resumen en terminal, generación del Diagrama 1 y modo
> `--check`; los tickets lo generalizan a la capability de producto.

### T1 — `fractal status`: lectura de `progress.json` + salida en terminal

- **Context:** AC-1 y AC-2. Hoy el resumen de estado solo existe como dev-script
  del repo (`scripts/progress-map.js`); no hay comando de producto.
- **Objective:** Implementar `fractal status` en `packages/core` que lea
  `progress.json` del proyecto e imprima el resumen legible (milestone por
  milestone + conteo/porcentaje por estado).
- **Technical Context:** Agnóstico de framework (Artículo II, ADR-0002).
  `progress.json` es la única fuente de verdad (§7). Enum de estado
  `completado | en_curso | pendiente` (AC-2). Portar la lógica del MVP
  `scripts/progress-map.js` como base.
- **Implementation Notes:** Validación estricta del JSON (archivo ausente,
  parseo inválido, estado fuera de enum) con mensajes accionables. Salida
  determinística.
- **Acceptance Criteria:** AC-1, AC-2.
- **Tests:** Unit tests de parseo/validación (válido, ausente, inválido, enum
  malo) y del formato de salida; lint de acoplamiento confirmando que el módulo
  no menciona frameworks.
- **Documentation:** Documentar `fractal status` en la doc de usuario del CLI.
- **Dependencies:** ADR-0001 (Aceptado), ADR-0003 (Aceptado). Base de los otros
  tickets.
- **Definition of Done:** Comando implementado en `packages/core`, tests en
  verde, lint de acoplamiento limpio, documentado.

### T2 — Generación del Diagrama 1 y Diagrama 2 del mapa desde `progress.json`

- **Context:** AC-3. El MVP ya genera el **Diagrama 1** entre marcadores; falta
  llevarlo al core y **extenderlo al Diagrama 2** (capacidades y módulos), hoy a
  mano.
- **Objective:** Que `fractal status` (modo escritura, por defecto) regenere
  ambos diagramas de `MAPA_DE_PROGRESO.md` desde `progress.json`, coloreando por
  estado, de forma idempotente.
- **Technical Context:** Regeneración entre marcadores HTML; el Diagrama 2
  requiere extender el shape de `progress.json` para modelar
  capacidades/paquetes (compatible hacia atrás, §7). Reutilizar el generador del
  MVP para el Diagrama 1.
- **Implementation Notes:** Idempotencia estricta (dos corridas = sin diff).
  Marcadores propios para cada diagrama.
- **Acceptance Criteria:** AC-3; se apoya en AC-5 (manejo de marcadores).
- **Tests:** Tests de idempotencia y de que el coloreado refleja el `estado`;
  snapshot de los bloques generados de ambos diagramas.
- **Documentation:** Actualizar `MAPA_DE_PROGRESO.md` y la doc de usuario.
- **Dependencies:** **Bloqueado por T1.**
- **Definition of Done:** Ambos diagramas generados e idempotentes, tests y
  snapshots en verde, lint limpio.

### T3 — Modo `--check` y cableado en CI

- **Context:** AC-4 y AC-5. El MVP ya soporta `--check`; falta llevarlo al
  producto y correrlo en CI para que un mapa desactualizado bloquee el merge.
- **Objective:** Implementar `fractal status --check` (no escribe; exit != 0 si
  el mapa está desincronizado o faltan/están invertidos los marcadores) y
  agregarlo al pipeline de CI del repo.
- **Technical Context:** Mismo generador que T2, ejecutado en memoria y
  comparado contra el documento en disco. Errores accionables (§7). Se conecta
  con el ítem "CI base" de M0 en ROADMAP.
- **Implementation Notes:** Reutilizar la comparación del MVP. Mensaje que
  indique cómo regenerar (`fractal status` / `pnpm progress`).
- **Acceptance Criteria:** AC-4, AC-5.
- **Tests:** Tests de `--check` para sincronizado (exit 0), desincronizado (exit
  != 0) y marcadores ausentes; job de CI verde en un repo sincronizado.
- **Documentation:** Documentar el uso en CI.
- **Dependencies:** **Bloqueado por T1 y T2.**
- **Definition of Done:** `--check` implementado, job de CI activo, tests en
  verde, lint limpio.
