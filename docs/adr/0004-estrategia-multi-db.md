# ADR-0004: Estrategia multi-DB

**Estado:** Propuesto
**Fecha:** 2026-08-08
**Decisores:** Diego

---

## Contexto

VISION.md ya registra "Base de datos: Multi-DB seleccionable" como la elección
de producto (sección 7), y SPEC-0003 (AC-4) da por hecho que todo proyecto
generado levanta un contenedor `db` entre `app`, `nginx`, `db`, `redis`,
`worker` y `scheduler`. Lo que este ADR decide no es *si* Fractal soporta más
de un motor de base de datos, sino **la estrategia**: dónde vive el
conocimiento de las diferencias entre motores, y qué tan expresivo puede ser
FDL respecto a características específicas de un motor.

Esto importa porque un motor de base de datos no es un framework en el
sentido literal del Artículo II —no aparece en la lista de términos
prohibidos de ADR-0002 (`laravel`, `eloquent`, `rails`, etc.)— pero genera el
mismo tipo de riesgo: si el core o FDL terminan asumiendo comportamiento de
un motor concreto (por ejemplo, tipos `JSONB` o arrays nativos de
PostgreSQL), la migración a otro motor dejaría de ser neutral, igual que
pasaría si asumieran Eloquent. La pregunta de fondo es cuánto de esa
neutralidad se garantiza por diseño y cuánto se delega en el ORM de cada
target, que en Laravel y Rails ya resuelve parte de la portabilidad entre
motores por su cuenta.

Restricciones relevantes:

- **Artículo II** exige que el core no conozca frameworks; no dice
  explícitamente nada de motores de DB, pero el mismo espíritu de neutralidad
  aplica por analogía y debe decidirse explícitamente acá.
- **Artículo III (Paridad, no uniformidad)** exige que toda capability se
  cubra en todo target, de forma idiomática. Si un motor de DB solo es
  totalmente compatible con un target y no con otro, es una divergencia que
  debe documentarse, no forzarse.
- **ADR-0002** establece que el contrato del adapter documenta lo que Fractal
  exige a cada framework. La estrategia multi-DB decide si ese contrato
  también debe declarar qué motores soporta cada adapter.
- **SPEC-0003 (AC-4)** ya asume un único contenedor `db` en el runtime de
  deploy; la estrategia elegida no debería requerir cambios estructurales ahí,
  solo qué imagen de motor se instancia.
- **Depende de ADR-0003 (diseño de FDL), aún Propuesto.** El paradigma de FDL
  (DSL propio, YAML/JSON, TypeScript, u otro) condiciona cómo se expresaría un
  tipo de campo específico de motor si la opción elegida acá lo permitiera.
  Este ADR puede avanzar en paralelo porque la estrategia (dónde vive el
  conocimiento de motores) es independiente del paradigma sintáctico, pero la
  sintaxis final de cualquier tipo específico de motor quedará pendiente de
  como se resuelva ADR-0003.
- Queda explícitamente **fuera de esta decisión** qué motores concretos se
  soportan en v1 (MySQL, PostgreSQL, SQLite, etc.) — es una decisión de
  alcance de producto, no de estrategia, y puede resolverse después de esta.

---

## Opciones consideradas

### Opción A: Delegar la portabilidad en el ORM de cada adapter, sin abstracción propia en FDL

FDL define tipos de campo abstractos y neutrales (`string`, `decimal`,
`uuid`, `datetime`, etc.). Cada adapter traduce esos tipos a su propio ORM
(Eloquent Schema Builder, ActiveRecord migrations), que ya sabe generar el
tipo de columna correcto según el motor configurado. Ni el core ni FDL saben
qué motores existen.

- **A favor:** máxima neutralidad, ningún conocimiento de motores de DB fuera
  del adapter, exactamente el mismo patrón que ya rige para frameworks;
  aprovecha que Eloquent y ActiveRecord ya resuelven multi-DB internamente,
  sin reinventar esa capa; menor superficie nueva de contrato entre core y
  adapter.
