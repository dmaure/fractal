# SPEC-0004: Lenguaje FDL (Fractal Definition Language) v0

**Estado:** Implementado
**Autor:** Diego
**Fecha:** 2026-10-11
**Última revisión:** 2026-10-12
**Issue:** #

---

## 1. Objetivo

Definir **FDL** (Fractal Definition Language) como la representación
intermedia, agnóstica de framework, en la que se describe el dominio de una
aplicación —entidades, campos, relaciones— una sola vez, para que cada adapter
la proyecte sobre su target (Laravel hoy, Rails en M4). Este spec define el
**lenguaje** (su forma y sus reglas), no el parser ni el validador, que son
alcance de SPEC-0005.

FDL es la pieza que hace posible el Artículo II (el core no conoce ningún
framework) y el principio "un dominio, N frameworks" de la Visión: es el techo
de lo expresable, y lo que cruza el puente Node → toolchain del target
(SPEC-0002) como carga de datos serializable.

---

## 2. Motivación

ADR-0003 fijó el **paradigma** de FDL: un formato declarativo sobre **JSON**
(no YAML, no DSL propio, no API programática), validable con JSON Schema, sin
parser propio que mantener. Lo que ese ADR dejó explícitamente pendiente —"no
fija el lenguaje completo (eso es SPEC-0004)"— es la **forma concreta** del
lenguaje: qué shape tiene el documento, qué tipos de campo existen, cómo se
expresan las relaciones y qué reglas debe cumplir un documento válido.

Sin esa definición no hay nada sobre lo que construir: SPEC-0005 (parser y
validador) no puede parsear ni validar un lenguaje que no está especificado, y
los adapters no pueden traducir una entrada cuya forma no está acordada. El
roadmap ubica este spec como la primera pieza de M2 en su cadena FDL
(SPEC-0004 lenguaje → SPEC-0005 parser/validador → SPEC-0007+ generación).

Este spec es deliberadamente **v0**: cubre lo mínimo para modelar entidades,
campos y relaciones de forma agnóstica y coherente con el contrato del adapter
(SPEC-0006) y con la estrategia multi-DB (ADR-0004). Reglas de negocio,
valores calculados, autenticación y generación de código quedan fuera (§5),
mismo criterio de no abstraer sin caso real que ya usaron ADR-0002 y ADR-0004.

### Decisión de formato de autoría (producto)

El formato de autoría de FDL es **JSON directamente**: el usuario escribe FDL
como un documento JSON, no como YAML ni como un DSL a medida. Esta es una
decisión de producto ya tomada por Diego, **consistente con ADR-0003** (que ya
eligió JSON como representación intermedia y como formato que cruza el puente
sin conversión). Por lo tanto **este spec no introduce ni requiere un ADR
nuevo**: se apoya en ADR-0003 y solo concreta la forma del lenguaje.

Consecuencia asumida (ya anotada en ADR-0003): JSON no tiene comentarios
nativos; si documentar entidades complejas lo exige, se evaluará una
convención `_comment` más adelante. No se decide acá.

---

## 3. Historias de usuario

- Como **desarrollador**, quiero describir mi dominio (entidades, campos,
  relaciones) en un único archivo JSON, sin vocabulario de ningún framework,
  para no reescribir la definición al cambiar de target.
- Como **core**, quiero recibir el dominio como un documento JSON con un shape
  fijo y versionado, para pasarlo a cualquier adapter sin saber qué hay del
  otro lado (Artículo II).
- Como **desarrollador de un adapter** (Laravel hoy, Rails en M4), quiero un
  lenguaje con un conjunto acotado y agnóstico de tipos y relaciones, para
  poder traducirlo de forma completa e idiomática a mi ORM (Artículo III).
- Como **autor de SPEC-0005**, quiero las reglas de validación del lenguaje
  enunciadas como requisitos verificables, para implementarlas sin inventar
  criterios.

---

## 4. Criterios de aceptación

### AC-1: FDL es un documento JSON
- **Dado** que el usuario describe un dominio
- **Cuando** escribe FDL
- **Entonces** lo hace como un documento **JSON** (formato de autoría directo,
  ADR-0003); un documento FDL válido mínimo declara `fdlVersion`, un `project`
  y al menos una entidad con al menos un campo

