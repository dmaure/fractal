# ADR-0008: Herramienta de monorepo

**Estado:** Aceptado
**Fecha:** 2026-08-10
**Decisores:** Diego

---

## Contexto

ROADMAP.md lista "Monorepo con workspaces configurado" como ítem de M0, y
sigue pendiente. Es, en la práctica, el bloqueo estructural de todo lo que
sigue: sin workspaces configurados no hay dónde correr el lint de
acoplamiento del Artículo II, ni cómo instalar y probar `packages/core`
junto con `packages/adapter-laravel` y `packages/deploy` de forma coherente,
ni cómo estructurar CI para testear los paquetes en conjunto.

A diferencia de los ADRs anteriores, esta decisión no está anticipada en
ninguna tabla de VISION.md ni tiene un número reservado en el roadmap —
surgió como gap durante la auditoría de M0. Por eso toma el próximo número
disponible (ADR-0008), sin pisar el 0005 reservado para la decisión de
Frontend Laravel.

Restricciones relevantes:

- **ADR-0001** ya fijó que el core es Node.js e invoca la toolchain de cada
  target — el monorepo es, como mínimo, un monorepo de paquetes Node/TS
  (`core`, `deploy`, y el lado Node de cada adapter, si lo tiene).
- **ADR-0002 / Artículo II** exige que el core y `deploy` no conozcan
  frameworks. El lint de acoplamiento que lo verifica necesita correr sobre
  la estructura completa del monorepo, así que la herramienta elegida debe
  poder ejecutar ese lint sin fricción particular.
- **Artículo IX (Modularidad)**: "el core es mínimo... todo lo demás es un
  módulo opcional." La herramienta de monorepo no debería imponer una
  estructura que dificulte agregar o quitar paquetes.
- **Artículo IV (Simplicidad por defecto)**, aplicado por analogía a las
  herramientas del propio repo, no solo al producto: la herramienta elegida
  no debería exigir configuración compleja para el caso de hoy, que son
  cuatro paquetes (`core`, `adapter-laravel`, `adapter-rails` en M4,
  `deploy`).
- Hoy no hay ningún build pesado ni suite de tests grande — el volumen real
  de trabajo en CI todavía es chico, lo cual es un dato relevante para
  evaluar cuánto valor aporta cada opción ahora mismo, no en el futuro
  hipotético.

---

## Opciones consideradas

### Opción A: npm workspaces (nativo, sin herramienta adicional)

El mecanismo de workspaces ya incluido en npm, sin instalar nada extra.

- **A favor:** cero dependencias nuevas — ya viene con npm, que de todos
  modos hace falta para ADR-0001; nada nuevo que el equipo (o un agente)
  tenga que aprender; superficie de configuración mínima, alineado con el
  espíritu del Artículo IV/IX aplicado a las herramientas del repo; alcanza
  de sobra para cuatro paquetes sin builds pesados.
- **En contra:** sin cache de tareas (build, test, lint) entre paquetes —
  cada corrida de CI rehace todo aunque nada haya cambiado; sin
  orquestación automática de orden de ejecución entre paquetes según sus
  dependencias, hay que scriptear eso a mano; si el número de paquetes o el
  costo de sus builds crece (Rails en M4, módulos de M5), puede volverse
  lento sin que haya un mecanismo nativo para paliarlo.

### Opción B: pnpm workspaces

Mismo modelo de workspaces, pero con pnpm como gestor de paquetes.

- **A favor:** instalación de dependencias notablemente más rápida y con
  menor uso de disco que npm; estructura de `node_modules` más estricta,
  evita "phantom dependencies" — relevante para no descubrir tarde que
  `packages/core` terminó importando algo que solo declaró
  `adapter-laravel`, un tipo de acoplamiento silencioso que el Artículo II
  quiere evitar; sigue sin agregar una capa de build system, mismo nivel de
  simplicidad que A en ese sentido.
