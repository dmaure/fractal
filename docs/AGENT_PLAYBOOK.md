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
solo mencionadas en el texto — es lo que el gatekeeper de n8n necesita para
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
