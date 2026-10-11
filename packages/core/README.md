# @fractal/core

Core de Fractal: CLI, FDL, orquestación. Agnóstico de framework (Artículo II).

- **Agnóstico de framework** (Artículo II de CONSTITUTION.md)
- No contiene referencias a frameworks específicos
- Todo conocimiento de framework vive en `packages/adapter-*`

## Instalación

```bash
pnpm install @fractal/core
```

## Comandos

### `fractal new <project-name>`

Genera un nuevo proyecto Fractal.

**Opciones:**

- `-t, --topology <topology>`: Topología del proyecto (`monolith`, `monorepo`, `multirepo`). Default: `monolith`
- `-f, --force`: Fuerza la generación sobre un directorio no vacío

**Ejemplos:**

```bash
# Crear proyecto con topología por defecto (monolito)
fractal new mi-proyecto

# Crear proyecto con topología específica
fractal new mi-proyecto --topology=monorepo

# Forzar creación sobre directorio existente
fractal new mi-proyecto --force
```

### `fractal status`

Muestra el estado del proyecto según `docs/progress.json` (SPEC-0031).

Lee `docs/progress.json` del proyecto y muestra un resumen legible milestone por milestone, con conteo y porcentaje por estado.

**Estados válidos:**
- `completado`: milestone completado ✅
- `en_curso`: milestone en progreso 🟡
- `pendiente`: milestone no iniciado ⬜

**Estructura esperada de docs/progress.json:**

```json
{
  "proyecto": "Nombre del proyecto",
  "actualizado": "2026-09-28",
  "milestones": [
    {
      "id": "M0",
      "nombre": "Fundaciones",
      "entregable": "reglas, docs y CI base",
      "estado": "en_curso"
    },
    {
      "id": "M1",
      "nombre": "Esqueleto vertical",
      "entregable": "new + deploy = app online",
      "estado": "pendiente"
    }
  ],
  "capacidades": {
    "grupos": [
      {
        "id": "CAP",
        "titulo": "Capabilities (CLI · core)",
        "nodos": [
          { "id": "NEW", "label": "fractal new", "estado": "en_curso" },
          { "id": "DEP", "label": "fractal deploy", "estado": "pendiente" }
        ]
      }
    ],
    "nodos": [
      { "id": "FDL", "label": "FDL · entidades", "estado": "pendiente" }
    ],
    "aristas": [
      ["NEW", "FDL"],
      ["FDL", "DEP"]
    ]
  }
}
```

El bloque `capacidades` es opcional (solo se usa si tu proyecto tiene el Diagrama 2 de capacidades y módulos en el mapa).

**Ejemplo de salida:**

```
🗺️  Mapa de avance — Fractal
    Actualizado: 2026-09-28

✅ M0 — Fundaciones: reglas, docs y CI base
🟡 M1 — Esqueleto vertical: new + deploy = app online
⬜ M2 — FDL y entidades: CRUD generado y desplegable

✅ Completado: 1/3 (33%)
🟡 En curso: 1/3 (33%)
⬜ Pendiente: 1/3 (33%)
```

**Validación:**
- El comando falla con mensaje accionable si el archivo no existe, contiene JSON inválido, o la estructura no es válida
- Los estados deben ser exactamente uno de los tres valores válidos (`completado`, `en_curso`, `pendiente`)

#### Flags

##### `--write`: Regenerar los diagramas del mapa

Por defecto, `fractal status` solo imprime el resumen (modo lectura, no toca
archivos). Con `--write` (SPEC-0031 AC-3) además **regenera de forma
idempotente** los diagramas Mermaid de `docs/MAPA_DE_PROGRESO.md` desde
`docs/progress.json`:

- **Diagrama 1 — avance por milestone**, entre los marcadores
  `<!-- progress-map:auto:start -->` / `<!-- progress-map:auto:end -->`.