- **En contra:** introduce un gestor de paquetes distinto al que
  probablemente asuma cualquiera que clone el repo esperando `npm install`;
  mismo límite que la Opción A en cuanto a cache y orquestación de tareas —
  pnpm resuelve instalación, no builds ni tests.

### Opción C: Turborepo sobre npm o pnpm workspaces

Una capa de build system encima de cualquiera de las dos opciones
anteriores, agregando cache de tareas y orquestación de orden de ejecución.

- **A favor:** cachea resultados de build/test/lint — no repite trabajo si
  nada cambió, cada vez más relevante a medida que crezcan los paquetes;
  ordena automáticamente en qué secuencia correr tareas entre paquetes
  según sus dependencias declaradas; encaja bien con el Artículo X (tests de
  snapshot por stub), permitiendo cachear resultados de test por paquete en
  vez de correr todo siempre.
- **En contra:** una herramienta más que aprender, configurar y mantener,
  encima de npm o pnpm workspaces (no los reemplaza, se suma); su valor
  real se nota más con muchos paquetes o builds costosos — hoy son cuatro
  paquetes sin build pesado todavía, mismo argumento que ya usó ADR-0002
  para no abstraer sin evidencia real de necesidad.

### Opción D: Nx

Un sistema de monorepo más completo: generadores de código, gráfico de
dependencias, cache local y remoto, y un ecosistema de plugins por stack.

- **A favor:** la opción más completa de las cuatro — generadores,
  visualización del gráfico de dependencias entre paquetes, cache remoto
  compartido entre máquinas o CI.
- **En contra:** la curva de aprendizaje y la superficie de configuración
  más grandes de las cuatro opciones; buena parte de su valor (generadores
  de código, plugins específicos de framework) no aplica bien acá, porque
  Fractal ya es en sí mismo un generador — hay riesgo de terminar
  manteniendo dos sistemas de generación de código superpuestos sin que
  aporten claridad; es la opción más alejada del Artículo IV aplicado a las
  herramientas del propio repo.

---

## Decisión

Elegimos la **Opción B: pnpm workspaces**. Ratifica lo que ya venía
corriendo en la práctica: el PR de Cloud Agents de Cursor (#11, 2026-08-10)
había asumido pnpm para preparar el entorno de desarrollo, adelantándose a
esta decisión — con esto queda formalizada, no es una elección especulativa
sin evidencia.

---

## Consecuencias

### Positivas
- Instalación de dependencias más rápida y con menor uso de disco que npm.
- `node_modules` estricto evita phantom dependencies — ayuda a detectar
  temprano si `packages/core` importa algo que solo declaró
  `adapter-laravel`, acoplamiento silencioso que el Artículo II quiere
  evitar.
- Ya validado en la práctica: el entorno de Cloud Agents de Cursor (PR #11)
  corre sobre pnpm sin ajustes adicionales.
- Sin capa de build system extra que aprender o mantener, coherente con el
  volumen actual de paquetes (Artículo IV aplicado a las herramientas del
  repo).

### Negativas
- Introduce un gestor de paquetes distinto al que cualquiera que clone el
  repo esperando `npm install` asumiría por defecto — hay que documentarlo
  claramente en el README y en `docs/AGENT_PLAYBOOK.md`.
- Sin cache de tareas ni orquestación de orden de ejecución entre paquetes
  (eso es lo que Turborepo hubiera agregado) — a scriptear a mano si hace
  falta a medida que crezcan los paquetes.

### Neutras / a monitorear
- Si el número de paquetes o el costo de sus builds crece lo suficiente
  (Rails en M4, módulos de M5) y la falta de cache de tareas empieza a
  doler en CI, reevaluar Turborepo encima de pnpm workspaces — no se
  descarta permanentemente, se pospone por falta de evidencia hoy.

---

## Notas

Un ADR no se edita después de ser aceptado. Si la decisión cambia, se crea un
ADR nuevo que lo reemplaza y se actualiza el campo Estado de este.
