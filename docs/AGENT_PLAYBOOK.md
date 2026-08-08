# Agent Playbook

> Guía operativa para agentes de IA que trabajan en Fractal. Expande la
> sección "Uso de agentes de IA" de `docs/PROCESO.md` con pasos concretos.
> `.cursor/rules/fractal.mdc` es la versión resumida que se carga
> automáticamente en Cursor; este documento es la versión completa, para
> leer antes de empezar a trabajar en el repo.

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
- **Los agentes de documentación** (por ejemplo, la sesión de Claude que
  redacta specs y ADRs) escriben la documentación fundacional, pero nunca
  deciden entre alternativas viables: en un ADR con más de una opción, el
  campo Decisión queda vacío hasta que Diego lo resuelve.
- **Cursor** (u otro agente de código) implementa contra el spec ya
  Aprobado. No inventa alcance ni decide entre alternativas técnicas no
  resueltas por el spec o sus ADRs.

---

## Durante la implementación

- No se toca `packages/core` ni `packages/deploy` sin verificar
  explícitamente el Artículo II antes de cada commit (ver la lista de
  términos prohibidos en ADR-0002 y en `.cursor/rules/fractal.mdc`).
- Si aparece una decisión técnica que el spec no cubre y existe más de una
  alternativa razonable, no se elige por cuenta propia: se detiene el
  trabajo, se documenta el punto de bloqueo, y se pide que se escriba un ADR
  nuevo antes de continuar.
- Todo stub nuevo o modificado lleva su test de snapshot (Artículo X). Sin
  snapshot actualizado, no se mergea.
- Todo PR sigue el formato de `docs/PROCESO.md`: declara el spec que
  implementa, los criterios de aceptación cubiertos, los ADRs creados si los
  hubo, y el checklist completo.

---

## Al terminar

- Correr el lint de acoplamiento localmente antes de abrir PR.
- Si el código divergió del spec durante la implementación, actualizar el
  spec en el mismo PR (Artículo XI, punto 3) — no dejarlo para después.
- Marcar el spec como Implementado solo cuando se cumple la Definition of
  Done completa descrita en `docs/PROCESO.md`.

---

## Señales de alerta — detenerse y preguntar

- El spec es ambiguo en un punto necesario para continuar.
- La implementación requeriría que `packages/core` o `packages/deploy`
  sepan algo de un framework concreto.
- No existe ADR para una decisión que claramente tiene más de una
  alternativa razonable.
- El cambio rompe la paridad entre targets (Artículo III) sin documentar la
  divergencia.
- Un agente propone una decisión técnica no contemplada en el spec ni en
  ningún ADR existente (regla 3 de "Uso de agentes de IA" en
  `docs/PROCESO.md`): se detiene, no se resuelve sobre la marcha.

---

## Referencias

- `docs/CONSTITUTION.md` — principios innegociables
- `docs/PROCESO.md` — ciclo de trabajo completo
- `docs/adr/` — decisiones ya tomadas
- `docs/specs/` — especificaciones de cada capability
- `.cursor/rules/fractal.mdc` — reglas operativas cargadas automáticamente
  en Cursor