- **Diagrama 2 — capacidades y módulos** (solo si `docs/progress.json` incluye
  el bloque opcional `capacidades`), entre `<!-- progress-map:diagrama2:start -->`
  / `<!-- progress-map:diagrama2:end -->`.

```bash
# Solo imprime el resumen (no modifica archivos)
fractal status

# Imprime el resumen y regenera ambos diagramas del mapa
fractal status --write
```

Los nodos se colorean por `estado` y el texto escrito a mano fuera de los
marcadores se conserva. Correr `--write` dos veces no produce diff
(idempotente). Si el mapa o los marcadores esperados no existen, falla con un
mensaje claro en vez de corromper el documento (AC-5).

##### `--check`: Validar sincronía del mapa (para CI)

El modo `--check` (SPEC-0031 AC-4) regenera los diagramas **en memoria** y verifica que `docs/MAPA_DE_PROGRESO.md` esté sincronizado con `docs/progress.json`, sin escribir ningún archivo:

```bash
# Valida que el mapa esté sincronizado (CI)
fractal status --check
```

- **Exit code 0:** el mapa está sincronizado con `docs/progress.json`
- **Exit code != 0:** el mapa está desactualizado; muestra un mensaje accionable indicando cómo regenerarlo

Útil como guardia de CI para bloquear merges que dejarían el mapa desincronizado.

**Alias de conveniencia:**

Usa `pnpm status` desde la raíz del monorepo para ejecutar `fractal status` directamente (ver `package.json`). El dev-tool `pnpm progress` ejecuta `scripts/progress-map.js`, que usa el mismo núcleo compartido `@fractal/core/progress-map` para garantizar que `fractal status --write` y `pnpm progress` produzcan exactamente la misma salida.


## FDL parser

El parser de FDL convierte el texto de un documento FDL (JSON) en la
representación interna (IR) tipada de FDL v0 (los tipos `FdlDocument`,
`FdlEntity`, `FdlField`, `FdlRelation`, etc., definidos en
`src/types/fdl.ts`). No tiene gramática ni lexer propios (ADR-0003): hace
`JSON.parse` y mapea el valor resultante a `FdlDocument`.

### `parseFdl(source)`

```typescript
import { parseFdl, FdlParseError } from '@fractal/core';

try {
  const doc = parseFdl(source); // source: string (texto JSON del documento)
  // doc: FdlDocument tipado, con defaults de §7.3 aplicados
} catch (error) {
  if (error instanceof FdlParseError) {
    console.error(`[${error.code}] ${error.path}: ${error.message}`);
  }
}
```

- **Entrada:** `source: string`, el texto JSON de un documento FDL con el shape
  de SPEC-0004 §7.
- **Salida:** `FdlDocument`, la IR tipada del documento.
- **Claves desconocidas:** se ignoran; la IR producida solo contiene claves
  conocidas.

### Defaults aplicados (§7.3)

Al construir la IR, los modificadores ausentes se materializan en su valor por
defecto:

- `field.nullable` → `false`
- `field.unique` → `false`
- `field.primaryKey` → `false`
- `relation.nullable` → `false`

Los demás modificadores (`default`, `maxLength`, `precision`, `scale`,
`values`, `description`, `inverse`) no tienen default: si están ausentes, se
omiten de la IR.

### Errores (`FdlParseError`)

`parseFdl` lanza `FdlParseError` ante la primera violación encontrada
(fail-fast). El error expone:

- `code`: uno de `'INVALID_JSON' | 'MISSING_KEY' | 'INVALID_TYPE'`.
- `path`: ubicación localizada del error, con la raíz como `(root)`, claves
  anidadas unidas por `.` e índices de array entre corchetes
  (p. ej. `entities[0].fields[2].name`).

### Frontera forma / semántica

