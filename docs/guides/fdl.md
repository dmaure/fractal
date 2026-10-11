# Guía de usuario: FDL (Fractal Definition Language) v0

FDL es el lenguaje con el que describís el **dominio** de tu aplicación —sus
entidades, sus campos y sus relaciones— una sola vez, en un archivo JSON. Esta
guía te alcanza para escribir un documento FDL válido a mano, sin necesidad de
leer la especificación.

> Fuente de verdad: los tipos del documento viven en
> `packages/core/src/types/fdl.ts` y las reglas, el parser y los diagnósticos en
> `packages/core/src/fdl/`. Los ejemplos de esta guía son los de las fixtures en
> `packages/core/test/fixtures/fdl/`. El lenguaje está especificado en
> `docs/specs/0004-lenguaje-fdl.md` y su paradigma (JSON) en
> `docs/adr/0003-diseno-fdl.md`. Esta guía refleja el código en `master`; si algo
> diverge, el código manda.

---

## ¿Qué es FDL?

FDL es un **documento JSON** que describe tu dominio: qué entidades existen, qué
campos tiene cada una y cómo se relacionan entre sí. Nada más.

Es deliberadamente **agnóstico**: FDL no sabe nada de frameworks, de bases de
datos ni de infraestructura. No nombra columnas, ni claves foráneas, ni tablas
intermedias, ni motores de almacenamiento. Describe **qué** es tu dominio, no
**cómo** se implementa. Esa traducción —de tu dominio a un proyecto concreto— la
hace cada adapter de forma idiomática.

La ventaja: escribís tu dominio una vez y lo podés proyectar sobre distintos
targets sin reescribirlo.

Como FDL es JSON puro, lo editás con cualquier editor de texto. JSON no tiene
comentarios: si una entidad necesita explicación, usá el campo `description`.

---

## Forma del documento

Todo documento FDL tiene tres claves de nivel superior:

| Clave | Obligatorio | Tipo | Notas |
|---|---|---|---|
| `fdlVersion` | sí | string | Versión del lenguaje. En v0 vale exactamente `"0"`. |
| `project` | sí | objeto | Metadatos del dominio (ver abajo). No describe infraestructura. |
| `project.name` | sí | string | Nombre del proyecto; identificador legible. |
| `project.description` | no | string | Descripción libre del proyecto. |
| `entities` | sí | lista | Al menos una entidad. |

El documento válido más chico declara la versión, un proyecto con nombre y una
entidad con al menos un campo:

```json
{
  "fdlVersion": "0",
  "project": { "name": "tienda" },
  "entities": [
    {
      "name": "Producto",
      "fields": [
        { "name": "nombre", "type": "string", "maxLength": 120 }
      ]
    }
  ]
}
```

`project` son metadatos de **dominio**, no de infraestructura: FDL no conoce
targets, topologías de repositorios ni motores de base de datos. Todo eso lo
aportan otras piezas, fuera de FDL.

---

## Entidades

Una entidad es una cosa de tu dominio (un `Producto`, un `Pedido`, un
`Cliente`). Cada entrada de `entities` tiene esta forma:

| Clave | Obligatorio | Tipo | Notas |
|---|---|---|---|
| `name` | sí | string | Único en el documento. Identificador válido. Se recomienda PascalCase. |
| `description` | no | string | Descripción libre de la entidad. |
| `fields` | sí | lista | Al menos un campo. |
| `relations` | no | lista | Relaciones salientes de la entidad (ver más abajo). |

Un **identificador válido** empieza con una letra y sigue solo con letras,
dígitos y guiones bajos (`_`). Para los nombres de entidad se recomienda
**PascalCase** (`Producto`, `PedidoDeCompra`), aunque no es obligatorio.

### El identificador implícito `id`

En v0 **cada entidad tiene un identificador único implícito llamado `id`**. No
hace falta que lo declares: el adapter lo materializa según la convención de su
target (por ejemplo, autoincremental o UUID). Por eso no podés declarar un campo
llamado `id` a menos que sea tu clave primaria explícita.

