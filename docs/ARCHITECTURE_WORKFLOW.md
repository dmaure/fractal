# Arquitectura del flujo de trabajo

> El mapa completo del sistema: quién es cada pieza, cómo se conectan, y en
> qué estado quedó cada duda que se planteó al armarlo. Este documento
> describe el sistema **tal como existe hoy** — no es una aspiración. Última
> verificación: 2026-10-03.
>
> Las piezas se describen por **rol** (orquestador, agente de código,
> tracker), no por herramienta: las herramientas concretas se cambian a
> medida que aparecen mejores opciones. Qué herramienta cumple cada rol hoy
> vive en un único lugar — la tabla "Implementación actual" de la sección 2.
>
> Documentos hermanos: [`AGENT_PLAYBOOK.md`](AGENT_PLAYBOOK.md) es el
> manual de quien implementa y de quien revisa código (schema de ticket,
> code review); [`ORCHESTRATOR_PLAYBOOK.md`](ORCHESTRATOR_PLAYBOOK.md) es el
> manual operativo del orquestador, y además es la fuente de la que el
> orquestador lee sus instrucciones. Este documento es el mapa; esos son los
> manuales.

---

## 1. El circuito completo

```
IDEA (Diego)
   │
   ▼
DIEGO + CLAUDE desarrollan la idea
   │  ├── ¿alternativas de arquitectura?  → ADR (Propuesto) → Diego decide
   │  └── ¿capability nueva?              → SPEC (Draft) → Diego aprueba
   ▼
CLAUDE escribe/commitea la documentación y crea los tickets
   │  (los que cumplen la sección 5 quedan en READY FOR AI)
   ▼
TRACKER (fuente de verdad del trabajo pendiente)
   │
   ▼
ORQUESTADOR ── todas las mañanas: mapa de estado + "¿cuál es el próximo paso?"
   │            (módulo en curso, si su DoD se cumple, qué falta, qué sigue)
   │
   │  selección determinística (bloqueos, prioridad, concurrencia = 1)
   ▼
AGENTE DE CÓDIGO implementa en la rama indicada y abre el PR
   │  (si no puede abrirlo, el orquestador lo abre como respaldo)
   ▼
┌─▶ ORQUESTADOR le pide el code review a CLAUDE           [PR READY]
│     │
│     ▼
│   CLAUDE revisa y deja comentarios + veredicto en el PR
│     │
│     ├── CAMBIOS PEDIDOS → el orquestador le avisa al agente   [CHANGES REQUESTED]
│     │        │
│     │        ▼
└─────┴── el agente corrige y pushea (máximo 3 rondas, después decide Diego)
      │
      └── APROBADO → DIEGO hace el review final            [HUMAN REVIEW]
               │
               ├── pide cambios → vuelve al ciclo de arriba
               └── mergea → el orquestador cierra el ticket   [Done]
                        │
                        ▼
               el orquestador elige el próximo ticket (y el barrido periódico
               cada hora agarra lo que los eventos no dispararon)

Una vez por semana: review del sprint (métricas, fallas, mejoras, objetivo
de la semana) entre el orquestador, Diego y Claude.
```

Detalle de cada paso del orquestador: `ORCHESTRATOR_PLAYBOOK.md`.

---

## 2. Roles