### AC-2: Shape de nivel superior definido sin ambigüedad
- **Dado** el lenguaje v0
- **Cuando** se lee la §7.1
- **Entonces** quedan definidas, con campos obligatorios vs opcionales, las
  claves de nivel superior: `fdlVersion`, `project` y `entities`

### AC-3: Definición de entidad y de campo
- **Dado** el lenguaje v0
- **Cuando** se define una entidad
- **Entonces** su shape es `name` + `fields` (y `relations` opcional), y cada
  campo tiene `name`, `type` y modificadores (`nullable`, `unique`, `default`,
  `primaryKey` y los específicos del tipo), todo documentado (§7.2, §7.3)

### AC-4: Catálogo de tipos agnósticos
- **Dado** el lenguaje v0
- **Cuando** se declara el tipo de un campo
- **Entonces** el tipo pertenece al conjunto de tipos escalares agnósticos de
  framework definido en §7.4, y cada modificador específico de tipo solo es
  válido para su tipo

### AC-5: Relaciones
- **Dado** el lenguaje v0
- **Cuando** se modela una relación entre entidades
- **Entonces** se expresa con `kind` ∈ {`one-to-many`, `many-to-one`,
  `many-to-many`} y un `target` que referencia otra entidad del mismo
  documento, según §7.5

### AC-6: Reglas de validación enunciadas como requisitos
- **Dado** el lenguaje v0
- **Cuando** se quiere saber qué hace válido a un documento FDL
- **Entonces** la §8 enumera las reglas (nombres, unicidad, integridad
  referencial, compatibilidad tipo/modificador, versión, agnosticismo) como
  **requisitos que SPEC-0005 implementa** (este spec no implementa validación)

### AC-7: Agnosticismo de framework
- **Dado** que FDL vive en el core (Artículo II)
- **Cuando** se revisa cualquier parte del lenguaje
- **Entonces** no aparece vocabulario de ningún framework ni de ningún ORM; el
  sistema de tipos es abstracto (coherente con ADR-0004, Opción B: base
  neutral; las anotaciones específicas de motor se difieren, §5)

### AC-8: Ejemplos JSON concretos
- **Dado** el lenguaje v0
- **Cuando** se lee el spec
- **Entonces** incluye al menos un ejemplo mínimo (una entidad) y un ejemplo
  relacional (dos entidades con relación), ambos JSON válidos (§7.6)

### AC-9: Versionado desde el día uno
- **Dado** que el shape del documento puede evolucionar
- **Cuando** se escribe FDL
- **Entonces** el documento declara su versión en `fdlVersion` (v0 ⇒ `"0"`),
  coherente con la nota de versionabilidad del contrato (SPEC-0006 §7); v0 no
  formaliza aún la estrategia de ruptura de compatibilidad

---

## 5. Fuera de alcance

- **Parser y validador** de FDL — es SPEC-0005. Este spec enuncia las reglas
  (§8) como requisitos; no las implementa.
- **Generación de código**: migrations, models, factories, seeders, CRUD, API,
  frontend — SPEC-0007 (templating) y SPEC-0008+ en adelante.
- **Autoría por prompts** (`fractal entity` escribiendo FDL) — capability de
  M2 posterior; este spec define el lenguaje que esa capability producirá.
- **Lenguaje de expresiones / reglas de negocio**: validaciones condicionales,
  valores calculados, reglas que dependen de lógica. ADR-0003 ya acotó la
  expresividad al mínimo común denominador y descartó un mini-lenguaje
  embebido en v0.
- **Catálogo completo de anotaciones específicas de motor de DB** (ADR-0004,
  Opción B). FDL v0 define solo el **conjunto base de tipos abstractos** y deja
  **documentado el punto de extensión** (§7.4) para esas anotaciones; su forma
  concreta y el set de motores soportados se especifican cuando haya caso real.
- **Metadatos de autenticación, roles y permisos** — M3.
- **Identificadores compuestos / claves primarias múltiples** — v0 asume un
  identificador único por entidad (§7.2).

---

## 6. Dependencias

| Depende de | Tipo | Estado |
|---|---|---|
| ADR-0003 (FDL en JSON) | Bloqueante | Aceptado |
| ADR-0002 (arquitectura multi-target) | Bloqueante | Aceptado |
| ADR-0004 (estrategia multi-DB) | Blanda | Aceptado |
| Artículo II (core agnóstico) | Bloqueante | Vigente |