El parser detecta **solo errores de forma de documento**: JSON inválido, claves
obligatorias ausentes y tipos de valor JS incorrectos. **No** ejecuta
validación semántica (VR-1..VR-12), que es alcance de **FRA-58**: no comprueba
que `field.type` esté en el catálogo, que `relation.kind` sea una cardinalidad
válida, que `fdlVersion` sea un valor soportado, ni unicidad/validez de
nombres, integridad referencial o compatibilidad de tipo/modificador. Un
documento bien formado pero semánticamente inválido (p. ej. `type: "banana"`)
se parsea sin error y será rechazado por el validador.

## Validador semántico FDL (FRA-58)

El validador semántico aplica las reglas VR-1..VR-12 de SPEC-0004 §8 sobre la
IR tipada (la salida de `parseFdl`). Mientras el parser solo valida la *forma*
del documento, el validador verifica su *significado*: nombres, catálogos,
integridad referencial y compatibilidad de defaults.

### `validateFdl(doc)`

```typescript
import { parseFdl, validateFdl } from '@fractal/core';

const doc = parseFdl(source);
const result = validateFdl(doc); // FdlValidationResult

if (!result.valid) {
  for (const v of result.violations) {
    console.error(`[${v.rule}] ${v.path}: ${v.message}`);
  }
}
```

- **Entrada:** `doc: FdlDocument`, la IR tipada del documento.
- **Salida:** `FdlValidationResult = { valid: boolean; violations: FdlViolation[] }`.
  `valid` es `true` sii `violations.length === 0`.
- **`FdlViolation`:** `{ rule: FdlValidationRule; path: string; message: string }`,
  con `path` localizado al estilo del parser (p. ej. `entities[0].fields[1].name`).
- **No es fail-fast:** acumula todas las violaciones (una función de chequeo por
  regla, en orden VR-1..VR-12).

### Reglas (SPEC-0004 §8)

| Regla | Chequeo |
| ----- | ------- |
| VR-1  | Nombres de entidad: no vacíos, identificador válido y únicos en el documento. |
| VR-2  | Nombres de campo: identificador válido y únicos por entidad; `"id"` solo si `primaryKey: true`. |
| VR-3  | Tipo en el catálogo y modificadores solo en su tipo (`maxLength`→string, `precision`/`scale`→decimal, `values`→enum). |
| VR-4  | Un `enum` declara `values` no vacío y sin duplicados; un no-`enum` no declara `values`. |
| VR-5  | Integridad referencial: el `target` de cada relación nombra una entidad existente. |
| VR-6  | Nombres de relación únicos por entidad y sin colisión con nombres de campo. |
| VR-7  | `fdlVersion` soportado (`"0"`). |
| VR-8  | `kind` de relación dentro de las cardinalidades válidas. |
| VR-9  | `default` compatible con el `type` del campo (incluye membresía en `values` para `enum`). |
| VR-10 | Agnosticismo: identificadores estructurales sin vocabulario de framework/ORM (Artículo II). |
| VR-11 | A lo sumo un campo con `primaryKey: true` por entidad. |
| VR-12 | Si una relación declara `inverse`, la entidad `target` contiene una relación con ese nombre. |

El pulido de diagnósticos legibles (mensajes ricos, sugerencias) está diferido a
**T4/FRA-59**; aquí los mensajes son mínimos y estructurados.

## Uso del Bridge Node → Toolchain

El módulo `adapter-bridge` permite al core invocar la toolchain de cualquier target sin conocerla, delegando ese conocimiento exclusivamente al adapter correspondiente.

### Ejemplo básico

```typescript
import { invokeAdapter } from '@fractal/core';

const result = await invokeAdapter(
  ['php', 'adapter.php'],
  { action: 'create-project', name: 'mi-proyecto' }
);

if (result.success) {
  console.log('Éxito:', result.data);
} else {
  console.error('Error:', result.error.message);
}
```

### Opciones de invocación

```typescript
const result = await invokeAdapter(
  ['php', 'adapter.php'],
  payload,
  {
    timeout: 60000,        // Timeout en ms (default: 60000)
    cwd: '/path/to/work',  // Directorio de trabajo
    env: { VAR: 'value' }  // Variables de entorno adicionales
  }
);
```

