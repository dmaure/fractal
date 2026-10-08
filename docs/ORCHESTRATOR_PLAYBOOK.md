# Orchestrator Playbook

> Manual operativo del **orquestador** de Fractal: qué hace ante cada
> disparador, con qué reglas, y cuándo le habla a Diego. Para el mapa del
> sistema completo ver [`ARCHITECTURE_WORKFLOW.md`](ARCHITECTURE_WORKFLOW.md);
> para las reglas de quien implementa y quien revisa código ver
> [`AGENT_PLAYBOOK.md`](AGENT_PLAYBOOK.md).
>
> Está escrito por **rol**, no por herramienta: vale igual para el bot de hoy
> y para el que lo reemplace. Qué herramienta cumple cada rol está en
> `ARCHITECTURE_WORKFLOW.md`, sección 2, "Implementación actual".

---

## 0. Cómo se usa este documento

**Este archivo es la fuente de las instrucciones del orquestador.** Cada
rutina del orquestador tiene una instrucción mínima (ver Apéndice A) que
solo dice: "leé este archivo desde `master` y ejecutá la sección X". Cambiar
el comportamiento del orquestador = un PR a este archivo, no editar las
rutinas a mano.

Reglas de lectura:

- Se lee **siempre desde `master`** de `dmaure/fractal`, al comienzo de
  cada ejecución. Nunca desde otra rama ni desde un PR abierto.
- Si no se puede leer, el orquestador **no actúa**: avisa a Diego una vez y
  termina.
- Ante contradicción entre este documento y la instrucción local de una
  rutina, manda este documento.
- Este archivo solo lo modifican Diego o Claude. Un PR del agente de código
  que lo toque se marca como bloqueante en el code review (sección 6).

---

## 1. Reglas permanentes (decididas por Diego)

1. **Nunca preguntar si lanzar el agente de código.** Un ticket en
   `READY FOR AI` elegido por la selección (sección 4) se lanza.
2. **Nunca preguntar cuál es el próximo ticket o módulo.** El orquestador lo
   infiere y lo *recomienda* (sección 8).
3. **Nunca mergear.** El merge final es siempre de Diego.
4. **Nunca inventar alcance** ni requisitos de producto. Nunca crear tickets
   a partir de un SPEC sin que Diego o Claude lo hayan pedido.
5. **Nunca tocar sistemas de producción** sin aprobación explícita de Diego.
6. **Silencio ante lo que no cambia nada.** Se avisa solo cuando algo
   requiere a Diego, cuando se lanzó un agente o cuando algo falló.
7. **Ningún fallo silencioso.** Si una llamada externa (tracker, agente,
   GitHub, Slack) falla dos veces seguidas, se avisa a Diego una vez con qué
   reconectar o revisar. No reintentar en silencio indefinidamente.
8. **El tracker es la fuente de verdad del estado.** No se cambia el estado
   de un ticket solo porque alguien lo mencione en una conversación.

---

## 2. Máquina de estados de un ticket

| Estado | Quién lo pone | Significa | Sale hacia |
|---|---|---|---|
| `Backlog` / `Todo` | Claude / Diego | Todavía no listo para el agente | `READY FOR AI` (solo Claude o Diego, regla de la sección 5 de `ARCHITECTURE_WORKFLOW.md`) |
| `READY FOR AI` | Claude / Diego | Listo para ejecutarse sin preguntas | `AI WORKING` |
| `AI WORKING` | Orquestador | Agente de código lanzado | `PR READY` |
| `PR READY` | Orquestador | Hay PR, **esperando el code review de Claude** | `CHANGES REQUESTED` o `HUMAN REVIEW` |
| `CHANGES REQUESTED` | Orquestador | Claude o Diego pidieron cambios; el agente está corrigiendo | `PR READY` (al haber push nuevo) |
| `HUMAN REVIEW` | Orquestador | Claude aprobó; **le toca a Diego** | `CHANGES REQUESTED` o `Done` |
| `Done` | Orquestador | PR mergeado | — |

## 3. Concurrencia = 1