| Quién | Rol | No hace |
|---|---|---|
| **Diego** | Product Owner / Tech Lead. Decide arquitectura (ADRs) y prioridades, aprueba specs, hace el review final y mergea. | No implementa código en el flujo normal. No tiene que elegir el próximo ticket: el orquestador se lo recomienda. |
| **Claude** | Desarrolla las ideas con Diego, escribe specs, ADRs y docs, crea los tickets. **Hace el code review** de cada PR del agente, con veredicto explícito. | No decide entre alternativas de arquitectura viables. No implementa código de `packages/` salvo pedido explícito. No mergea. |
| **Tracker** | Fuente de verdad de qué hay que hacer, en qué estado está y qué lo bloquea. | No es fuente de verdad del código ni de las decisiones: eso vive en `docs/`. |
| **Orquestador** | Project manager. (1) Elige y lanza tickets con reglas determinísticas. (2) Coordina el ciclo PR → code review → correcciones → review de Diego → cierre. (3) Recomienda todos los días el próximo paso y hace el review semanal. | No mergea, no inventa alcance, no promueve tickets a `READY FOR AI`, no toca producción sin aprobación. |
| **Agente de código** | Implementa contra el ticket, abre el PR y corrige lo que pida el code review. | No decide alcance no cubierto por el ticket. |
| **GitHub** | Fuente de verdad del código. Todo cambio pasa por PR. | Nunca se pushea directo a `master`. |

### Implementación actual

Único lugar del documento atado a herramientas concretas. Cambiar de
herramienta = actualizar esta tabla (y, si cambia el contrato, la sección
del rol correspondiente).

| Rol | Herramienta hoy | Desde | Antes |
|---|---|---|---|
| Orquestador | Bot de Grok ("Project Manager"), con rutinas por evento y por horario | 2026-10 | n8n (2026-08-31 → 2026-10), workflow `sF5SIIrRWKyvQ2HI` |
| Agente de código | Cursor Cloud Agent | 2026-08-31 | — |
| Revisor de código | Claude, invocado por el orquestador en Slack `#project-ai` | 2026-10 | Solo Diego |
| Tracker | Linear (equipo FRA) | 2026-08 | — |
| Canal de coordinación | Slack `#project-ai` | 2026-10 | — |

### Contrato del orquestador

Cualquier herramienta que cumpla el rol de orquestador tiene que cumplir
estas invariantes. Son lo que se aprendió con los Gaps 1–3 y el bug de
concurrencia de la sección 6, independientemente de la herramienta. El
*cómo* está en `ORCHESTRATOR_PLAYBOOK.md`.

1. **Instrucciones desde el repo:** leer `ORCHESTRATOR_PLAYBOOK.md` desde
   `master` en cada ejecución. Cambiar de orquestador = apuntar la
   herramienta nueva a ese archivo.
2. **Disparo doble:** reaccionar a eventos *y* barrer periódicamente
   (Gap 1).
3. **Selección determinística:** bloqueos y prioridad, sin LLM en ese paso
   (sección 3).
4. **Concurrencia = 1:** contar *cualquier* ticket en `AI WORKING`,
   `PR READY`, `CHANGES REQUESTED` o `HUMAN REVIEW`, no solo `AI WORKING`
   (sección 6.1).
5. **El PR siempre existe:** lo abre el agente; si no puede, lo abre el
   orquestador (Gap 2).
6. **Code review antes de Diego:** ningún PR llega a `HUMAN REVIEW` sin
   veredicto aprobado de Claude (o sin haber agotado las 3 rondas).
7. **Cierre automático** a `Done` al mergear (Gap 3) y selección inmediata
   del siguiente ticket.
8. **Ningún fallo silencioso** (ver `MEJORAS_FUTURAS.md`).

---

## 3. Selección determinística, planificación con criterio

Se evaluó poner una IA a decidir "qué ticket sigue" en cada evento y se
descartó **para esa capa**. Chequear si un ticket está bloqueado y comparar
prioridades es lógica determinística: comparar campos que el tracker ya
expone (bloqueos, prioridad, estado). Una IA ahí introduce una fuente de
error (alucinación) justo en el paso donde menos se la quiere, y además es
más lenta y más cara sin ninguna ganancia. Esto vale aunque el orquestador
sea un bot construido sobre un modelo de lenguaje: la *selección* entre
tickets `READY FOR AI` sigue siendo una regla.

