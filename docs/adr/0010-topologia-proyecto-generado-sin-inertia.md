# ADR-0010: Topología del proyecto generado — sin Inertia (reemplaza a ADR-0009)

**Estado:** Aceptado
**Fecha:** 2026-08-16
**Decisores:** Diego
**Reemplaza a:** ADR-0009

---

## Contexto

ADR-0009 (Aceptado, 2026-08-10) decidió tres topologías para el proyecto
generado — monolito, monorepo desacoplado, multirepo — definiendo el
monolito específicamente como "Laravel + Inertia" y las otras dos como API
REST/GraphQL consumida por un SPA independiente. Esa decisión acoplaba dos
ejes distintos: organización de repos y arquitectura de frontend.

ADR-0005 elimina Inertia por completo. Las tres topologías pasan a compartir
la misma arquitectura de frontend: API REST + SPA en React compilado con
Vite, autenticado con Sanctum en modo Bearer. El eje "arquitectura de
frontend" deja de variar por topología — solo queda el eje "organización de
repos", que es lo que este ADR redefine.

Por la regla del propio proceso ("un ADR no se edita después de ser
aceptado"), esto no se corrige dentro de ADR-0009: se escribe este ADR
nuevo y se actualiza el campo Estado de ADR-0009 a "Reemplazado por
ADR-0010".

---

## Opciones consideradas

### Opción A: Solo monolito (un repo, API + SPA integrados)
- **A favor:** menor superficie, un solo camino que mantener y testear en
  M1/M2.
- **En contra:** no sirve al usuario que necesita separar deploys de API y
  frontend desde el día uno — el motivo original que justificó ADR-0009.

### Opción B (elegida): Mantener las tres topologías, ahora con arquitectura de frontend idéntica
- **A favor:** sigue cubriendo los tres perfiles que motivaron ADR-0009; al
  unificar la arquitectura de frontend en ADR-0005, ya no hace falta generar
  ni testear dos stacks distintos — el trabajo adicional de M1/M2 se reduce
  a la organización de repos, no a lógica de negocio ni a frontend.
- **En contra:** siguen siendo tres formas de organizar el mismo código;
  multirepo sigue requiriendo coordinar dos pipelines CI/CD que SPEC-0003 no
  cubre.

### Opción C: Colapsar a dos topologías (mismo repo vs. repos separados)
- **A favor:** menos casos; sin Inertia, "monolito" y "monorepo desacoplado"
  ya no son arquitectónicamente distintos — ambos son un repo con API+SPA,
  la única diferencia real es si el SPA vive en su propio package.
- **En contra:** elimina la opción de un solo repo sin la configuración de
  Turborepo, penalizando al usuario que quiere el camino más simple posible
  dentro de un único repositorio.

---

## Decisión

Elegimos la **Opción B**: se mantienen las tres topologías de ADR-0009, ahora
con la misma arquitectura de frontend en las tres — React + Vite + API REST,
auth Sanctum Bearer (ADR-0005). La diferencia entre topologías pasa a ser
exclusivamente de organización de repos:

- **Monolito** (default): un repo, sin packages separados — API y SPA
  conviven en la misma estructura Laravel.
- **Monorepo desacoplado**: un repo, dos packages (`api/`, `web/`)
  orquestados con Turborepo.
- **Multirepo**: dos repos git, cada uno con su propio pipeline CI/CD.

El monolito sigue siendo el default — Artículo IV intacto.

---

## Consecuencias

### Positivas
- Baja el trabajo de M1/M2 frente a lo que anticipaba ADR-0009: una sola
  arquitectura de frontend que generar y testear, organizada de tres formas,
  en vez de dos arquitecturas distintas.
- La autenticación (Sanctum Bearer) es idéntica en las tres topologías — sin
  lógica condicional de auth según la elegida.
- Mantiene la flexibilidad frente a JHipster que buscaba ADR-0009, sin la
  complejidad de sostener Inertia como camino adicional.

### Negativas
- El monolito pierde el argumento de "sin API interna" que tenía con
  Inertia — las tres topologías, incluida la de menor fricción, generan y
  despliegan una API. Mismo riesgo de TTP ya anotado como "a monitorear" en
  ADR-0005.
- SPEC-0003 (deploy) sigue sin cubrir multirepo — heredado de ADR-0009, no
  resuelto por este ADR.
- SPEC-0001, ya Aprobado, sigue necesitando volver a Draft para incorporar
  el paso de selección de topología — heredado de ADR-0009, no resuelto acá.

### Neutras / a monitorear
- VISION.md sección 6 necesita actualizarse para declarar las tres
  topologías en el alcance v1 (pendiente desde ADR-0009).
- VISION.md sección 7 necesita actualizarse: reemplazar "Frontend Laravel:
  React + Inertia — ADR-0005" por "Frontend Laravel: React + Vite + API
  (Sanctum Bearer) — ADR-0005".
- Si en la práctica casi nadie elige multirepo o monorepo desacoplado,
  revisar si vale sostener las tres rutas o volver a la Opción A (heredado
  de ADR-0009, sigue vigente).
- Si el TTP del monolito con API+SPA resulta muy superior al objetivo de 30
  minutos, evaluar una cuarta ruta "Blade-only" sin SPA (anotado en
  ADR-0005).

---

## Notas

Un ADR no se edita después de ser aceptado. Si la decisión cambia, se crea un
ADR nuevo que lo reemplaza y se actualiza el campo Estado de este.