- **En contra:** el conjunto de tipos que FDL puede expresar queda acotado al
  mínimo común denominador entre lo que ambos ORMs soportan de forma
  portable; características avanzadas de un motor específico (JSONB, arrays,
  full-text search nativo de Postgres) quedan fuera de FDL por diseño, sin
  vía de escape; si dos adapters difieren en cómo interpretan un mismo tipo
  abstracto, la divergencia se detecta tarde, recién al generar.

### Opción B: FDL admite tipos y anotaciones específicas de motor, de forma opcional

El usuario elige motor de DB al crear el proyecto. FDL mantiene sus tipos
abstractos como base, pero permite anotar un campo con un tipo concreto del
motor elegido cuando el mínimo común denominador no alcanza (por ejemplo,
declarar explícitamente una columna `jsonb` en Postgres).

- **A favor:** no fuerza a bajar todo al mínimo común denominador; el usuario
  que ya sabe qué motor va a usar puede modelar con precisión cuando lo
  necesita; el camino feliz (no usar anotaciones específicas) sigue siendo
  neutral, así que no penaliza al caso simple.
- **En contra:** introduce en FDL conocimiento de motores de DB concretos, un
  acoplamiento nuevo con la misma naturaleza de riesgo que el Artículo II
  prohíbe para frameworks, aunque el artículo no lo mencione literalmente;
  cambiar de motor después de haber usado una anotación específica puede
  romper la entidad, lo cual tensiona la idea de "un dominio, N destinos";
  el contrato del adapter (ADR-0002) tendría que crecer para declarar qué
  anotaciones específicas soporta cada motor que expone.

### Opción C: Motor de DB fijo por adapter en v1, sin selección real de usuario

Cada adapter declara un único motor por defecto (por ejemplo, el que sea
convención en su ecosistema). La selección de motor por parte del usuario no
existe todavía; "multi-DB" se limita a que cada target pueda tener un motor
distinto entre sí, no a que el usuario elija dentro de un mismo target. La
selección real de usuario se trata como capability futura, fuera de v1.

- **A favor:** máxima simplicidad para v1, en línea con el Artículo IV y con
  el mismo argumento que ya usó ADR-0002 para no abstraer sin caso concreto;
  reduce de inmediato la superficie de FDL, del contrato de adapter y de la
  capa de deploy a un solo camino por target; evita resolver ahora la
  pregunta de portabilidad de tipos entre motores, sin datos reales todavía.
- **En contra:** contradice literalmente lo ya anotado en VISION.md
  ("Base de datos: Multi-DB seleccionable"); pospone una capability que el
  usuario objetivo (freelance o agencia que arranca proyectos para distintos
  clientes) probablemente valora poder elegir según el contexto de cada
  cliente; "seleccionable" pasaría a significar otra cosa de lo que hoy dice
  la visión, lo cual requeriría además actualizar ese documento.

### Opción D: Capa de mapeo de tipos centralizada en el core, compartida entre adapters

FDL mantiene tipos abstractos (como en la Opción A), pero en lugar de que
cada adapter resuelva por su cuenta el mapeo a columnas concretas, el core
mantiene una tabla de mapeo única (tipo FDL → tipo de columna por motor
soportado) que todos los adapters consultan. El adapter sigue siendo quien
invoca al ORM del framework, pero el "qué tipo de columna corresponde" se
decide en un solo lugar.

- **A favor:** evita duplicar la misma tabla de mapeo en cada adapter, con el
  riesgo de que diverjan silenciosamente entre Laravel y Rails para el mismo
  tipo abstracto y el mismo motor; centraliza la fuente de verdad de qué
  motores están soportados y cómo se traduce cada tipo, útil como
  documentación viva del alcance real de FDL.
- **En contra:** obliga al core a conocer motores de base de datos
  explícitamente (nombres de tipos de columna, particularidades por motor),
  algo que hasta ahora el core no necesitaba saber de nada externo al
  dominio; si mañana un adapter necesita un mapeo distinto al estándar para
  su ORM, esa tabla centralizada se convierte en un punto de excepción y
  configuración adicional en lugar de una regla simple.

---

## Decisión

Pendiente. Diego decide entre las opciones desarrolladas arriba.

---

## Consecuencias

Pendiente de la opción elegida.

---

## Notas

Un ADR no se edita después de ser aceptado. Si la decisión cambia, se crea un
ADR nuevo que lo reemplaza y se actualiza el campo Estado de este.