Si querés usar otro campo como identificador, marcalo con `primaryKey: true`
(ver modificadores): ese campo reemplaza al `id` implícito. A lo sumo un campo
por entidad puede ser clave primaria. Las **claves primarias compuestas** (más
de un campo) quedan fuera de v0.

---

## Campos y modificadores

Cada campo de una entidad declara, como mínimo, un `name` (identificador válido,
único dentro de la entidad; se recomienda camelCase) y un `type` (ver la próxima
sección). Además admite modificadores opcionales:

| Modificador | Aplica a | Default | Qué hace |
|---|---|---|---|
| `nullable` | todos | `false` | Si es `true`, el campo admite ausencia de valor. |
| `unique` | todos | `false` | Exige que el valor sea único entre todas las instancias. |
| `primaryKey` | todos | `false` | Marca el campo como identificador de la entidad. A lo sumo uno por entidad. |
| `default` | todos | — | Valor por defecto. Su tipo debe ser compatible con el `type`. |
| `maxLength` | solo `string` | — | Longitud máxima del texto. |
| `precision` | solo `decimal` | — | Cantidad total de dígitos. |
| `scale` | solo `decimal` | — | Cantidad de dígitos decimales. |
| `values` | solo `enum` | — | Lista de valores admitidos (obligatoria para `enum`, no vacía y sin duplicados). |

Un modificador específico de un tipo usado sobre otro tipo es inválido: por
ejemplo, `maxLength` sobre un campo `integer`, o `values` sobre un `string`.

---

## Tipos de campo

FDL v0 ofrece un conjunto cerrado de **13 tipos escalares abstractos**. Son
neutrales respecto de framework y de motor de base de datos; cada adapter los
traduce al tipo de columna idiomático de su target.

| Tipo | Para qué sirve | Modificadores asociados |
|---|---|---|
| `string` | Texto corto de una línea | `maxLength` |
| `text` | Texto largo multilínea | — |
| `integer` | Número entero | — |
| `bigInteger` | Número entero de rango amplio | — |
| `decimal` | Número de punto fijo (p. ej. montos) | `precision`, `scale` |
| `float` | Número de punto flotante | — |
| `boolean` | Verdadero / falso | — |
| `date` | Fecha sin hora | — |
| `time` | Hora sin fecha | — |
| `datetime` | Fecha y hora | — |
| `uuid` | Identificador universal | — |
| `json` | Estructura JSON embebida | — |
| `enum` | Valor de un conjunto cerrado | `values` (obligatorio) |

Tres tipos tienen modificadores propios que conviene recordar:

- `string` acepta `maxLength`.
- `decimal` acepta `precision` (dígitos totales) y `scale` (dígitos decimales).
- `enum` **exige** `values`: una lista no vacía, sin duplicados, con los valores
  admitidos.

---

## Relaciones

Las relaciones se declaran en el array `relations` de la entidad **origen**.
Cada relación tiene esta forma:

| Clave | Obligatorio | Tipo | Notas |
|---|---|---|---|
| `name` | sí | string | Identificador válido (se recomienda camelCase). Único entre las relaciones **y** los campos de la entidad. |
| `kind` | sí | string | Una de: `one-to-many`, `many-to-one`, `many-to-many`. |
| `target` | sí | string | Nombre de otra entidad del mismo documento. |
| `inverse` | no | string | Nombre de la relación recíproca en la entidad `target`, si se modela de los dos lados. |
| `nullable` | no | boolean | Solo para `many-to-one`: si la referencia puede faltar. Default `false`. |

Las tres cardinalidades:

- **`one-to-many`**: la entidad origen posee muchas instancias del `target`
  (un `Producto` tiene muchos `Pedido`). Su recíproco natural es un
  `many-to-one` declarado en el `target`.
