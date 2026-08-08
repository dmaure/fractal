# ADR-0003: Diseño de FDL (Fractal Definition Language)

**Estado:** Propuesto
**Fecha:** 2026-08-08
**Decisores:** Diego

---

## Contexto

El Artículo II de la Constitución exige que el core no conozca ningún framework.
Esto solo es posible si existe una representación intermedia donde el dominio
—entidades, campos, relaciones, reglas— se define una sola vez, sin vocabulario
de ningún target. Esa representación es FDL. Esta decisión no fija el lenguaje
completo (eso es SPEC-0004, que depende de este ADR); fija el **paradigma**: en
qué forma existe FDL y cómo se produce.

Restricciones que ya existen y que cualquier opción debe respetar:

- **ADR-0001** define un CLI Node.js que invoca la toolchain del target. FDL debe
  poder cruzar ese puente entre procesos como una carga de datos serializable
  (el ADR ya anticipa comunicación por archivo, probablemente JSON) para llegar
  a Artisan, `rails generate`, o lo que corresponda del otro lado.
- **ADR-0002** establece el contrato del adapter: FDL es la entrada de ese
  contrato. Cuanto más ambigua o más expresiva de forma incontrolada sea FDL,
  más difícil es que un adapter nuevo (Rails, y los que vengan después) la
  traduzca de forma completa e idiomática.
- **Artículo III (Paridad, no uniformidad)** exige que todo target cubra las
  mismas capabilities. FDL es el techo de lo expresable: si el lenguaje permite
  algo que un target no puede traducir idiomáticamente, esa divergencia debe
  poder documentarse, no forzarse.
- **Artículo IV (Simplicidad por defecto)** aplica también a cómo se escribe
  FDL, no solo a los prompts del CLI. Si definir una entidad exige aprender una
  sintaxis nueva antes de poder usarla, ya hay fricción.
- **Artículo XI (La especificación precede al código)** pide que los specs se
  escriban en lenguaje de negocio. FDL no es un spec, pero su vocabulario debe
  poder leerse por alguien que piensa en entidades y reglas de negocio, no en
  estructuras de compilador.
- El roadmap ubica **SPEC-0004** (especificación del lenguaje), **SPEC-0005**
  (parser y validador) y **SPEC-0006** (contrato del adapter) en M2, todos
  bloqueados por esta decisión.

La pregunta de fondo: ¿FDL es un archivo que el usuario edita a mano, un
artefacto que el CLI produce a partir de prompts, o ambos? Cualquiera de las
opciones siguientes debe sostener ese caso de uso doble, porque `fractal
entity` (M2) probablemente escribe FDL por prompts y el usuario probablemente
también querrá editarla directamente después.

---

## Opciones consideradas

### Opción A: DSL propio (lenguaje textual a medida, con parser propio)

Un lenguaje diseñado específicamente para este dominio, con su propia gramática
y parser, en la línea de lo que hace Prisma con su `schema.prisma`.

```
entity Producto {
  field nombre: string required
  field precio: decimal(10,2)
  has_many Pedido
}
```

- **A favor:** el vocabulario es exactamente el del dominio, sin ruido de un
  formato genérico; mejor lenguaje de negocio posible (encaja con Artículo XI);
  control total sobre mensajes de error y sobre qué construcciones se permiten,
  lo que ayuda a mantener FDL dentro del techo de lo traducible a todos los
  targets (Artículo III); no hereda las limitaciones ni la superficie de un
  formato ajeno.
- **En contra:** hay que construir y mantener un parser (lexer, gramática,
  recuperación de errores) desde cero, el mayor costo de implementación de las
  cuatro opciones; sin tooling de editor (resaltado de sintaxis, autocompletado)
  la experiencia de escribir FDL a mano es pobre hasta que se invierta en eso,
  lo cual tensiona el Artículo IV; cada cambio al lenguaje es un cambio al
  parser, no solo a un schema de validación.