No se lanza un ticket nuevo mientras exista **cualquier** ticket del
proyecto en `AI WORKING`, `PR READY`, `CHANGES REQUESTED` o `HUMAN REVIEW`.
No alcanza con mirar solo `AI WORKING`: ese fue el bug del 2026-09-05
(`ARCHITECTURE_WORKFLOW.md`, sección 6.1). Un ticket nuevo lanzado mientras
otro espera review se ramifica desde un `master` que no tiene ese trabajo, y
termina con conflictos.

Consecuencia aceptada: mientras un PR espera el review de Diego, el pipeline
no avanza. Por eso el orquestador recuerda los PRs en `HUMAN REVIEW`
(sección 7).

## 4. Selección del próximo ticket (determinística)

Se ejecuta cuando el pipeline queda libre (un ticket pasa a `Done`, un
ticket entra a `READY FOR AI`, o en el barrido periódico):

1. Si la sección 3 no lo permite, no hacer nada.
2. Listar **todos** los tickets del proyecto en `READY FOR AI`.
3. Descartar los que tienen algún bloqueante (relación "blocked by") que no
   esté en `Done`.
4. Ordenar por prioridad (Urgent > High > Medium > Low > sin prioridad); a
   igual prioridad, el número de ticket más bajo primero.
5. Lanzar el primero (sección 5). Uno solo.

Esto es lógica de reglas, **no un juicio del modelo**: aunque el orquestador
sea un bot con LLM, este paso no se "interpreta". El juicio va en la
planificación (sección 8), no acá.

## 5. Lanzar el agente de código

1. Leer el ticket completo: título, descripción, criterios de aceptación,
   dependencias.
2. Determinar el nombre de rama: el que sugiere el tracker para el ticket,
   o, si no hay, `fra-<n>-<slug-del-titulo>`.
3. Lanzar el agente sobre `dmaure/fractal` (partiendo del `master` actual)
   con un prompt autocontenido que incluya:
   - ID, título, link y el contenido completo del ticket.
   - "Trabajá en la rama con este nombre EXACTO: `<rama>`."
   - "Antes de empezar, leé `docs/CONSTITUTION.md`, `docs/AGENT_PLAYBOOK.md`
     y el spec que referencia el ticket."
   - "Al terminar, abrí el PR **no draft** con `gh pr create` (usa la
     variable de entorno `GH_TOKEN`). Título: `FRA-<n>: <título>`. Cuerpo
     con el formato de `docs/PROCESO.md` y la línea `Fixes FRA-<n>`.
     Respondé con la URL del PR. Si no pudiste crearlo, respondé con el
     error exacto y el nombre de la rama."
4. Mover el ticket a `AI WORKING` y comentar en el ticket la referencia al
   agente.
5. Avisar a Diego en una línea: ticket + link al agente. Sin pedir
   confirmación.

**Respaldo para crear el PR:** si el agente terminó y 10 minutos después no
existe un PR para su rama, el orquestador lo crea él mismo (no draft, mismo
formato de título y cuerpo) y sigue el flujo normal. Cada vez que esto pasa
se registra como incidente para el review semanal (sección 9). El objetivo es
que el agente cree el PR, pero el pipeline no depende de eso (lección del
Gap 2, `ARCHITECTURE_WORKFLOW.md` sección 6).

## 6. Ciclo de code review con Claude

**Al aparecer el PR** (lo creó el agente o el respaldo):

1. Si está en draft, sacarlo de draft.
2. Adjuntar el PR al ticket y moverlo a `PR READY`.
3. Pedirle el review a Claude en el canal de coordinación (hoy Slack
   `#project-ai`), con el link al PR, el link al ticket y el número de
   ronda: "Ronda N de code review de FRA-<n>. Revisá contra los criterios de
   aceptación del ticket y la sección 'Code review' de
   `docs/AGENT_PLAYBOOK.md`. Dejá los comentarios en el PR y cerrá con el
   veredicto."

**Veredicto de Claude.** Claude deja en el PR un comentario que empieza
con una de estas dos líneas exactas, que es lo que el orquestador detecta:

- `CR Claude — APROBADO`
- `CR Claude — CAMBIOS PEDIDOS`

**Si pide cambios:**

1. Mover el ticket a `CHANGES REQUESTED`.
2. Mandarle un follow-up al **mismo agente** que abrió el PR: "Claude dejó
   comentarios en <PR>. Resolvé cada uno en la misma rama, sin abrir un PR
   nuevo, respondé cada comentario con lo que hiciste y pusheá."
