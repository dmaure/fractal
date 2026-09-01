# Arquitectura del flujo de trabajo

> El mapa completo del sistema: quién es cada pieza, cómo se conectan, y en
> qué estado quedó cada duda que se planteó al armarlo. Este documento
> describe el sistema **tal como existe hoy** — no es una aspiración. Última
> verificación: 2026-08-31.
>
> Para las reglas de comportamiento de los agentes (qué puede y no puede
> hacer Cursor al implementar, el schema de ticket), ver
> [`docs/AGENT_PLAYBOOK.md`](AGENT_PLAYBOOK.md). Este documento es el mapa;
> ese es el manual de cada ejecutor.

---

## 1. El circuito completo

```
IDEA / REQUERIMIENTO (Diego habla con Claude)
        │
        ▼
   CLAUDE analiza
        │
        ├── ¿hay alternativas de arquitectura?  → ADR (Propuesto) → Diego decide
        ├── ¿es una capability nueva?           → SPEC (Draft) → Diego aprueba
        │
        ▼
CLAUDE descompone el spec Aprobado en tickets
        │
        ▼
      LINEAR  (fuente de verdad del trabajo pendiente)
        │
        │  ticket en estado READY FOR AI
        ▼
   N8N (gatekeeper) — workflow "Linear (Ready for AI) → Cursor Cloud Agent v2"
        │  dos disparadores independientes, misma lógica:
        │    • webhook de Linear (inmediato, cuando un issue entra a Ready for AI)
        │    • chequeo por schedule cada 15 min (agarra tickets que ya estaban
        │      esperando y se desbloquearon sin que su estado cambiara — Gap 1)
        │
        │  antes de lanzar nada:
        │  1. lista TODOS los candidatos del proyecto en Ready for AI
        │  2. descarta los que tienen algún blockedBy sin resolver
        │  3. ordena por prioridad
        │  4. chequea que no haya otro corriendo (límite de concurrencia = 1)
        │  5. marca el elegido como AI WORKING
        ▼
   CURSOR (Cloud Agent)
        │  lee el ticket, analiza el repo, implementa, testea, hace commit
        │  crea la rama con el nombre que Linear ya generó (gitBranchName),
        │  lo que permite que la integración GitHub↔Linear la reconozca sola
        ▼
    GITHUB (Pull Request)
        │  Linear detecta el PR por el nombre de rama y lo linkea al ticket
        │  (integración GitHub↔Linear confirmada activa en dmaure/fractal)
        ▼
   DIEGO revisa
        │
        ├── pide cambios  → ticket vuelve a CHANGES REQUESTED, Cursor itera
        └── aprueba y mergea → Linear cierra el ticket (Done) automáticamente
        │
        ▼
   (n8n vuelve a evaluar candidatos en el próximo webhook o chequeo periódico)
```

---

## 2. Roles

| Quién | Rol | No hace |
|---|---|---|
| **Diego** | Decide arquitectura (ADRs), prioridades, aprueba specs, revisa y mergea PRs. Product Owner / Tech Lead / Reviewer. | No implementa código directamente en el flujo normal. |
| **Claude** | Analiza requerimientos, escribe specs y ADRs, los descompone en tickets de Linear con contexto suficiente para que Cursor no necesite volver a preguntar. | No decide entre alternativas de arquitectura con más de una opción viable. No implementa código de `packages/` salvo pedido explícito. |
| **Linear** | Fuente de verdad de qué hay que hacer, en qué estado está, y qué lo bloquea. | No es fuente de verdad del código ni de las decisiones de arquitectura — eso vive en `docs/`. |
| **n8n** | Gatekeeper determinístico entre Linear y Cursor: decide *cuándo* y *cuál* ticket se lanza, sin usar ningún modelo de lenguaje para esa decisión — es lógica de filtro/orden pura sobre datos que Linear ya expone. | No decide qué trabajo existe ni cómo se prioriza conceptualmente — solo ejecuta las reglas mecánicas sobre lo que ya está en Linear. |
| **Cursor (Cloud Agent)** | Implementa contra el ticket: lee contexto, analiza el repo, escribe código, corre tests/lint, commitea, abre PR. | No decide alcance no cubierto por el ticket. |
| **GitHub** | Fuente de verdad del código. Todo cambio pasa por PR. | Nunca se pushea directo a `master`. |

---

## 3. Por qué n8n y no una IA decidiendo qué ticket sigue

Se evaluó explícitamente poner una IA a decidir "qué ticket sigue" en cada evento, y se descartó para esa capa: chequear si un ticket está bloqueado y comparar prioridades es lógica determinística — comparar campos que Linear ya expone (`blockedBy`, `priority`, `state`). Una IA ahí introduce una fuente de error (alucinación) exactamente en el paso donde menos se la quiere, más lenta y más cara sin ninguna ganancia real.