Habilita a: **SPEC-0005** (parser y validador de FDL), que consume el lenguaje
aquí definido; y a SPEC-0007+ (generación), que proyectan FDL sobre cada target
a través del contrato del adapter (SPEC-0006).

---

## 7. Especificación del lenguaje (v0)

FDL v0 es un **documento JSON**. Todas las claves son `camelCase`. Salvo que se
indique lo contrario, un campo ausente equivale a su valor por defecto; los
valores por defecto se indican campo a campo.

### 7.1 Shape de nivel superior

```jsonc
{
  "fdlVersion": "0",            // obligatorio. Versión del lenguaje. v0 ⇒ "0".
  "project": {                  // obligatorio. Metadatos del dominio.
    "name": "tienda",           //   obligatorio. Identificador del proyecto.
    "description": "…"          //   opcional.
  },
  "entities": [ /* Entity */ ]  // obligatorio. Al menos una entidad (AC-1).
}
```

| Clave | Obligatorio | Tipo | Notas |
|---|---|---|---|
| `fdlVersion` | sí | string | Debe ser una versión soportada. En v0: `"0"`. |
| `project` | sí | objeto | Metadatos del dominio. No describe topología de repos (eso es ADR-0010, ajeno a FDL). |
| `project.name` | sí | string | Nombre del proyecto; identificador legible. |
| `project.description` | no | string | Descripción libre. |
| `entities` | sí | Entity[] | Lista de entidades del dominio; al menos una. |

`project` es **metadata de dominio**, no de infraestructura: FDL no conoce
targets, topologías, motores de DB ni runtime. Esos los aporta el contrato del
adapter (SPEC-0006) y las topologías (ADR-0010), fuera de FDL.

### 7.2 Entidad (`Entity`)

```jsonc
{
  "name": "Producto",          // obligatorio. PascalCase, identificador válido.
  "description": "…",          // opcional.
  "fields": [ /* Field */ ],   // obligatorio. Al menos un campo.
  "relations": [ /* Relation */ ] // opcional.
}
```

| Clave | Obligatorio | Tipo | Notas |
|---|---|---|---|
| `name` | sí | string | PascalCase, identificador válido (ver §8, VR-1). Único en el documento. |
| `description` | no | string | Descripción libre de la entidad. |
| `fields` | sí | Field[] | Al menos un campo. |
| `relations` | no | Relation[] | Relaciones salientes declaradas en esta entidad. |

**Identificador de entidad.** En v0 cada entidad tiene un **identificador
único implícito** llamado `id`, cuyo tipo concreto lo decide el adapter/ORM del
target (p. ej. autoincremental o UUID según convención del target y del motor
de DB elegido — ADR-0004). FDL no obliga a declararlo. Un documento puede
redefinir el identificador marcando un campo con `primaryKey: true` (§7.3), en
cuyo caso ese campo reemplaza al `id` implícito. Claves primarias compuestas
quedan fuera de v0 (§5).

### 7.3 Campo (`Field`)

```jsonc
{
  "name": "precio",            // obligatorio. camelCase, identificador válido.
  "type": "decimal",           // obligatorio. Uno de los tipos de §7.4.
  "nullable": false,           // opcional. Default: false.
  "unique": false,             // opcional. Default: false.
  "primaryKey": false,         // opcional. Default: false. Reemplaza al id implícito.
  "default": 0,                // opcional. Valor por defecto; compatible con type.
  "precision": 10,             // opcional. Solo type "decimal".
  "scale": 2,                  // opcional. Solo type "decimal".
  "maxLength": 255,            // opcional. Solo type "string".
  "values": ["a", "b"]         // obligatorio si type "enum"; prohibido en otros.
}
```

| Modificador | Aplica a | Default | Notas |
|---|---|---|---|
| `nullable` | todos | `false` | Si `true`, el campo admite ausencia de valor. |
| `unique` | todos | `false` | Restricción de unicidad a nivel entidad. |
| `primaryKey` | todos | `false` | Marca el campo como identificador de la entidad. A lo sumo uno por entidad. |
| `default` | todos | — | Valor por defecto; su tipo debe ser compatible con `type` (VR-9). |
| `maxLength` | `string` | — | Longitud máxima. |
| `precision`, `scale` | `decimal` | — | Dígitos totales y decimales. |
| `values` | `enum` | — | Lista no vacía de valores admitidos, únicos. |