Donde una IA sí aporta es en la **planificación**: releer `docs/`, el
tracker y los PRs para decidir *qué debería existir como próximo trabajo*.
Desde 2026-10 esto ya no es una idea pendiente. El orquestador lo hace todos
los días (identifica el módulo en curso, verifica su DoD con dogfood real
por CLI y recomienda **un** próximo paso) y una vez por semana (review del
sprint). Recomienda; los tickets nuevos los crea en `Todo`, y pasarlos a
`READY FOR AI` sigue siendo de Claude o de Diego (sección 5).

---

## 4. Estados del tracker y su significado operativo

| Estado | Categoría | Significado |
|---|---|---|
| `Backlog` | backlog | Idea o trabajo todavía no preparado |
| `Todo` | unstarted | Tarea definida pero requiere más análisis/documentación antes de ejecutarse (equivale a "Planned") |
| `READY FOR AI` | unstarted | Suficientemente especificado para que el agente de código lo ejecute sin preguntar |
| `AI WORKING` | started | El orquestador lanzó el agente de código sobre este ticket |
| `PR READY` | started | Hay PR y está esperando el code review de Claude |
| `CHANGES REQUESTED` | started | Claude o Diego pidieron cambios; el agente está corrigiendo |
| `HUMAN REVIEW` | started | Claude aprobó (o se agotaron las 3 rondas): le toca a Diego |
| `Done` | completed | PR mergeado; el orquestador lo mueve solo |

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

> **Registro histórico.** Las secciones 6 a 8 cuentan lo que pasó cuando el
> orquestador estaba implementado en n8n y se conservan tal cual, con los
> nombres de nodos y herramientas de ese momento. Las lecciones que sobreviven
> al cambio de herramienta están condensadas en el "Contrato del
> orquestador" (sección 2).

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

**Decisión (Diego, 2026-09-01): Opción A.** Se fuerza que Cursor use el
`gitBranchName` exacto que Linear genera para el ticket, en vez de dejar
que invente uno propio.

**Implementado:** el nodo `List Ready for AI Candidates` ahora también trae
el campo `branchName` de Linear, y el prompt que arma `Lanzar Cursor Cloud
Agent` incluye una instrucción explícita: "creá tu rama de trabajo con este
nombre EXACTO: `{branchName}`". No se implementó el mecanismo de la Opción B
(no se descarta para el futuro si esto no alcanza) ni se probó la Opción C.

**Sin validar todavía en un ciclo real completo** — depende de que Cursor
efectivamente respete la instrucción del prompt (es una instrucción en
texto, no un parámetro forzado por la API de Cursor, que no expone un
campo de nombre de rama). Se confirma en el próximo ticket que se lance
(FRA-23 o FRA-26, ambos desbloqueados desde que FRA-22 pasó a Done).

Hasta confirmar que esto funciona de punta a punta, **el estado
post-`AI WORKING` puede seguir requiriendo intervención manual**.

### Gap 2 — actualización 2026-09-01: nombre de rama confirmado, creación de PR sigue fallando

