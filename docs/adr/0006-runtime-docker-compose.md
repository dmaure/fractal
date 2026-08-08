# ADR-0006: Runtime de producción

**Estado:** Propuesto
**Fecha:** 2026-08-08
**Decisores:** Diego

---

## Contexto

`packages/deploy` es, junto con el core, la parte de Fractal que el Artículo
II obliga a mantener agnóstica de framework. Este ADR decide cómo se ejecuta
la aplicación generada en el VPS del usuario: qué forma tiene el runtime de
producción que esa capa provisiona.

Hay una tensión que conviene decir explícita: **SPEC-0003, ya en Draft, da
por escrito Docker Compose como si ya estuviera decidido.** AC-4 pide
"Docker CE, Docker Compose plugin" instalados y activos, y lista contenedores
concretos (`app`, `nginx`, `db`, `redis`, `worker`, `scheduler`). VISION.md
también anota "Runtime de producción: Docker Compose" en su tabla de
decisiones (sección 7). Este ADR trata esa elección como pendiente de
confirmación formal, no como un hecho consumado, porque ninguna de esas dos
menciones es un ADR aceptado. Si la decisión final acá no es Docker Compose,
SPEC-0003 (AC-4) necesita revisión antes de avanzar a Aprobado.

Restricciones que cualquier opción debe respetar:

- **Artículo VI (Seguridad no es opcional)** exige firewall deny-by-default,
  login root deshabilitado, secrets fuera del repo — condiciones sobre el
  VPS, no sobre el runtime en sí, pero el runtime elegido no puede dificultar
  cumplirlas.
- **Artículo VII (Todo deploy es reversible)**: "el estado del servidor es
  reproducible: si se destruye, se reconstruye con un comando." Esto es
  probablemente la restricción más determinante para esta decisión.
- **Artículo VIII (Idempotencia)**: ejecutar el provisioning o el deploy dos
  veces debe dar resultado idéntico.
- **SPEC-0003 (AC-2)** fija los recursos mínimos del VPS soportado: 1 vCPU,
  2 GB RAM, 20 GB disco. Cualquier runtime que se elija corre ahí, no en un
  servidor con margen.
- **VISION.md, sección 6**, ya excluye explícitamente de v1 "Microservicios,
  Kubernetes" — por eso esa familia de opciones no se desarrolla acá como
  alternativa viable, ya está fuera de alcance por decisión previa.
- La Constitución fija como métrica el **Time-to-Production < 30 min** y
  **"Pasos manuales en el deploy ≤ 2"** (VISION.md, sección 8): el runtime
  elegido no puede exigir pasos manuales adicionales en cada deploy.

---

## Opciones consideradas

### Opción A: Docker Compose

Un único `docker-compose.yml` (o `compose.yaml`) declara todos los servicios
del proyecto generado —`app`, `nginx`, `db`, `redis`, `worker`, `scheduler`—
y el ciclo de vida completo se gestiona con `docker compose up/down`.

- **A favor:** un solo archivo declarativo describe todo el stack, encaja
  directamente con lo que SPEC-0003 (AC-4) ya asume; reconstrucción con un
  comando si el VPS se destruye, cumple el Artículo VII de forma directa;
  `docker compose up` es naturalmente idempotente si el archivo no cambió,
  favorece el Artículo VIII sin lógica adicional a mano; aislamiento de
  dependencias por contenedor evita que dos proyectos Fractal en el mismo
  VPS choquen por versiones de PHP o Ruby; rollback razonablemente simple
  revirtiendo el tag de imagen del servicio `app`; formato ampliamente
  conocido, con buena documentación y soporte de tooling.
- **En contra:** exige instalar Docker Engine y el plugin Compose como paso
  de provisioning adicional; el overhead de memoria de correr seis
  contenedores simultáneos (app, nginx, db, redis, worker, scheduler) es una
  preocupación real en el piso mínimo de recursos que fija AC-2 (1 vCPU,
  2 GB RAM); agrega una capa de indirección para depurar problemas en
  producción, relevante para el perfil de usuario que nunca administró
  contenedores.

### Opción B: Contenedores Docker sin Compose, orquestados por scripts propios

Se usa Docker Engine para el aislamiento de cada servicio, pero sin el
plugin Compose: el orden de arranque, la red interna, las dependencias entre
contenedores y los healthchecks los resuelven scripts de provisioning
propios de `packages/deploy` (por ejemplo, unidades `systemd` que invocan
`docker run` con las flags correspondientes).

- **A favor:** mismo aislamiento y reproducibilidad de imágenes que la
  Opción A; control total sobre el orden de arranque, los healthchecks y el
  mecanismo de rollback, sin las limitaciones del modelo declarativo de
  Compose; no ata la capa de deploy a la evolución del plugin Compose de
  Docker Inc. como dependencia externa.
- **En contra:** reimplementa en scripts propios lo que Compose ya resuelve
  (red interna entre servicios, `depends_on`, políticas de reinicio), más
  superficie propia para mantener y más lugares donde un bug rompe la
  idempotencia; ningún ahorro real de recursos frente a la Opción A, sigue
  corriendo el mismo Docker Engine de base; la garantía de reconstrucción
  con un comando (Artículo VII) pasa a depender enteramente de la calidad de
  los scripts propios, en vez de apoyarse en un formato declarativo estándar.

### Opción C: Instalación nativa en el host, sin contenedores

`packages/deploy` instala cada servicio directamente sobre el sistema
operativo del VPS —paquetes del SO, `systemd` para app/worker/scheduler,
Nginx y la base de datos como paquetes nativos— sin ninguna capa de Docker.

- **A favor:** menor overhead de recursos en el piso mínimo de AC-2, más
  margen real para que base de datos, Redis y el proceso de la aplicación
  convivan en 1 vCPU / 2 GB; sin capa de aislamiento intermedia, depuración
  directa con herramientas estándar de Linux (`journalctl`, `ps`); no
  depende de que Docker esté disponible ni bien soportado en el VPS elegido
  por el usuario.
- **En contra:** el Artículo VII se vuelve mucho más difícil de sostener —
  reconstruir el servidor si se destruye implica reinstalar y versionar a
  mano cada paquete del sistema, no un solo comando declarativo; dos
  proyectos Fractal en el mismo VPS (uno Laravel, otro Rails) competirían
  por versiones globales de PHP o Ruby instaladas en el host, un problema
  que Docker evita por diseño y que acá requeriría herramientas adicionales
  de gestión de versiones (`phpenv`, `rbenv`) con su propio costo de
  provisioning; el aislamiento entre targets se vuelve frágil justo en la
  capa (`packages/deploy`) que más necesita ser agnóstica y confiable.

---

## Decisión

Pendiente. Diego decide entre las opciones desarrolladas arriba.

Nota: si la decisión confirma Docker Compose (Opción A), este ADR formaliza
lo que SPEC-0003 (AC-4) ya asume y no requiere cambios ahí. Si elige B o C,
SPEC-0003 debe actualizarse antes de pasar a Aprobado.

---

## Consecuencias

Pendiente de la opción elegida.

---

## Notas

Un ADR no se edita después de ser aceptado. Si la decisión cambia, se crea un
ADR nuevo que lo reemplaza y se actualiza el campo Estado de este.