Un modificador específico de tipo usado sobre un `type` que no lo admite es
inválido (VR-3).

### 7.4 Tipos de campo (agnósticos de framework)

FDL v0 define un **conjunto base de tipos escalares abstractos**, neutrales
respecto de framework y de motor de DB (ADR-0004, Opción A como base de la
Opción B elegida). Cada adapter traduce estos tipos al tipo de columna/atributo
idiomático de su ORM.

| Tipo FDL | Descripción | Modificadores propios |
|---|---|---|
| `string` | Texto corto de una línea | `maxLength` |
| `text` | Texto largo multilínea | — |
| `integer` | Entero | — |
| `bigInteger` | Entero de rango amplio | — |
| `decimal` | Número de punto fijo (montos) | `precision`, `scale` |
| `float` | Número de punto flotante | — |
| `boolean` | Verdadero/falso | — |
| `date` | Fecha sin hora | — |
| `time` | Hora sin fecha | — |
| `datetime` | Fecha y hora | — |
| `uuid` | Identificador universal | — |
| `json` | Estructura JSON embebida | — |
| `enum` | Valor de un conjunto cerrado | `values` (obligatorio) |

**Punto de extensión (diferido).** ADR-0004 (Opción B) admite, de forma
opcional, anotaciones de tipo específicas del motor de DB elegido cuando el
mínimo común denominador no alcanza (p. ej. `jsonb` en Postgres). FDL v0 **no**
define esas anotaciones todavía; deja registrado que la forma de expresarlas
(p. ej. un objeto de anotaciones por campo) se especificará con un caso real,
sin romper el conjunto base. Hasta entonces, el camino agnóstico de arriba es
el único soportado.

### 7.5 Relaciones (`Relation`)

Las relaciones se declaran en el array `relations` de la entidad **origen**.

```jsonc
{
  "name": "pedidos",           // obligatorio. camelCase, identificador válido.
  "kind": "one-to-many",       // obligatorio. Una de las 3 cardinalidades.
  "target": "Pedido",          // obligatorio. Nombre de una entidad del documento.
  "inverse": "producto",       // opcional. Nombre de la relación inversa en target.
  "nullable": false            // opcional. Default: false. Aplica a "many-to-one".
}
```

| Clave | Obligatorio | Tipo | Notas |
|---|---|---|---|
| `name` | sí | string | camelCase, identificador válido; único entre relaciones y campos de la entidad (VR-6). |
| `kind` | sí | enum | `one-to-many` \| `many-to-one` \| `many-to-many` (VR-8). |
| `target` | sí | string | Debe referenciar una entidad existente del documento (VR-5). |
| `inverse` | no | string | Nombre de la relación recíproca en `target`, si se modela de los dos lados. |
| `nullable` | no | boolean | Para `many-to-one`: si la referencia puede faltar. Default `false`. |

**Cómo se expresan las cardinalidades (v0):**

- **`one-to-many`**: la entidad origen posee muchas instancias de `target`. Su
  recíproco idiomático es un `many-to-one` declarado en `target`. Modelar ambos
  lados es opcional; con `inverse` se enlazan explícitamente.
- **`many-to-one`**: la entidad origen referencia a una instancia de `target`.
  Es el lado que materializa la referencia (el adapter decide cómo —p. ej. una
  clave foránea—; FDL no nombra columnas de clave foránea).
- **`many-to-many`**: ambas entidades se asocian con cardinalidad muchos a
  muchos. Se declara en una de las dos (o en ambas, enlazadas con `inverse`). La
  tabla/mecanismo intermedio lo materializa el adapter; FDL no lo nombra en v0.

FDL describe **qué** relación existe, no **cómo** se implementa (claves
foráneas, tablas pivote, convenciones de nombre): eso es responsabilidad
idiomática de cada adapter (Artículo III).

### 7.6 Ejemplos

**Ejemplo mínimo** (un `project`, una entidad, un campo):

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

**Ejemplo relacional** (dos entidades, campos con modificadores y una relación
bidireccional):

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

## 8. Reglas de validación (requisitos para SPEC-0005)

