# ADR-0009: Arquitectura del proyecto generado — topología de repos

**Estado:** Reemplazado por ADR-0010
**Fecha:** 2026-08-10
**Decisores:** Diego

---

## Contexto

Distinto de ADR-0008 (herramienta de monorepo para el propio código de
Fractal): este ADR decide la topología del **proyecto que Fractal genera**
para el usuario final.

VISION.md (sección 7) anota "Frontend Laravel: React + Inertia" como
decisión ya tomada (ADR-0005, todavía sin escribir). Inertia asume
implícitamente un monolito: el frontend se sirve desde el mismo Laravel,
sin una API separada consumida por un SPA independiente. Hasta ahora, esa
era la única topología contemplada, sin que existiera una decisión
explícita al respecto.

Esta decisión introduce una capability nueva, no contemplada originalmente
en el alcance v1 de VISION.md: que el usuario elija, al correr
`fractal new`, entre distintas topologías de repositorio para su proyecto —
similar a lo que ofrece JHipster.

Relaciones y restricciones:

- Amplía el alcance v1 declarado en VISION.md sección 6, que no menciona
  esto — el documento necesita actualizarse.
- Reabre el alcance de ADR-0005 (aún sin escribir): ya no alcanza con
  "elegir un frontend", ahora depende de la topología elegida.
- **SPEC-0001** (`fractal new`), ya **Aprobado**, no contempla ningún paso
  de selección de topología — necesita revisión.
- **SPEC-0003** (deploy) asume un solo repositorio Git (AC-1) — la
  topología multirepo implica coordinar el deploy de dos repos, algo que el
  spec actual no cubre.
- **Artículo IV (Simplicidad por defecto)**: agregar una pregunta más al
  flujo de `fractal new` tiene que seguir teniendo un default sensato para
  no romper "responder Enter a todo produce un proyecto funcional."

---

## Opciones consideradas

### Opción A: Topología fija — solo monolito (status quo implícito)
- **A favor:** menor superficie, un solo camino que mantener y testear en
  M1/M2; consistente con lo que ya asumían SPEC-0001 y SPEC-0003 sin
  cambios.
- **En contra:** no sirve al usuario que necesita separar API y frontend
  desde el día uno (equipos con frontend y backend en paralelo, ritmos de
  release distintos); no iguala la flexibilidad que ofrece JHipster en este
  aspecto, un diferenciador que VISION.md sí reclama en otros puntos.

### Opción B: Dos topologías — desacoplado vs. monolito, sin distinguir monorepo/multirepo
- **A favor:** menos casos que mantener que la Opción C.
- **En contra:** mezcla dos decisiones independientes (¿está desacoplado?
  ¿en cuántos repos git vive?) en una sola opción, perdiendo expresividad
  justo donde JHipster diferencia con claridad.

### Opción C (elegida): Tres topologías — monolito, monorepo desacoplado, multirepo
- **Monolito clásico:** Laravel + Inertia, un repo, sin split — el default,
  el camino de menor fricción.
- **Monorepo desacoplado:** API Laravel (REST/GraphQL) + frontend SPA como
  paquetes separados en el mismo repo git, orquestados con Turborepo.
- **Multirepo:** API y frontend en dos repos git distintos, estilo
  JHipster.
- **A favor:** cubre al usuario que quiere velocidad máxima (monolito), al
  que necesita separar equipos o ritmos de release sin llegar a multirepo,
  y al que sí necesita repos completamente independientes; el monolito
  sigue siendo el default, no penaliza el camino feliz (Artículo IV).
- **En contra:** multiplica por tres lo que hay que generar, testear y
  mantener en M1/M2 (stubs, snapshots, tests e2e); dos de las tres
  topologías ya no usan Inertia, así que introduce una segunda decisión de
  stack de frontend (SPA) todavía sin resolver.

---

## Decisión

Elegimos la **Opción C**. El usuario elige la topología al correr
`fractal new`, con el **monolito Laravel + Inertia como default**. Para las
topologías desacopladas (monorepo y multirepo), el frontend deja de usar
Inertia y pasa a ser un SPA independiente que consume una API REST/GraphQL,
con autenticación por token (mecanismo exacto — Sanctum u otro — a definir
como parte del alcance ampliado de ADR-0005). El monorepo desacoplado se
organiza con **Turborepo**.

---

## Consecuencias

### Positivas
- Cubre tres perfiles de usuario reales sin forzar a nadie a un único
  modelo.
- El default (monolito) preserva el camino feliz de menor fricción —
  Artículo IV intacto.
- Acerca a Fractal a la flexibilidad que ofrece JHipster, un diferenciador
  que VISION.md ya reclama frente a esa referencia.

### Negativas
- Multiplica el trabajo de M1/M2: cada capability de generación (entidades,
  CRUD, auth) necesita, en el peor caso, tres implementaciones distintas o
  una capa de abstracción adicional dentro de `adapter-laravel` para las
  variantes de topología.
- Introduce una decisión de stack de frontend SPA (React, Vue, u otro) que
  hoy no existe — el alcance de ADR-0005 crece en consecuencia.
- El deploy (SPEC-0003) no contempla multirepo — dos repos implican, como
  mínimo, dos pipelines de CI/CD coordinados entre sí.

### Neutras / a monitorear — seguimiento necesario
- **VISION.md sección 6** necesita actualizarse para declarar esto
  explícitamente dentro del alcance v1.
- **SPEC-0001**, ya Aprobado, necesita volver a Draft para incorporar el
  paso de selección de topología, y volver a aprobarse.
- **SPEC-0003** necesita, como mínimo, una pregunta abierta sobre deploy
  multirepo antes de pasar a Aprobado.
- **ADR-0005** (Frontend Laravel), aún sin escribir, debe ampliar su
  alcance para cubrir tanto Inertia (monolito) como el stack de SPA para
  los casos desacoplados — probablemente sean dos decisiones separadas en
  vez de una.
- Si en la práctica casi nadie elige multirepo o monorepo desacoplado,
  revisar si vale sostener las tres rutas o volver a la Opción A.

---

## Notas

Un ADR no se edita después de ser aceptado. Si la decisión cambia, se crea un
ADR nuevo que lo reemplaza y se actualiza el campo Estado de este.