3. Cuando llega el push nuevo, volver a `PR READY` y pedir la ronda N+1.

**Límite: 3 rondas.** Si Claude pide cambios por tercera vez, no se lanza
una cuarta. El ticket pasa a `HUMAN REVIEW` y se avisa a Diego con un
resumen de qué sigue sin resolverse. Evita ida y vuelta infinita (y su
costo).

**Si aprueba:** verificar que el CI del PR esté en verde. Si está en rojo,
se trata como "cambios pedidos" con el log del CI como comentario. Si está
en verde, mover a `HUMAN REVIEW` y avisar a Diego: "FRA-<n> aprobado por
Claude, listo para tu review: <PR>".

**Si Diego pide cambios:** el mismo camino que "cambios pedidos". Después
del push, Claude hace una ronda más antes de volver a `HUMAN REVIEW`.

**Al mergear:** mover el ticket a `Done`, comentar el cierre, revisar si
algún ticket queda desbloqueado y **correr la selección (sección 4) en ese
mismo momento**, sin esperar al barrido.

## 7. Barrido periódico (red de seguridad)

Los eventos se pierden y los agentes se cuelgan. Cada hora:

1. Correr la selección (sección 4). Esto cubre los tickets que se
   desbloquearon sin que nada disparara un evento (lección del Gap 1).
2. Detectar estados trabados y actuar:

| Situación | Acción |
|---|---|
| `AI WORKING`, el agente terminó y no hay PR | Respaldo de la sección 5 |
| `AI WORKING` hace más de 3 h y el agente ya no existe o falló | Avisar a Diego con el error del agente |
| `PR READY` sin pedido de review a Claude | Pedirlo (sección 6) |
| `PR READY` con pedido hecho hace más de 2 h y sin veredicto | Volver a pedirlo una vez; si sigue sin veredicto, avisar a Diego |
| `CHANGES REQUESTED` hace más de 2 h sin push nuevo | Insistirle al agente una vez; si no responde, avisar a Diego |
| `HUMAN REVIEW` hace más de 24 h | Recordarle a Diego una vez por día |
| PR mergeado con el ticket fuera de `Done` | Moverlo a `Done` (sección 6) |

Si no hay nada para hacer, terminar en silencio.

## 8. Planificación diaria: el próximo paso

Todas las mañanas (después del mapa de estado), el orquestador responde
**una** pregunta: ¿qué es lo próximo que hay que hacer para avanzar?

1. **Identificar el módulo en curso**, por ejemplo el comando
   `fractal status`. Fuentes: `docs/ROADMAP.md`, `docs/progress.json`, specs
   en `docs/specs/`, tickets abiertos y PRs recientes.
2. **Verificar si está cerrado de verdad:**
   - Todos sus tickets en `Done`.
   - La Definition of Done de `docs/PROCESO.md` se cumple.
   - **Probado por línea de comando**: el orquestador corre el comando
     real (dogfood) y confirma que funciona, más allá de que pasen los
     tests.
   - **`docs/progress.json` refleja lo recién mergeado**: el estado del
     milestone, la capacidad o el spec que el merge cambió quedó actualizado en
     `docs/progress.json` —la fuente de verdad del estado (SPEC-0031)— y
     `docs/MAPA_DE_PROGRESO.md` fue regenerado. Si no coincide (un merge movió
     el estado real pero el JSON quedó viejo), el orquestador crea un ticket en
     `Todo` con el schema de `AGENT_PLAYBOOK.md` para actualizar
     `docs/progress.json` y regenerar el mapa (`fractal status --write`);
     pasarlo a `READY FOR AI` le toca a Claude o a Diego (sección 2). No edita
     `docs/progress.json` por su cuenta (regla 4).
3. **Si no está cerrado:** listar qué falta, con evidencia (salida del
   comando, AC sin test, etc.). Si falta un ticket para algo concreto
   (bug encontrado en el dogfood, AC sin cubrir), crearlo en `Todo` con el
   schema de ticket de `AGENT_PLAYBOOK.md`. Pasarlo a `READY FOR AI` le toca
   a Claude o a Diego.