### Opción B: Formato declarativo sobre YAML o JSON con schema definido

Entidades descritas en YAML (o JSON), validadas contra un JSON Schema propio de
Fractal. Sin gramática nueva: se apoya en parsers YAML/JSON ya maduros.

```yaml
entities:
  Producto:
    fields:
      nombre: { type: string, required: true }
      precio: { type: decimal, precision: 10, scale: 2 }
    relations:
      pedidos: { type: has_many, target: Pedido }
```

- **A favor:** no requiere escribir parser propio, solo un schema de
  validación; YAML/JSON ya tienen soporte de editor out-of-the-box (resaltado,
  a veces autocompletado vía JSON Schema) sin que Fractal tenga que
  construirlo; formato consistente con otras piezas del propio proyecto
  (Docker Compose, GitHub Actions ya usan YAML); serialización trivial para el
  puente Node → toolchain de ADR-0001, es el mismo formato de salida;
  diff legible en git.
- **En contra:** poco expresivo para reglas que dependen de lógica (ej.
  validaciones condicionales, valores calculados) sin agregar un
  mini-lenguaje de expresiones embebido, lo que reintroduce buena parte del
  costo de la Opción A pero de forma menos cohesiva; los formatos de
  configuración declarativos tienden a crecer con extensiones ad-hoc con el
  tiempo si no hay disciplina de versionado de schema; se siente genérico,
  no diseñado para este dominio específico.

### Opción C: API programática en TypeScript (builder/fluent interface)

Ya que el core es Node.js (ADR-0001), FDL se define invocando funciones de una
API tipada, no escribiendo un archivo de datos.

```ts
defineEntity('Producto', (e) => {
  e.field('nombre').string().required()
  e.field('precio').decimal(10, 2)
  e.hasMany('Pedido')
})
```

- **A favor:** ningún parser ni gramática que construir; TypeScript da
  autocompletado y chequeo de tipos gratis en cualquier editor con soporte TS;
  permite composición real (loops, reutilización, entidades generadas a partir
  de otra fuente) sin mecanismos adicionales; el mismo lenguaje del core
  reduce el número de tecnologías involucradas.
- **En contra:** exige conocer TypeScript/JavaScript para editar FDL a mano,
  una barrera para desarrolladores Rails o PHP que es exactamente el perfil de
  usuario secundario de Fractal (Artículo IV: "si una feature requiere leer
  documentación para usarse, está mal diseñada" aplica también acá); al ser
  código ejecutable, nada impide que se cuele lógica de negocio o efectos
  secundarios dentro de la definición de dominio, lo que rompe la premisa de
  FDL como dato inerte y agnóstico; de todos modos hay que "compilar" el
  resultado a una estructura serializable para cruzar el puente Node → toolchain
  de ADR-0001, así que el ahorro de no tener parser es parcial; la propia API
  (`defineEntity`, etc.) se vuelve superficie de compatibilidad a mantener.

### Opción D: Reutilizar un formato de schema existente (ej. lenguaje de Prisma u otro DSL de terceros, adaptado)

Adoptar o adaptar un lenguaje de definición de dominio ya existente en el
ecosistema en lugar de diseñar uno nuevo.

- **A favor:** tooling de editor y parser ya resueltos y maduros; curva de
  aprendizaje menor para desarrolladores que ya conocen ese formato; ahorra
  todo el costo de diseño de sintaxis.
- **En contra:** el formato fue diseñado para otro propósito (típicamente,
  definir un schema de base de datos para un ORM específico), no para ser
  agnóstico de framework y traducible a Eloquent y ActiveRecord por igual;
  ata a Fractal a las decisiones de evolución de un proyecto externo que no
  controla; puede modelar bien campos y relaciones pero no necesariamente las
  reglas de negocio o metadatos que Fractal necesita (auth, capabilities,
  validación) sin extenderlo de todas formas, con lo que se termina
  manteniendo un fork o una capa propia encima de otro lenguaje ajeno.

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