Estas reglas definen qué hace **válido** a un documento FDL. Son **requisitos**
del lenguaje; **SPEC-0005** (parser y validador) las implementa y produce los
diagnósticos. Este spec no implementa validación.

| ID | Regla |
|---|---|
| **VR-1** | **Nombres de entidad.** Únicos en el documento, no vacíos, identificador válido (empieza con letra; solo letras, dígitos y `_`). Se recomienda PascalCase. |
| **VR-2** | **Nombres de campo.** Únicos dentro de su entidad, identificador válido. No colisionan con el identificador implícito `id` salvo que ese campo sea el `primaryKey`. |
| **VR-3** | **Tipo y modificadores.** `type` debe ser uno de los tipos de §7.4. Un modificador específico de tipo (`maxLength`, `precision`, `scale`, `values`) solo es válido sobre su tipo. |
| **VR-4** | **Enum.** Un campo `enum` declara `values` no vacío y sin duplicados; ningún otro tipo declara `values`. |
| **VR-5** | **Integridad referencial.** El `target` de toda relación referencia una entidad existente del mismo documento. |
| **VR-6** | **Nombres de relación.** Únicos dentro de su entidad y sin colisionar con nombres de campo de esa entidad. |
| **VR-7** | **Versión.** `fdlVersion` es una versión soportada (en v0: `"0"`). |
| **VR-8** | **Cardinalidad.** `kind` de toda relación es una de las tres soportadas. |
| **VR-9** | **Default compatible.** El valor de `default` es compatible con el `type` del campo (p. ej. un `default` numérico para `decimal`; un valor de `values` para `enum`). |
| **VR-10** | **Agnosticismo.** El documento no contiene vocabulario de framework ni de ORM; el lenguaje es agnóstico por construcción (Artículo II). |
| **VR-11** | **Clave primaria única.** A lo sumo un campo por entidad con `primaryKey: true`. |
| **VR-12** | **Inverso coherente.** Si una relación declara `inverse`, el nombre referenciado debe existir como relación en la entidad `target` (cuando el lado recíproco se modela explícitamente). |

### Dónde retoma SPEC-0005

SPEC-0005 toma un documento JSON con el shape de la §7, lo parsea a una
**representación interna (IR) tipada** y aplica VR-1..VR-12 produciendo
**diagnósticos legibles** (qué regla se violó, en qué entidad/campo/relación).
El contrato del adapter (SPEC-0006) ya está preparado para recibir esa IR
serializada a JSON a través del bridge (SPEC-0002). La generación de código a
partir de la IR es SPEC-0007 en adelante.

---

## 9. Consideraciones técnicas

**Agnosticismo (Artículo II).** FDL vive en `packages/core`. Ni el lenguaje ni
su representación mencionan framework ni ORM alguno. El lint de acoplamiento se
aplica al código del core; el conjunto de tipos de §7.4 es abstracto a
propósito.

**Serializabilidad (SPEC-0002, ADR-0003).** Un documento FDL es JSON puro, por
lo que cruza el puente Node → toolchain sin conversión: lo mismo que el usuario
escribe es lo que recibe el adapter.

**Compatibilidad / versionado.** `fdlVersion` existe desde v0 para permitir
evolucionar el shape sin ambigüedad. v0 no define todavía la estrategia formal
de ruptura de compatibilidad; se revisita cuando aparezca una necesidad real de
romperla (mismo criterio que SPEC-0006 §7).

**Legibilidad para edición manual.** Consecuencia asumida de ADR-0003: JSON no
tiene comentarios. Si documentar entidades complejas lo exige, se evaluará una
convención `_comment`; no se decide en este spec.

---

## 10. Descomposición en tickets (propuesta para Linear)

> **Nota:** esto es una **propuesta**. Esta sesión no tiene acceso de escritura
> a Linear; el PM/Claude debe cargar estos tickets como `FRA-NN`, declarar las
> dependencias como relación real (`blockedBy`, ver AGENT_PLAYBOOK) y moverlos a
> **Ready for AI** solo cuando corresponda. Los tickets se derivan directamente
> de los criterios de aceptación del §4 y de las reglas del §8; no agregan
> alcance más allá de este spec y de SPEC-0005. **T1** y **T6** son alcance de
> **SPEC-0004** (el lenguaje y su documentación de usuario); **T2–T5** son
> alcance de **SPEC-0005** (parser y validador) y se listan acá para dar
> continuidad y trazabilidad de la cadena FDL — se arrastran a SPEC-0005 cuando
> ese spec se apruebe. El orden refleja las dependencias: T1 es la base de las
> demás.