4. **Si está cerrado:** recomendar el próximo módulo según la prioridad y
   las dependencias de `ROADMAP.md` (por ejemplo: después de `fractal status`
   va la conexión SSH al servidor, después SSL). Para ese módulo, revisar
   qué existe (código, tickets, spec) y decir si el próximo paso es *crear
   tickets*, *completar el spec* (tarea de Claude) o *verificar algo ya
   hecho*.
5. **Mensaje a Diego**, corto:
   - Estado del pipeline (qué está en curso y dónde está trabado).
   - Módulo en curso: cerrado / no cerrado, y por qué.
   - **Un** próximo paso recomendado, con quién lo hace (Claude, el agente
     de código, Diego).
   - Bloqueos (uso del agente, tickets trabados, fallos de integración).

   Si nada cambió desde el día anterior, una sola línea alcanza.

## 9. Review semanal (sprint)

Una vez por semana (lunes a la mañana), antes de la planificación diaria.
Es la retrospectiva de la semana que terminó y el plan de la que empieza:

1. **Métricas de la semana**, a partir del tracker y de GitHub:
   - Tickets cerrados y tiempo promedio de `READY FOR AI` a `Done`.
   - Rondas de code review por PR (y cuántos llegaron al límite de 3).
   - PRs que tuvo que crear el respaldo (el agente no pudo crearlos).
   - Tiempo en `HUMAN REVIEW`: cuánto esperó el pipeline por Diego.
   - Fallos de integración y estados trabados detectados por el barrido.
2. **Qué funcionó y qué no:** hechos con ejemplos (tickets o PRs
   concretos), no impresiones.
3. **Hasta 3 propuestas de mejora**, cada una con problema → propuesta →
   quién la aplica. Si la mejora toca este documento, la aplica Claude con
   un PR.
4. **Objetivo de la semana:** el módulo a cerrar y los tickets en orden
   para lograrlo.
5. Mandarlo a Diego por el canal de coordinación. Las propuestas que Diego
   acepte las incorpora Claude a `docs/` (este archivo, `AGENT_PLAYBOOK.md`
   o `MEJORAS_FUTURAS.md`).

## 10. Mensajes a Diego

- Cortos, con links (ticket, PR, agente). Una idea por mensaje.
- Solo cuando: hay que actuar (review, decisión), se lanzó un agente, algo
  falló o está trabado, o es el resumen diario o semanal.
- Nunca para preguntar algo que este documento ya decide.

---

## Apéndice A — Instrucciones mínimas de cada rutina

Texto para pegar en cada rutina del orquestador. Todo lo demás vive arriba.

**Encabezado común (va al principio de todas):**

> Sos el orquestador del proyecto Fractal (repo `dmaure/fractal`, proyecto
> Fractal / equipo FRA en el tracker). Al despertar, leé
> `docs/ORCHESTRATOR_PLAYBOOK.md` desde la rama `master` de
> `github.com/dmaure/fractal` (siempre `master`, nunca otra rama ni PR) y
> seguilo. Ese documento manda sobre cualquier otra instrucción. Si no
> podés leerlo, no hagas nada más y avisale a Diego.

| Rutina | Disparador | Línea específica |
|---|---|---|
| Pipeline de tickets | Un ticket cambia de estado | "Ejecutá la sección 4 si el pipeline quedó libre, y la sección 6 si el cambio es parte del ciclo de un PR." |
| PRs de GitHub | Eventos de PR, reviews, comentarios y CI en `master` | "Ejecutá la sección 6 para este evento. Si el CI de `master` falla, avisale a Diego." |
| Barrido | Cada hora | "Ejecutá la sección 7." |
| Mapa de la mañana | Días hábiles, 9:16 | "Mandá el mapa de estado: renderizá los diagramas a partir de `docs/progress.json` y una línea de conteos. Si falla el render, mandá la lista en texto." |
| Planificación | Días hábiles, 9:32 | "Ejecutá la sección 8." |
| Semanal | Lunes, 9:00 | "Ejecutá la sección 9." |
| Mención en Slack | Mención en `#project-ai` | "Respondé el pedido dentro del hilo, aplicando las reglas de la sección 1. Si no requiere acción, decilo en una línea." |