## Contrato del Adapter

### Entrada (stdin)

El adapter recibe un payload JSON por stdin. El shape del payload depende de la acción específica, pero siempre es un objeto JSON serializable:

```json
{
  "action": "create-project",
  "name": "mi-proyecto",
  "config": {
    "database": "postgresql",
    "auth": true
  }
}
```

### Salida (stdout)

El adapter debe devolver un objeto JSON por stdout con **exactamente** esta forma:

#### Respuesta exitosa

```json
{
  "success": true,
  "data": {
    // Cualquier dato que el adapter quiera devolver
  }
}
```

#### Respuesta con error

```json
{
  "success": false,
  "error": {
    "message": "Mensaje de error legible para el usuario",
    "step": "nombre-del-paso-que-falló"
  }
}
```

### Exit code

- El adapter debe terminar con **exit code 0** si logró procesar la solicitud (independientemente de si `success` es `true` o `false`)
- Exit code != 0 se interpreta como error fatal (el adapter no pudo siquiera procesar la solicitud)

### Errores legibles

Cuando el adapter falla, el bridge traduce el error en un mensaje legible indicando:

- **Qué** falló
- **En qué paso** falló (serialización, ejecución, parseo, validación, timeout, adapter)
- **El exit code** si aplica

Ejemplos de errores que el bridge maneja:

- Comando no existe o no se puede ejecutar
- Payload no se puede serializar (ej: referencias circulares)
- Adapter no devuelve nada por stdout
- Adapter devuelve JSON inválido
- Adapter devuelve JSON válido pero sin el campo `success`
- Adapter no responde en el tiempo límite (timeout)
- Adapter termina con exit code != 0

## Implementar un adapter nuevo

Para implementar un adapter nuevo que respete este contrato:

1. **Lee el payload de stdin** completo antes de procesarlo
2. **Parsea el JSON** del payload
3. **Ejecuta la lógica** específica del target
4. **Devuelve la respuesta** por stdout en el formato especificado
5. **Usa exit code 0** para indicar que procesaste la solicitud (incluso si hubo error de validación)

### Ejemplo en Node.js

```javascript
#!/usr/bin/env node

let input = '';

process.stdin.on('data', (chunk) => {
  input += chunk.toString();
});

process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input);

    // Tu lógica aquí
    const result = processAction(payload);

    const response = {
      success: true,
      data: result
    };

    console.log(JSON.stringify(response));
    process.exit(0);
  } catch (error) {
    const response = {
      success: false,
      error: {
        message: error.message,
        step: 'ejecución'
      }
    };

    console.log(JSON.stringify(response));
    process.exit(0);
  }
});
```

### Ejemplo en PHP

```php
#!/usr/bin/env php
<?php

$input = stream_get_contents(STDIN);
$payload = json_decode($input, true);

try {
    // Tu lógica aquí
    $result = processAction($payload);

    $response = [
        'success' => true,
        'data' => $result
    ];

    echo json_encode($response);
    exit(0);
} catch (Exception $e) {
    $response = [
        'success' => false,
        'error' => [
            'message' => $e->getMessage(),
            'step' => 'ejecución'
        ]
    ];

    echo json_encode($response);
    exit(0);
}
```

## Módulos

### Lock Manager (`src/lock/lock-manager.ts`)

Gestiona el lock de concurrencia `.fractal.lock` para prevenir ejecuciones simultáneas de Fractal sobre el mismo proyecto.

**Implementa:** AC-7 y AC-8 de SPEC-0002

**Características:**
- Crea un lock con el PID del proceso actual
- Detecta locks huérfanos (PID inexistente) y los libera automáticamente
- Falla rápido si hay otro proceso de Fractal corriendo
- Helper `withLock()` para uso automático con try/finally