### T1 — Tipos / representación JSON de FDL v0 en `packages/core` (base)

- **Context:** SPEC-0004 define FDL como documento JSON con el shape de la §7.
  Hoy no existe en `packages/core` una representación tipada de ese shape. Es la
  base de toda la cadena FDL (parser, validador, generación). Alcance SPEC-0004.
- **Objective:** Exportar desde `packages/core` los tipos TypeScript del
  documento FDL v0: documento (`fdlVersion`, `project`, `entities`), entidad,
  campo (con sus modificadores) y relación, más el enum de tipos de campo
  (§7.4) y de cardinalidades (§7.5).
- **Technical Context:** Los tipos viven en `packages/core` y son agnósticos de
  framework (Artículo II, ADR-0002). El documento es JSON puro y serializable,
  coherente con el transporte del bridge (SPEC-0002) y con el contrato del
  adapter (SPEC-0006). `fdlVersion` queda modelado desde el día uno (§9).
- **Implementation Notes:** Cubrir el shape completo de la §7 (obligatorios vs
  opcionales, modificadores por tipo, `primaryKey`, `values` de enum). No
  implementar validación semántica acá (eso es T3). No incluir anotaciones
  específicas de motor (diferidas, §5/§7.4).
- **Acceptance Criteria:** AC-2, AC-3, AC-4, AC-5, AC-7, AC-9 a nivel de tipos;
  soporte de tipos para el resto de la cadena.
- **Tests:** Tests de tipos / compilación: un documento FDL válido compila; uno
  con campos obligatorios faltantes o un modificador sobre el tipo equivocado
  no compila. Test de lint de acoplamiento confirmando que los tipos no
  mencionan ningún framework (VR-10).
- **Documentation:** Documentar el shape del documento en el paquete (insumo de
  T6 y de SPEC-0005).
- **Dependencies:** ADR-0003 (Aceptado), ADR-0002 (Aceptado), SPEC-0004 (este
  spec, una vez Aprobado). Sin bloqueos de otros tickets — es la base.
- **Definition of Done:** Tipos exportados desde `packages/core`, tests en
  verde, lint de acoplamiento limpio.

### T2 — Parser JSON → IR tipada de FDL

- **Context:** SPEC-0005 necesita convertir un documento JSON FDL en una
  representación interna (IR) tipada sobre la que operar. Alcance SPEC-0005.
- **Objective:** Implementar en `packages/core` el parseo de un documento JSON
  FDL a la IR tipada de T1 (`JSON.parse` + mapeo a los tipos, sin parser propio
  — ADR-0003), reportando errores de forma de documento (JSON inválido, claves
  obligatorias ausentes, tipos de valor incorrectos).
- **Technical Context:** Sin gramática ni lexer propios (ADR-0003). Agnóstico de
  framework (Artículo II). La IR es la entrada de la validación semántica (T3) y
  de la generación (SPEC-0007+).
- **Implementation Notes:** Separar errores de **forma** (este ticket) de
  errores **semánticos** (T3). Aplicar defaults de modificadores (§7.3) al
  construir la IR.
- **Acceptance Criteria:** Un documento JSON con el shape de §7 produce una IR
  tipada; un documento mal formado produce un error de forma claro.
- **Tests:** Casos de documento bien formado, JSON inválido, claves
  obligatorias faltantes, tipos de valor incorrectos.
- **Documentation:** Documentar la superficie del parser en el paquete.
- **Dependencies:** **Bloqueado por T1.** ADR-0003 (Aceptado), SPEC-0005 (una
  vez aprobado).
- **Definition of Done:** Parser implementado y exportado, tests en verde, lint
  de acoplamiento limpio.

### T3 — Validador semántico de FDL (VR-1..VR-12)

- **Context:** El §8 de SPEC-0004 enuncia las reglas de validación como
  requisitos; SPEC-0005 las implementa. Alcance SPEC-0005.
- **Objective:** Implementar sobre la IR (T2) la validación semántica que
  verifica VR-1..VR-12 (nombres, unicidad, compatibilidad tipo/modificador,
  enum, integridad referencial, cardinalidad, versión, default compatible,
  clave primaria única, inverso coherente, agnosticismo).