El lugar donde una IA sí aporta es distinto: releer el plan completo (`docs/`) y el estado de Linear para decidir *qué debería existir como próximo trabajo* — eso es lo que hace Claude al armar el backlog, no algo que deba correr en cada evento de selección.

**Mejora futura considerada, no construida todavía:** un chequeo de baja frecuencia (diario, o cuando el backlog ejecutable se vacía) que relea `docs/`, Linear y los PRs recientes, y le reporte a Diego qué se completó, qué decisión está pendiente, y si algo divergió del plan. Se conversó el 2026-08-31 y quedó pendiente de que Diego decida si y cómo la quiere (vía la skill `schedule` de Claude Code) — no es una regla del sistema todavía, es una idea.

---

## 4. Estados de Linear y su significado operativo

| Estado | Categoría Linear | Significado |
|---|---|---|
| `Backlog` | backlog | Idea o trabajo todavía no preparado |
| `Todo` | unstarted | Tarea definida pero requiere más análisis/documentación antes de ejecutarse (equivale a "Planned") |
| `READY FOR AI` | unstarted | Suficientemente especificado para que Cursor lo ejecute sin preguntar |
| `AI WORKING` | started | n8n ya marcó este ticket como el elegido; Cursor debería estar trabajando en él |
| `PR READY` | started | Existe un PR — **hoy no se mueve solo** (Gap 2, sección 6), requiere moverlo a mano hasta que se resuelva |
| `HUMAN REVIEW` | started | Listo para que Diego revise |
| `CHANGES REQUESTED` | started | La revisión encontró problemas, Cursor debe seguir |
| `Done` | completed | PR aprobado y mergeado — **hoy no se mueve solo** (Gap 2, sección 6), requiere moverlo a mano hasta que se resuelva |

---

## 5. Regla dura: cuándo un ticket puede pasar a READY FOR AI

Un ticket pasa a `READY FOR AI` únicamente cuando:

- El objetivo está claro
- Los criterios de aceptación son verificables
- Las dependencias están identificadas (como relación real de Linear, no solo texto)
- Existe suficiente contexto técnico (schema de ticket en `AGENT_PLAYBOOK.md`)
- No quedan decisiones de producto pendientes
- No requiere que Diego vuelva a explicar el problema

Si falta algo, el ticket se queda en `Todo` y Claude indica qué información o decisión falta. Ya se aplicó en la práctica: SPEC-0001 y SPEC-0002 volvieron de Aprobado a Draft dos veces durante M0 porque aparecieron requisitos nuevos (ADR-0010, ADR-0012) — ningún ticket se forzó a Ready for AI mientras el spec detrás todavía tenía preguntas abiertas.

---

## 6. Historial de gaps encontrados y resueltos

Se identificaron revisando el circuito completo antes de la primera ejecución real (2026-08-31), antes de haberlo corrido nunca.

### Gap 1 — resuelto: el gatekeeper no re-evaluaba tickets que ya estaban esperando

El workflow original disparaba solo cuando el **estado de un issue cambiaba a** `READY FOR AI`. Si varios tickets ya estaban en ese estado y el primero se completaba, los que quedaban desbloqueados no se re-evaluaban — nada disparaba un nuevo webhook para ellos.

**Resuelto:** se agregó un segundo disparador por schedule (cada 15 min) que corre la misma lógica de selección, independiente del webhook. Implementado en el workflow de n8n, versión `f0cd693c` en adelante.

### Gap 2 — reabierto: la transición automática de estados post-implementación NO funciona

Se había marcado "resuelto" en base a que la integración GitHub↔Linear
estaba activa y a que Cursor genera ramas con el nombre convención de
Linear. **La primera ejecución real (FRA-22, 2026-09-01) demostró que
eso no alcanza:**

- Cursor no usó el nombre de rama que Linear sugiere (`gitBranchName`:
  `dmaure17/fra-22-...`) — usó uno propio (`cursor/monorepo-pnpm-y-lint-7647`).
- El PR se creó mencionando "FRA-22" en el título y cuerpo, pero **Linear no
  lo detectó ni lo adjuntó al ticket** — ni al abrirse, ni al mergearse.
- Diego tuvo que mergear el PR a mano, y el ticket se movió a `Done`
  manualmente (por mí, no por la integración).

**Causa probable:** la integración GitHub↔Linear vincula por nombre de rama
o por sintaxis específica en el PR (ej. `Fixes FRA-22`), no por mención
libre del identificador. Ninguna de esas dos condiciones se cumplió acá.