- **`many-to-one`**: la entidad origen referencia a una instancia del `target`
  (cada `Pedido` pertenece a un `Producto`). Es el lado que materializa la
  referencia; solo acá tiene sentido `nullable`.
- **`many-to-many`**: ambas entidades se asocian de muchos a muchos. Se declara
  en una de las dos, o en ambas enlazadas con `inverse`.

Cuando modelás los dos lados de una relación, enlazalos con `inverse`: el valor
de `inverse` debe ser el `name` de la relación recíproca en la entidad `target`.

FDL describe **qué** relación existe, no **cómo** se implementa. Las claves
foráneas, las tablas intermedias y las convenciones de nombre son idioma de cada
adapter: FDL no las nombra.

---

## Ejemplo completo (relacional)

Dos entidades, campos con modificadores y una relación modelada de los dos lados
con `inverse`:

```json
{
  "fdlVersion": "0",
  "project": {
    "name": "tienda",
    "description": "Catálogo de productos y pedidos"
  },
  "entities": [
    {
      "name": "Producto",
      "description": "Un artículo vendible",
      "fields": [
        { "name": "nombre", "type": "string", "maxLength": 120, "unique": true },
        { "name": "precio", "type": "decimal", "precision": 10, "scale": 2 },
        { "name": "estado", "type": "enum", "values": ["borrador", "publicado"], "default": "borrador" },
        { "name": "descripcion", "type": "text", "nullable": true }
      ],
      "relations": [
        { "name": "pedidos", "kind": "one-to-many", "target": "Pedido", "inverse": "producto" }
      ]
    },
    {
      "name": "Pedido",
      "fields": [
        { "name": "cantidad", "type": "integer" },
        { "name": "creadoEn", "type": "datetime" }
      ],
      "relations": [
        { "name": "producto", "kind": "many-to-one", "target": "Producto", "inverse": "pedidos" }
      ]
    }
  ]
}
```

---

## Reglas de validación (VR-1 … VR-12)

Tu documento pasa por dos etapas. Primero el **parser** revisa la *forma* del
JSON (que sea JSON válido, que no falten claves obligatorias, que los valores
sean del tipo correcto). Después, si la forma es correcta, el **validador**
aplica estas doce reglas *semánticas*. El validador **no** se detiene en el
primer error: acumula todas las violaciones y te las reporta juntas, para que
tengas el panorama completo del documento de una sola pasada.

| Regla | Qué valida | Ejemplo de mensaje |
|---|---|---|
| **VR-1** | Nombres de entidad no vacíos, identificadores válidos y únicos en el documento. | `duplicate entity name "Producto"` |
| **VR-2** | Nombres de campo válidos y únicos dentro de la entidad; `id` solo si es `primaryKey`. | `duplicate field name "cantidad" in entity "Producto"` |
| **VR-3** | `type` pertenece al catálogo y cada modificador se usa solo en su tipo. | `unknown field type "money"` |
| **VR-4** | Un `enum` declara `values` no vacío y sin duplicados; ningún otro tipo declara `values`. | `enum field must declare non-empty values` |
| **VR-5** | El `target` de cada relación nombra una entidad existente del documento. | `relation target "Fantasma" does not name an existing entity` |
| **VR-6** | Nombres de relación únicos dentro de la entidad y sin colisionar con nombres de campo. | `relation name "nombre" collides with a field name in entity "Producto"` |
| **VR-7** | `fdlVersion` es una versión soportada (en v0: `"0"`). | `unsupported fdlVersion "1"` |
| **VR-8** | El `kind` de cada relación es una de las tres cardinalidades. | `unknown relation kind "has-many"` |
| **VR-9** | El `default` de un campo es compatible con su `type`. | `default "hola" is not compatible with type "integer"` |
| **VR-10** | Ningún identificador contiene vocabulario de framework o de ORM. | `identifier "Eloquent" contains disallowed framework/ORM vocabulary` |
| **VR-11** | A lo sumo un campo por entidad con `primaryKey: true`. | `entity "Producto" declares 2 primary-key fields; at most one is allowed` |
| **VR-12** | Si una relación declara `inverse`, ese nombre existe como relación en la entidad `target`. | `inverse "fantasma" does not name a relation on target entity "Pedido"` |