- **Technical Context:** Agnóstico de framework (Artículo II). Opera sobre la IR
  tipada, no sobre el JSON crudo. Cada violación se asocia a su regla (VR-NN).
- **Implementation Notes:** Una comprobación por regla, nombrada por su VR, para
  trazabilidad directa con §8. No mezclar con la emisión de diagnósticos
  legibles (formato), que es T4.
- **Acceptance Criteria:** Cada regla VR-1..VR-12 detecta su violación y acepta
  los documentos válidos; cubre AC-6 de SPEC-0004.
- **Tests:** Un caso positivo y uno negativo por regla (VR-1..VR-12), incluyendo
  los ejemplos de §7.6 como casos válidos.
- **Documentation:** Mapear cada comprobación a su VR en la doc del paquete.
- **Dependencies:** **Bloqueado por T2.** SPEC-0005.
- **Definition of Done:** Validador implementado, un test por regla en verde,
  lint de acoplamiento limpio.

### T4 — Diagnósticos y errores legibles de FDL

- **Context:** Las violaciones detectadas por el validador (T3) y los errores de
  forma (T2) deben comunicarse de forma legible al usuario que escribe FDL.
  Alcance SPEC-0005.
- **Objective:** Implementar la capa de diagnósticos: mensajes claros que
  indiquen qué regla se violó y dónde (entidad / campo / relación), sin
  stacktrace crudo (coherente con SPEC-0002 AC-3).
- **Technical Context:** Agnóstico de framework. Consume los resultados de T2/T3
  y los formatea. No decide reglas nuevas.