**Uso:**
```typescript
import { LockManager, withLock } from '@fractal/core';

// Uso manual
const lock = new LockManager('/ruta/al/proyecto');
try {
  lock.acquire();
  // ... tu código
} finally {
  lock.release();
}

// Uso con helper
await withLock('/ruta/al/proyecto', async () => {
  // ... tu código
});
```

### Timeout (`src/bridge/timeout.ts`)

Gestiona timeouts para invocaciones del bridge Node → toolchain, evitando procesos colgados.

**Implementa:** AC-5 de SPEC-0002

**Características:**
- Timeout por defecto de 5 minutos (configurable, nunca obligatorio)
- Mata el proceso hijo si excede el timeout (SIGTERM, luego SIGKILL)
- Evita procesos huérfanos
- Helper `createTimeoutWrapper()` para procesos hijo

**Uso:**
```typescript
import { withTimeout, createTimeoutWrapper } from '@fractal/core';

// Uso con función personalizada
const result = await withTimeout(
  () => ({
    promise: miOperacion(),
    childProcess: miProceso,
  }),
  { timeoutMs: 10000 } // Opcional, por defecto 5 minutos
);

// Uso simple con proceso hijo
const child = spawn('comando', ['args']);
await createTimeoutWrapper(child, { timeoutMs: 30000 });
```

### Verificación de binario externo (`src/bridge/binary-check.ts`)

Verifica que un binario externo requerido por un adapter (ej. Composer para Laravel) esté disponible en el PATH antes de invocarlo.

**Implementa:** AC-4 de SPEC-0002

**Características:**
- Detección multiplataforma (`which`/`where`)
- Mensaje claro de instalación cuando el binario falta
- Sin demora perceptible cuando el binario está presente

**Uso:**
```typescript
import { ensureBinaryAvailable, BinaryNotAvailableError } from '@fractal/core';

// Antes de invocar el adapter:
try {
  ensureBinaryAvailable('composer', 'Instalá Composer: https://getcomposer.org');
  // Continuar con la invocación del adapter
} catch (error) {
  if (error instanceof BinaryNotAvailableError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
```

API de bajo nivel, si solo necesitás verificar sin lanzar excepción:

```typescript
import { checkBinaryAvailable } from '@fractal/core';

const result = checkBinaryAvailable('composer');
if (!result.available) {
  console.log('Binario no disponible');
} else {
  console.log('Binario encontrado en:', result.path);
}
```

## Desarrollo

```bash
# Compilar
pnpm build

# Ejecutar tests una vez
pnpm test

# Ejecutar tests en modo watch
pnpm test:watch
```

Los tests incluyen:

- ✅ Bridge: happy path, error del adapter (`success: false`), exit code != 0, JSON inválido, sin salida, sin campo `success`, comando inexistente, payload no serializable, timeout
- ✅ `fractal new`: prompts, defaults, validación de directorio destino, topologías, `--force`
- ✅ Lock Manager: locks activos, huérfanos, corruptos
- ✅ Timeout: procesos rápidos, timeouts, kill signals, integración con procesos reales
- ✅ Verificación de binario: PATH mockeado (binario presente/ausente)

## Referencias

- [SPEC-0001: fractal new genera proyecto Laravel base](../../docs/specs/0001-fractal-new-laravel-base.md)
- [SPEC-0002: Bridge Node → toolchain del target](../../docs/specs/0002-bridge-node-toolchain.md)
- [ADR-0001: CLI en Node.js con invocación de la toolchain del target](../../docs/adr/0001-cli-hibrido-node-toolchain.md)
- [ADR-0010: Topología del proyecto generado](../../docs/adr/0010-topologia-proyecto-generado-sin-inertia.md)
- [CONSTITUTION.md - Artículo II](../../docs/CONSTITUTION.md)

## Estado

M1 — Bridge Node→toolchain (invocación, timeout, lock de concurrencia, verificación de binario externo) y comando `fractal new` (prompts, defaults, validación) implementados.