Los mensajes se emiten en inglés (es el idioma de los diagnósticos). VR-10 cuida
el agnosticismo del lenguaje: tus nombres de entidades, campos y relaciones no
pueden ser términos propios de un framework o de un ORM.

---

## Errores típicos

Cuando un documento no valida, el sistema te devuelve un reporte con una
cabecera `N FDL diagnostic(s):` y, debajo, una línea por diagnóstico con la
forma `[VR-N] <ubicación>: <mensaje> (<ruta>)`. La ubicación nombra la entidad,
el campo o la relación afectada; la ruta entre paréntesis apunta a la posición
exacta dentro del documento.

### `target` que no existe (VR-5)

```json
{
  "fdlVersion": "0",
  "project": { "name": "tienda" },
  "entities": [
    {
      "name": "Producto",
      "fields": [
        { "name": "nombre", "type": "string", "maxLength": 120 }
      ],
      "relations": [
        { "name": "pedidos", "kind": "one-to-many", "target": "Fantasma" }
      ]
    }
  ]
}
```

```text
1 FDL diagnostic(s):
  - [VR-5] relation "pedidos" of entity "Producto": relation target "Fantasma" does not name an existing entity (entities[0].relations[0].target)
```

La relación `pedidos` apunta a una entidad `Fantasma` que no está declarada en
`entities`. Toda relación debe referenciar una entidad existente del mismo
documento: revisá el nombre del `target` (y que no sea un error de tipeo).

### `default` incompatible con el tipo (VR-9)

```json
{
  "fdlVersion": "0",
  "project": { "name": "tienda" },
  "entities": [
    {
      "name": "Producto",
      "fields": [
        { "name": "nombre", "type": "string", "maxLength": 120 },
        { "name": "cantidad", "type": "integer", "default": "hola" }
      ]
    }
  ]
}
```

```text
1 FDL diagnostic(s):
  - [VR-9] field "cantidad" of entity "Producto": default "hola" is not compatible with type "integer" (entities[0].fields[1].default)
```

El campo `cantidad` es `integer`, pero su `default` es el texto `"hola"`. El
valor por defecto tiene que ser del mismo tipo que el campo: un número para
`integer` (p. ej. `0`), un valor de `values` para un `enum`, `true`/`false` para
un `boolean`, etc.

### Identificador con vocabulario de ORM (VR-10)

```json
{
  "fdlVersion": "0",
  "project": { "name": "tienda" },
  "entities": [
    {
      "name": "Producto",
      "fields": [
        { "name": "nombre", "type": "string", "maxLength": 120 }
      ]
    },
    {
      "name": "Eloquent",
      "fields": [
        { "name": "nombre", "type": "string", "maxLength": 120 }
      ]
    }
  ]
}
```

```text
1 FDL diagnostic(s):
  - [VR-10] entity "Eloquent": identifier "Eloquent" contains disallowed framework/ORM vocabulary (entities[1].name)
```

La entidad se llama con un término propio de un ORM, y FDL es agnóstico por
construcción: los nombres de tu dominio no pueden llevar vocabulario de framework
ni de ORM. Nombrá las entidades por lo que representan en tu negocio (`Producto`,
`Cliente`, `Factura`), no por la tecnología que las va a implementar.

---

## Referencias

- [`docs/specs/0004-lenguaje-fdl.md`](../specs/0004-lenguaje-fdl.md) — especificación completa del lenguaje FDL v0
- [`docs/adr/0003-diseno-fdl.md`](../adr/0003-diseno-fdl.md) — decisión de modelar FDL sobre JSON
- [`packages/core/test/fixtures/fdl/`](../../packages/core/test/fixtures/fdl/) — fixtures de ejemplo (documentos válidos e inválidos, uno por regla)