- **Implementation Notes:** Localizar cada diagnóstico (ruta dentro del
  documento: entidad/campo/relación). Mensajes accionables ("la relación
  `pedidos` de `Producto` referencia la entidad inexistente `Pedidoo`").
- **Acceptance Criteria:** Cada error de forma y cada violación de regla produce
  un mensaje legible y localizado.
- **Tests:** Snapshots/aserciones de los mensajes para casos representativos de
  T2 y T3.
- **Documentation:** Documentar el formato de diagnóstico.
- **Dependencies:** **Bloqueado por T2** (y usa T3). SPEC-0005.
- **Definition of Done:** Diagnósticos implementados, tests en verde, lint de
  acoplamiento limpio.

### T5 — Tests y snapshots de FDL (fixtures del lenguaje)

- **Context:** La cadena FDL (parser + validador + diagnósticos) necesita un
  banco de documentos FDL de ejemplo (válidos e inválidos) como fixtures
  estables. Alcance SPEC-0005.
- **Objective:** Crear fixtures JSON de FDL —incluyendo los ejemplos de §7.6— y
  tests/snapshots que ejerciten parser, validador y diagnósticos de punta a
  punta sobre esas fixtures.
- **Technical Context:** Agnóstico de framework. Los snapshots cubren tanto la
  IR resultante como los diagnósticos de los casos inválidos.
- **Implementation Notes:** Fixtures mínimas y relacionales; un caso inválido
  por regla (reutilizando los de T3) consolidado como suite de snapshots.
- **Acceptance Criteria:** La suite cubre los ejemplos del spec y al menos un
  inválido por regla; los snapshots quedan versionados.
- **Tests:** Es el ticket de tests; su entregable son las suites y snapshots.
- **Documentation:** Breve README de las fixtures.
- **Dependencies:** **Bloqueado por T2 y T3.** SPEC-0005.
- **Definition of Done:** Fixtures y snapshots en verde, lint de acoplamiento
  limpio.

### T6 — Documentación de usuario de FDL

- **Context:** El usuario escribe FDL a mano (JSON). Necesita una guía de
  usuario que explique el lenguaje v0 con ejemplos. Alcance SPEC-0004.
- **Objective:** Escribir `docs/guides/fdl.md` (o equivalente) que describa el
  shape del documento, los tipos de campo, las relaciones y las reglas, con los
  ejemplos de §7.6 y una explicación en lenguaje de negocio (Artículo XI).
- **Technical Context:** Documentación, no código. Consistente con SPEC-0004 y
  con la representación de T1. Agnóstica de framework.
- **Implementation Notes:** Partir de §7 y §8 de este spec; mantener los
  ejemplos sincronizados con las fixtures de T5 cuando existan.
- **Acceptance Criteria:** Un usuario puede escribir un documento FDL válido
  siguiendo la guía sin leer el spec.
- **Tests:** N/A (doc). Verificar que los ejemplos de la guía son JSON válido.
- **Documentation:** Es el ticket de documentación.
- **Dependencies:** **Bloqueado por T1** (refleja la representación real).
  SPEC-0004.
- **Definition of Done:** Guía publicada en `docs/guides/`, ejemplos válidos,
  enlazada desde donde corresponda.

---

## 11. Cierre documental (FRA-63)

> Agregado en el cierre documental del módulo FDL (FRA-63). Esta sección deja
> registrada la evidencia de los criterios de aceptación del §4 y la disposición
> de SPEC-0005. No cambia el alcance del lenguaje. SPEC-0004 quedó marcado como
> **Implementado** el 2026-10-12 por decisión de Diego (FRA-63).

### 11.1 Evidencia de criterios de aceptación

Los criterios del §4 quedan cubiertos por la cadena FDL (FRA-56 … FRA-61),
mergeada en M2. El estado por tarea vive en `docs/progress.json` (SPEC-0004,
T1..T6, todas `completado`).

| AC | Dónde se especifica | Evidencia (ticket · PR) |
|---|---|---|
| **AC-1** FDL es un documento JSON | §7.1, §7.6 | Tipos del documento en `packages/core` (FRA-56 · #67); guía de usuario `docs/guides/fdl.md` (FRA-61 · #72) |
| **AC-2** Shape de nivel superior | §7.1 | Tipos `fdlVersion`/`project`/`entities` en core (FRA-56 · #67); parser que los exige (FRA-57 · #68) |
| **AC-3** Entidad y campo | §7.2, §7.3 | Tipos de entidad/campo/modificadores en core (FRA-56 · #67); parser con defaults de §7.3 (FRA-57 · #68) |
| **AC-4** Catálogo de tipos agnósticos | §7.4 | Enum de tipos en core (FRA-56 · #67); VR-3/VR-4 en el validador (FRA-58 · #69) |
| **AC-5** Relaciones | §7.5 | Tipos de relación/cardinalidad en core (FRA-56 · #67); VR-5/VR-8/VR-12 en el validador (FRA-58 · #69) |
| **AC-6** Reglas de validación como requisitos | §8 (VR-1..VR-12) | Validador semántico VR-1..VR-12 (FRA-58 · #69) y diagnósticos legibles (FRA-59 · #70) implementan las reglas; un test positivo y uno negativo por regla |
| **AC-7** Agnosticismo de framework | §7.4, §9 | VR-10 en el validador (FRA-58 · #69); `pnpm lint:coupling` limpio sobre el core en toda la cadena |
| **AC-8** Ejemplos JSON concretos | §7.6 | Fixtures válidas e inválidas, incluidos los ejemplos de §7.6 (FRA-60 · #71); ejemplos de la guía (FRA-61 · #72) |
| **AC-9** Versionado desde el día uno | §7.1, §8 (VR-7) | `fdlVersion` en los tipos (FRA-56 · #67); VR-7 en el validador (FRA-58 · #69) |

> Nota: T2–T5 (parser, validador, diagnósticos, fixtures) son el alcance que el
> §10 atribuía a SPEC-0005; se ejecutaron bajo el módulo FDL de SPEC-0004 (ver
> §11.2).

### 11.2 Disposición de SPEC-0005

SPEC-0005 (parser y validador de FDL) **no se redactó como spec independiente**:
su alcance quedó **absorbido en SPEC-0004**. La descomposición del §10 ya listaba
sus tareas (T2 parser, T3 validador VR-1..VR-12, T4 diagnósticos, T5 fixtures)
dentro de la cadena FDL, y se implementaron bajo el módulo FDL —FRA-57 (#68),
FRA-58 (#69), FRA-59 (#70) y FRA-60 (#71)—, trazadas en `docs/progress.json` bajo
`SPEC-0004`. La nota del §10 anticipaba "arrastrar T2–T5 a SPEC-0005 cuando ese
spec se apruebe"; en la práctica ese spec no se abrió y las tareas se cerraron
aquí. La disposición queda registrada también en
`docs/specs/0005-parser-y-validador-de-fdl.md`.
