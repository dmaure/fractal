# Agent Playbook

> Reglas de comportamiento para los agentes de IA que trabajan en Fractal
> (Claude al preparar trabajo, Cursor al implementarlo). Para el mapa
> completo del sistema — quién es cada pieza, el diagrama del circuito,
> los estados de Linear — ver
> [`docs/ARCHITECTURE_WORKFLOW.md`](ARCHITECTURE_WORKFLOW.md). Este
> documento es el manual de cada ejecutor; ese es el mapa.

---

## Antes de empezar

1. Leer `docs/CONSTITUTION.md` completo, en especial el Artículo II.
2. Leer el spec que vas a implementar, en `docs/specs/`. Si no está en estado
   **Aprobado**, no se implementa — se avisa y se espera.
3. Revisar los ADRs vinculados al spec, en `docs/adr/`, para entender qué
   decisiones técnicas ya están tomadas y cuáles siguen pendientes.

---

## División de responsabilidades

- **Diego decide arquitectura**: qué opción se elige en cada ADR, qué se
  prioriza en el roadmap.
- **Claude** escribe la documentación fundacional y descompone specs
  Aprobados en tickets, pero nunca decide entre alternativas viables: en un
  ADR con más de una opción, el campo Decisión queda vacío hasta que Diego
  lo resuelve.
- **Cursor** implementa contra el ticket ya en Ready for AI. No inventa
  alcance ni decide entre alternativas técnicas no resueltas por el ticket
  o sus ADRs.

---

## Schema de ticket

Todo ticket que Claude crea en Linear sigue esta estructura fija:

`Context` · `Objective` · `Technical Context` · `Implementation Notes` ·
`Acceptance Criteria` · `Tests` · `Documentation` · `Dependencies` ·
`Definition of Done`

Las dependencias se declaran como relación real de Linear (`blockedBy`), no
solo mencionadas en el texto — es lo que el orquestador (gatekeeper) necesita para
funcionar (ver `ARCHITECTURE_WORKFLOW.md`, sección 3).

Un ticket pasa a **Ready for AI** solo cuando el objetivo está claro, los
criterios de aceptación son verificables, las dependencias están
identificadas, hay suficiente contexto técnico, y no quedan decisiones de
producto pendientes. Si falta algo, se queda en `Todo` y se indica qué
falta — no se fuerza.

---

## Durante la implementación (Cursor)

- No se toca `packages/core` ni `packages/deploy` sin verificar
  explícitamente el Artículo II antes de cada commit (ver la lista de
  términos prohibidos en ADR-0002 y en `.cursor/rules/fractal.mdc`).
- Si aparece una decisión técnica que el ticket no cubre y existe más de una
  alternativa razonable, no se elige por cuenta propia: se documenta el
  punto de bloqueo en el PR y se espera.
- Todo stub nuevo o modificado lleva su test de snapshot (Artículo X). Sin
  snapshot actualizado, no se mergea.
- Todo PR sigue el formato de `docs/PROCESO.md`: declara el spec o ticket
  que implementa, los criterios de aceptación cubiertos, los ADRs creados
  si los hubo, y el checklist completo.

### Abrir el PR

- Trabajar en la rama con el nombre exacto que indica el orquestador.
- Abrir el PR **no draft** con `gh pr create` (usa `GH_TOKEN` del
  entorno). Título `FRA-<n>: <título>`, y en el cuerpo la línea
  `Fixes FRA-<n>`.
- Si no se puede crear, responder con el error exacto y el nombre de la
  rama. El orquestador lo crea como respaldo; no se reintenta en loop.

### Responder al code review

- Resolver **cada** comentario en la misma rama y el mismo PR, nunca
  abriendo un PR nuevo.
- Responder cada comentario con lo que se hizo, o con por qué no se hizo
  si el comentario contradice el ticket, el spec o un ADR. En ese caso no
  se elige solo: se marca como punto de bloqueo.
- Un commit por corrección lógica (`fix(<scope>): …`), sin reescribir los
  commits que ya se revisaron.
- No modificar `docs/ORCHESTRATOR_PLAYBOOK.md`: son las instrucciones del
  orquestador y solo las cambian Diego o Claude.

---

## Code review (Claude)

Claude revisa cada PR del agente de código antes de que llegue a Diego. El
orquestador le pide el review con el link al PR, el ticket y el número de
ronda.

**Contra qué se revisa**, en este orden:

1. **Criterios de aceptación del ticket:** cada AC cubierto y con test. Si
   falta uno, son cambios pedidos.
2. **Artículo II:** ningún término de framework en `packages/core` ni
   `packages/deploy`.
3. **Alcance:** nada fuera de lo que pide el ticket, y ninguna decisión
   técnica no cubierta por el spec o un ADR.
4. **Checklist de `docs/PROCESO.md`:** snapshots, e2e, docs, spec
   actualizado si el código divergió.
5. **Corrección y legibilidad:** bugs, casos borde, tests que no prueban
   lo que dicen probar.
6. **Archivos sensibles:** si el PR toca `docs/ORCHESTRATOR_PLAYBOOK.md`,
   `.github/` o `.cursor/rules/`, son cambios pedidos, salvo que el ticket
   lo pida explícitamente.

**Cómo se responde:**

- Comentarios en línea en el PR, cada uno accionable: qué está mal y qué se
  espera. Sin comentarios de gusto personal; si algo es opcional, se marca
  como `nit:` y no bloquea.
- Al final, **un** comentario en el PR que empieza con una de estas dos
  líneas exactas, porque el orquestador las detecta:
  - `CR Claude — APROBADO`
  - `CR Claude — CAMBIOS PEDIDOS`

  Abajo, el resumen: qué AC quedan cubiertos y qué hay que corregir.
- En la ronda N+1 se verifica que se resolvió lo pedido en la ronda N. No
  se abren temas nuevos que ya estaban en el diff anterior, salvo bugs
  reales.

---

## Al terminar (Claude, al escribir specs/ADRs)

- Correr el lint de acoplamiento localmente antes de abrir PR.
- Si el código diverge del spec durante la implementación, actualizar el
  spec en el mismo PR (Artículo XI, punto 3) — no dejarlo para después.
- Marcar el spec como Implementado solo cuando se cumple la Definition of
  Done completa descrita en `docs/PROCESO.md`.

---

## Señales de alerta — detenerse y preguntar

- El ticket o spec es ambiguo en un punto necesario para continuar.
- La implementación requeriría que `packages/core` o `packages/deploy`
  sepan algo de un framework concreto.
- No existe ADR para una decisión que claramente tiene más de una
  alternativa razonable.
- El cambio rompe la paridad entre targets (Artículo III) sin documentar la
  divergencia.
- Un agente propone una decisión técnica no contemplada en el spec ni en
  ningún ADR existente: se detiene, no se resuelve sobre la marcha.

---

## Referencias

- `docs/ARCHITECTURE_WORKFLOW.md` — mapa completo del sistema y el circuito
- `docs/CONSTITUTION.md` — principios innegociables
- `docs/PROCESO.md` — ciclo de trabajo completo
- `docs/adr/` — decisiones ya tomadas
- `docs/specs/` — especificaciones de cada capability
- `.cursor/rules/fractal.mdc` — reglas operativas cargadas automáticamente
  en Cursor