**Pendiente de decisión (Diego):**
- Opción A — forzar que Cursor siempre use el `gitBranchName` exacto que
  Linear genera para el ticket (configuración del agente o del prompt).
- Opción B — no depender de la integración nativa: construir un paso
  explícito en n8n disparado por webhook de GitHub (PR abierto → mover a
  `PR READY`; PR mergeado → mover a `Done`), usando el link al PR en vez
  del nombre de rama.
- Opción C — probar la sintaxis exacta que la integración de Linear espera
  en el cuerpo del PR (ej. `Fixes FRA-22`) antes de descartar la vía nativa.

Hasta que se resuelva, **el estado post-`AI WORKING` requiere intervención
manual de Diego o de Claude** — no es automático todavía.

---

## 7. Primera ejecución real (2026-08-31)

Se corrió el workflow por primera vez en producción, disparado por el chequeo
periódico (no el webhook). Encontró y corrigió dos bugs adicionales,
específicos de haber agregado el segundo disparador (Gap 1):

- El nodo de filtro inicial (`¿Cambió a Ready for AI ahora?`) todavía
  referenciaba datos exclusivos del webhook (`$('Linear Webhook')`), y
  explotaba al disparar por schedule. Se reemplazó por un nodo `Evaluar Gate`
  que detecta el origen (`$('Linear Webhook').isExecuted`) y solo aplica el
  chequeo específico de transición cuando el disparo vino de un webhook real;
  si vino del schedule, pasa directo.
- Las dos mutaciones GraphQL de escritura (`Marcar como AI WORKING`,
  `Comentar en Linear`) tenían una llave de más al final de la query,
  typeado a mano — Linear las rechazaba con error de sintaxis antes de
  aplicar nada. Corregido en ambas.

**Con los bugs corregidos, la lógica funcionó de punta a punta contra datos
reales:** el chequeo periódico (disparado automáticamente por n8n, no de
forma manual) listó los 6 candidatos, descartó los bloqueados, eligió
FRA-22 como único elegible, y lo marcó `AI WORKING` en Linear
(`issueUpdate: success`).

**Bloqueo real encontrado, no un bug del workflow:** el lanzamiento del
agente falló con `usage_limit_exceeded` — la cuenta de Cursor no tenía
pricing por uso habilitado ni un spend limit configurado para Background
Agents. Se repitió dos veces más (el gatekeeper reintentaba solo, sin
intervención, cada vez que FRA-22 volvía a `READY FOR AI`) hasta que Diego
configuró un Monthly Limit en Cursor → Spending → On-Demand Usage.

**Confirmado funcionando de punta a punta con un agente real:** una vez
resuelto el billing, el mismo mecanismo (sin ningún cambio de código)
lanzó un Cursor Cloud Agent real sobre FRA-22 —
[`bc-0f8588ac-d7b5-48ff-90b7-cb3dd1cb1356`](https://cursor.com/agents/bc-0f8588ac-d7b5-48ff-90b7-cb3dd1cb1356),
estado `ACTIVE`— confirmando el circuito completo Linear → n8n → Cursor sin
intervención manual más allá de la configuración de billing.

**El cierre del ciclo reabrió el Gap 2 (2026-09-01).** El agente terminó el
código correctamente (branch `cursor/monorepo-pnpm-y-lint-7647`, commit
`798b743`), pero no pudo abrir el PR — su token de sistema era de solo
lectura. Diego configuró un Personal Access Token con permisos de
escritura. Con el código ya terminado, el PR se abrió manualmente
([#17](https://github.com/dmaure/fractal/pull/17), por Claude, ya que el
intento de la sesión vieja del agente seguía sin el token nuevo) y Diego lo
mergeó — pero como el PR no usaba el nombre de rama que Linear espera, la
integración nunca lo linkeó: ni al abrirse ni al mergear. El ticket se
cerró manualmente. Ver Gap 2 (sección 6) para las opciones de cómo cerrar
esto de verdad.

---

## 8. Referencias

- [`docs/AGENT_PLAYBOOK.md`](AGENT_PLAYBOOK.md) — reglas de comportamiento para Claude y para Cursor al implementar, schema de ticket
- [`.cursor/rules/fractal.mdc`](../.cursor/rules/fractal.mdc) — versión resumida cargada automáticamente en Cursor
- [`docs/PROCESO.md`](PROCESO.md) — ciclo de trabajo, numeración, branches, commits
- Workflow de n8n: [Linear (Ready for AI) → Cursor Cloud Agent v2](https://n8n.universofractal.dev/workflow/sF5SIIrRWKyvQ2HI) — el detalle técnico (queries GraphQL, nombres de nodos) vive ahí, con su propio historial de versiones, no se duplica acá