Se relanzó FRA-23 para probar la Opción A en un ciclo limpio
([`bc-7b2b806d-d080-48ff-b7c2-4d54094b41fd`](https://cursor.com/agents/bc-7b2b806d-d080-48ff-b7c2-4d54094b41fd)).

**Confirmado: la Opción A funciona.** El agente usó exactamente el nombre
de rama forzado por el prompt (`cursor/protocolo-invocaci-n-adapter-daa0`,
igual al `branchName` que trae Linear). Ya no depende de que Cursor invente
un nombre propio.

**Seguía sin poder crear el PR solo** — el resumen del agente terminó otra
vez con "PR: Crear manualmente en `.../pull/new/<rama>`", igual que en
FRA-22. Se auditaron los dos lugares donde Diego había cargado tokens para
resolver esto, para descartar que sea un problema de configuración:

- **GitHub App "Cursor"** (`github.com/settings/installations/151578181`):
  instalada con `Read and write access` sobre `pull requests` (y sobre
  `code`, `issues`, `actions`, `checks`, etc.), acceso a **All repositories**.
  Es decir: los permisos y el alcance ya son correctos para que el propio
  mecanismo de PR de Cursor funcione.
- **Secrets del Environment de Cursor** (`dmaure/fractal`): hay dos —
  `github` (scope Personal) y `Github` (scope Environment) — ambos
  respaldados por el mismo Personal Access Token clásico
  (`Cursor Cloud Agent - Fractal`, scopes `repo, workflow`). Ambos
  figuran como **"Never used"** en `github.com/settings/tokens`. Esto
  confirma que no son el mecanismo que Cursor usa para crear el PR — son
  simples variables de entorno disponibles para los scripts de
  install/build/start, no algo que el flujo de "abrir PR" consulte.

**Conclusión: no es un gap de configuración de nuestro lado.** Con permisos
completos en la GitHub App y un PAT válido disponible, la creación
automática de PR sigue sin ocurrir. Al momento de esta prueba, Cursor
mostraba un aviso propio de incidente ("Investigating service degradation"
— degradación en Composer 2.5, afectando explícitamente "Cloud Agents"),
que es una explicación plausible pero no confirmada — ya había fallado
también en FRA-22, antes de que ese incidente existiera, así que puede ser
una limitación estructural del feature (requiere click humano en "Create
PR" dentro del propio Cursor) y no solo un problema transitorio.

**Recomendación (pendiente de decisión de Diego):** dejar de depender de
que el agente cree el PR y mover esa responsabilidad a n8n, que ya tiene
todo lo necesario (el PAT, o mejor, una GitHub App propia de la
automatización) para llamar directamente a `POST /repos/{owner}/{repo}/pulls`
una vez que detecta que el agente terminó. Esto además **desacopla el
workflow de Cursor específicamente** — si el día de mañana se cambia de
agente de código, la creación del PR sigue viviendo en n8n y no hay que
volver a resolver este problema por agente.

### Gap 2 — resuelto (2026-09-05): n8n crea el PR, no el agente

Diego aprobó la recomendación anterior. Se implementó en el mismo workflow
de n8n, sin depender de que Cursor (o cualquier agente futuro) sepa abrir
un PR.

**Mecanismo:**

1. **Data Table `cursor_agent_runs`** (nueva, nativa de n8n): cada vez que
   `Lanzar Cursor Cloud Agent` lanza un agente, el nodo `Registrar Agente en
   Data Table` guarda una fila con el ticket de Linear, el `agent_id` de
   Cursor, la rama, el repo y `pr_created: false`.
2. **Nuevo disparador `Chequeo de PRs Pendientes (cada 5 min)`**, corre en
   paralelo al resto del workflow:
   - Lee las filas con `pr_created = false`.
   - Para cada una, consulta `GET /v1/agents/{id}` de Cursor. El campo a
     mirar es `status`: pasa de `"ACTIVE"` a `"IDLE"` cuando el agente
     termina (confirmado contra el agente real de FRA-23). Si no terminó,
     no hace nada — se reintenta en el próximo ciclo de 5 minutos.
   - Si terminó, busca si ya existe un PR para esa rama
     (`GET /search/issues?q=is:pr repo:{owner}/{repo} head:{branch}` — la
     API de búsqueda, no el listado plano de PRs, para evitar la
     ambigüedad de que un array vacío no genera ningún item en n8n).
   - Si ya existe (caso típico hoy: alguien lo creó a mano), lo reusa. Si no
     existe, lo crea (`POST /repos/{owner}/{repo}/pulls`).
   - Actualiza la fila (`pr_created: true`, `pr_url`), mueve el ticket de
     Linear a `PR READY`, y comenta el link del PR.
3. **Credencial:** un Personal Access Token de GitHub (en realidad
   **fine-grained**, no clásico como se pensó en un principio — tiene
   "Repository access" limitado a `dmaure/fractal` y permisos granulares
   por categoría), cargado como credencial Header Auth
   `GitHub API - Fractal Automation` en n8n. Diego la creó a mano (Claude
   no puede tipear tokens en formularios).

**Validado de punta a punta contra datos reales:** se insertó manualmente
la fila de FRA-23 (su agente ya había terminado, `status: "IDLE"`, y ya
tenía el PR #20 abierto a mano) y se corrió el chequeo real. Encontró el
agente terminado, encontró el PR #20 existente (no creó uno duplicado),
actualizó la Data Table, y — con efecto real, no simulado — movió FRA-23 a
`PR READY` en Linear y dejó el comentario
["🔀 Pull Request: .../pull/20"](https://linear.app/fractalapp/issue/FRA-23).

### Gap 2 — validación final (2026-09-05): rama de "crear PR nuevo"

El pipeline levantó FRA-26 solo (sin intervención), el agente terminó, pero
la creación automática del PR quedó **silenciosamente rota durante horas**
— el chequeo de 5 minutos reintentaba y fallaba una y otra vez sin que
nadie lo notara, hasta que Diego preguntó por qué "no pasaba nada". Se
encontraron y corrigieron tres bugs reales, en cadena:

1. **Bug de referencia en n8n:** el nodo `Crear PR en GitHub` leía
   `$json.owner`/`$json.repo`/etc. asumiendo que traían los datos
   combinados de `Combinar Datos` — pero en la rama "no existe todavía"
   del IF, `$json` es la respuesta cruda de `Buscar PR Existente`
   (`{total_count: 0, items: []}`), no los datos de la fila. Resultado:
   URL `.../repos///pulls` (404). Corregido referenciando
   `$('Combinar Datos').item.json` explícitamente.
2. **Header de autenticación incompleto:** el Header Value de la
   credencial no tenía el prefijo `Bearer `. GitHub devolvía
   `401 Requires authentication` — indistinguible de "no hay credencial" a
   simple vista.
3. **Permiso insuficiente en el token:** una vez con el prefijo correcto,
   GitHub devolvía `403 Resource not accessible by personal access token`.
   El PAT (fine-grained) tenía el permiso "Pull requests" en **Read-only**
   — alcanza para buscar PRs existentes pero no para crear uno. Corregido
   cambiándolo a **Read and write**.

**Con los tres bugs corregidos, se confirmó en vivo:** el chequeo creó
[PR #23](https://github.com/dmaure/fractal/pull/23) para FRA-26 sin
intervención humana, actualizó la Data Table, movió el ticket a
`PR READY` y dejó el comentario — cerrando la única rama que faltaba
validar. **Gap 2 queda resuelto y confirmado de punta a punta**, en las
dos variantes (reusar PR existente y crear uno nuevo).

**Lección para el futuro:** un fallo silencioso y recurrente (el mismo
error cada 5 minutos, sin que nadie lo vea) es el peor tipo de bug en un
sistema desatendido — bloqueó el pipeline completo (por el límite de
concurrencia) durante horas sin ninguna señal visible para Diego. Falta
notificación activa de fallos del workflow (ver `MEJORAS_FUTURAS.md`).

**Esto no depende de Cursor.** Si mañana se cambia de agente de código, el
único requisito para que esto siga funcionando es que el nuevo agente deje
un `agent_id` consultable (o, más simple, que el paso de "detectar que
terminó" se adapte a como sea que se consulte el estado de ese agente) — la
lógica de buscar/crear el PR y avisarle a Linear no cambia.

## 6.1 Bug nuevo encontrado (2026-09-05): el límite de concurrencia no contaba `PR READY`

**Síntoma:** [PR #23](https://github.com/dmaure/fractal/pull/23) (FRA-26)
llegó con conflictos reales contra `master` en 5 archivos de
`packages/core`. Diego preguntó si el pipeline crea ramas desde una
referencia desactualizada.

**Diagnóstico:** no es un problema de referencia desactualizada en el
sentido literal (Cursor sí arranca desde el `master` real al momento del
lanzamiento) — es un bug de concurrencia que permite que dos tickets
independientes estén "en vuelo" al mismo tiempo, y cuando eso pasa, el
segundo inevitablemente pierde los cambios del primero si todavía no se
mergeó.

FRA-23 estuvo en estado `PR READY` (no mergeado) durante horas mientras
Diego lo revisaba. En ese lapso, el chequeo periódico lanzó FRA-26 — un
ticket no bloqueado por FRA-23, así que en principio correcto que avance —
pero el gate de concurrencia debería haberlo impedido si ya había *algo*
"en curso". No lo impidió: el nodo `Pick Top Candidate` contaba
`inProgress` filtrando literalmente `state.name === 'AI WORKING'`, sin
contar `PR READY`, `HUMAN REVIEW` ni `CHANGES REQUESTED` — aunque la
query GraphQL que lo alimenta (`Count AI Working`) ya trae **todos** los
issues con `state.type: "started"` (que incluye esos cuatro estados). El
filtro de JS era más angosto que la query que lo alimentaba.

Con el bug activo: FRA-23 en `PR READY` → contado como 0 en curso → FRA-26
lanzado y ramificado desde el `master` de ese momento, que todavía no
tenía el trabajo de FRA-23 (esperando el merge de Diego) → conflicto
inevitable al mergear ambos, en cualquier orden.

**Corregido:** `Pick Top Candidate` ahora usa
`$json.data.issues.nodes.length` directamente — como la query ya filtra
por `type: "started"`, cualquier issue que devuelva cuenta como "en
curso", sin importar en cuál de los cuatro estados intermedios esté.

**Efecto práctico de la corrección:** con `concurrencyLimit: 1`, ahora no
se lanza ningún ticket nuevo mientras haya **cualquier otro** en un estado
`started` (`AI WORKING`, `PR READY`, `HUMAN REVIEW` o
`CHANGES REQUESTED`) — no solo mientras un agente esté activamente
trabajando. Esto ralentiza el pipeline (un PR esperando review bloquea
todo lo demás), pero es la única forma de evitar este tipo de conflicto
mientras el mecanismo siga siendo "ramificar desde `master` al lanzar,
mergear después". Si el ritmo de revisión de Diego se vuelve el cuello de
botella, subir `concurrencyLimit` es una opción — pero solo junto con
alguna estrategia de rebase/actualización de rama antes de mergear, no
solo.

**Daño colateral del mismo bug, encontrado después:** mientras el bug
estaba activo, el chequeo periódico también lanzó FRA-24 (18:15) y FRA-25
(18:30) — cada uno mientras el anterior ya estaba en `PR READY` (no
literalmente `AI WORKING`), así que el filtro roto los dejó pasar a los
tres. Los tres PRs (#23, #25, #26) terminaron con conflictos reales entre
sí en los mismos archivos compartidos de `packages/core`
(`package.json`, `README.md`, `src/index.ts`, `tsconfig.json`,
`vitest.config.ts`). Se resolvieron con rebase (ver `PROCESO.md`, sección
"Resolución de conflictos"): #23 y #25 ya están limpios y confirmados
(`MERGEABLE`, tests/build/lint verificados); #26 queda pendiente de
rehacerse después de que #23 y/o #25 se mergeen, para no repetir el
trabajo dos veces.

**Segunda causa posible, sin confirmar:** FRA-24 y FRA-25 se lanzaron a
las 18:15 y 18:30 respectivamente, pero sus ramas parten de un commit de
`master` anterior al merge de FRA-23 (15:26) — más de 3 horas de
diferencia. Esto no se explica solo por el bug de concurrencia (que
explica *que* se lanzaran, no *desde qué punto* ramificaron). El ambiente
de Cursor tiene un "Staleness Threshold" configurado en 24 horas
(`Update Stale Builds`, en la configuración del Environment) — la
hipótesis, no confirmada, es que el agente reusó una imagen/build cacheada
de más de 3 horas de antigüedad en vez de partir del `master` real del
momento. **Recomendación pendiente de que Diego la aplique:** bajar el
Staleness Threshold a 0 en la configuración del Environment de Cursor, para
que cada lanzamiento parta siempre del código fresco. Sin esto, incluso con
el bug de concurrencia corregido, una rama podría seguir ramificando desde
un punto viejo si el caché de build no se invalida a tiempo.

**Confirmado en la práctica (2026-09-05/06):** FRA-27 (dependiente de
FRA-26) ramificó desde el commit original de FRA-26 *antes* de su rebase —
un ancestro que dejó de existir en `master` una vez reescrito el historial.
Se resolvió con `git rebase --onto origin/master <ancestro-viejo>` (en vez
de un rebase simple), que descarta el commit ya incluido y solo reaplica el
trabajo propio del ticket. Mismo mecanismo que la sección anterior, un caso
más de la misma familia de problema.

## 6.2 Gap 3 — resuelto (2026-09-06): `Done` se mueve solo tras el merge

Después de resolver Gap 2, cada PR que se mergeaba dejaba el ticket
encallado en `PR READY` — nada lo movía a `Done`. Como el fix de
concurrencia (sección 6.1) cuenta *cualquier* estado `started` como "en
curso", un ticket encallado en `PR READY` bloqueaba el lanzamiento de todo
lo demás indefinidamente hasta que alguien lo moviera a mano. Esto se
descubrió en vivo: el pipeline había levantado FRA-27 solo, generado su PR
solo, pero después de mergearlo no pasó nada durante horas — hasta que se
marcaron a mano los tickets anteriores como `Done`.

**Mecanismo implementado:** nuevo disparador `Chequeo de PRs Mergeados
(cada 10 min)`, en el mismo workflow de n8n:

- Lee de la Data Table `cursor_agent_runs` las filas con `pr_created: true`
  y `closed` distinto de `true` (condición `neq`, no `isFalse` — esta
  última no matchea valores `null`, que es el estado inicial de una
  columna booleana recién creada en filas ya existentes).
- Para cada una, consulta `GET /repos/{owner}/{repo}/pulls/{number}` de
  GitHub (número de PR extraído de `pr_url`) y mira el campo `merged`.
- Si `merged: true`: mueve el ticket de Linear a `Done`, comenta
  confirmando el cierre, y marca `closed: true` en la fila — para no
  volver a consultarla en el próximo ciclo.
- Si todavía no se mergeó: no hace nada, se reintenta en el próximo ciclo.

**Validado contra datos reales:** al correrlo por primera vez, encontró las
5 filas existentes (FRA-23, 24, 25, 26, 27 — todas con PR ya mergeado en
GitHub) y cerró las 5 de una — movió cada ticket a `Done`, dejó el
comentario de cierre, y marcó `closed: true` en la Data Table. Confirmado
con una lectura posterior de la tabla: las 5 filas quedaron en
`closed: true`.

**Con Gap 2 y Gap 3 resueltos, el ciclo completo queda cerrado de punta a
punta sin intervención manual:** Linear (Ready for AI) → n8n elige →
Cursor implementa → n8n crea el PR → Diego revisa y mergea → n8n cierra el
ticket → el pipeline queda libre para el siguiente. La única intervención
humana que sigue siendo necesaria es la revisión y el merge del PR — que es
exactamente el punto de control que se quiere mantener.

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

## 8. Extracción a `fractal-workflow` (2026-09-06): el pipeline ya no depende de Cursor por diseño

Con los tres gaps resueltos (creación de PR, cierre automático, bug de
concurrencia) y el ciclo completo corriendo sin intervención manual, se
extrajo el patrón a un proyecto separado y agnóstico de agente:
[`dmaure/fractal-workflow`](https://github.com/dmaure/fractal-workflow)
(repo privado). La motivación: todo lo que se construyó acá —selección
determinística de tickets, creación de PR, cierre automático— no tiene
nada de específico de Fractal ni de Cursor, y vale la pena poder
reusarlo en proyectos futuros sin volver a pelear los mismos bugs.

**El workflow de n8n de este repo se refactorizó en el proceso** (sigue
siendo el mismo workflow en producción, `sF5SIIrRWKyvQ2HI` — no se creó uno
nuevo) para que las dos operaciones específicas de agente (lanzar, y
consultar si terminó) sean configuración en el nodo `Config`
(`agentAdapter*`) en vez de estar hardcodeadas contra la API de Cursor.
El resto del pipeline (selección de tickets, creación de PR, cierre) ya
era agnóstico y no cambió.

**Bug real encontrado al implementar esto:** un placeholder tipo
`{{RUN_ID}}` dentro de una URL resuelta con una expresión nativa de n8n
(`={{ ... .replace('{{RUN_ID}}', ...) }}`) rompe el parseo — n8n interpreta
cualquier `{{ }}` que aparece *dentro* de la expresión como una expresión
anidada, incluido el placeholder mismo. Se resolvió moviendo ese reemplazo
a un nodo Code (`Render Poll URL`), donde el placeholder es solo un string
literal en JS puro, no algo que n8n intente parsear.

**Otra decisión de diseño, no obvia:** la rama de polling de PRs pendientes
necesita los mismos valores de `agentAdapter` que la rama de lanzamiento
(URL de polling, mapeo de estados) — pero **no puede simplemente
conectarse al mismo nodo `Config`**. Si dos triggers de propósito distinto
comparten un nodo, disparar cualquiera de los dos ejecuta *todas* las
ramas conectadas a ese nodo, no solo la del trigger que disparó. Se
resolvió con un segundo nodo, `Adapter Config (poll)`, con los mismos
valores duplicados — una violación menor de DRY a cambio de no cruzar
lógica entre triggers que no deberían tocarse.

**Validado sin gastar en un lanzamiento real:** la rama de polling se
probó con una fila real apuntando a un agente ya terminado y una rama de
GitHub inexistente a propósito — confirmó el camino completo hasta fallar
de forma segura (branch inválida) sin tocar Linear. La rama de lanzamiento
(el render del body con placeholders) se validó por separado, fuera de
n8n, con casos límite de escape (comillas, backslashes, saltos de línea).

**Sin validar todavía:** el contrato de adapter en sí — solo existe un
adapter real (Cursor). La primera prioridad de `fractal-workflow` es
validarlo contra un segundo agente cuando exista la oportunidad.

---

## 9. Referencias

- [`docs/ORCHESTRATOR_PLAYBOOK.md`](ORCHESTRATOR_PLAYBOOK.md) — manual operativo del orquestador y fuente de sus instrucciones
- [`docs/AGENT_PLAYBOOK.md`](AGENT_PLAYBOOK.md) — reglas para quien implementa y para quien hace code review, schema de ticket
- [`.cursor/rules/fractal.mdc`](../.cursor/rules/fractal.mdc) — versión resumida cargada automáticamente en Cursor
- [`docs/PROCESO.md`](PROCESO.md) — ciclo de trabajo, numeración, branches, commits
- Detalle técnico del orquestador: vive en la herramienta que cumpla ese rol (ver "Implementación actual", sección 2), con su propio historial — no se duplica acá. Histórico: workflow de n8n [`sF5SIIrRWKyvQ2HI`](https://n8n.universofractal.dev/workflow/sF5SIIrRWKyvQ2HI), retirado.
- [`dmaure/fractal-workflow`](https://github.com/dmaure/fractal-workflow) — el patrón extraído, agnóstico de proyecto y de agente de código
