# Contrato del Bridge v0

Este documento describe el contrato del **bridge**: el mecanismo con el que el
core (Node.js) invoca la toolchain de cualquier target sin conocerla, delegando
ese conocimiento al adapter. Está pensado para que **un desarrollador de un
adapter nuevo** pueda implementarlo sin necesitar preguntar: forma del payload
de entrada, forma de la respuesta y códigos de error esperados.

**Versión:** 0
**Spec:** [SPEC-0002](../../../docs/specs/0002-bridge-node-toolchain.md)
**Estado:** Aprobado

> Fuente de verdad: el invocador vive en
> `packages/core/src/adapter-bridge.ts` y los tipos del envelope se exportan
> desde `@fractal/core`. El entry-point del adapter de referencia vive en
> `packages/adapter-*/src/bridge-entry.ts`. Este documento refleja el código en
> `master`; si algo diverge, **el código manda**.

---

## 1. Modelo de invocación

El core invoca al adapter como un **proceso hijo**. Una invocación es un único
intercambio:

1. El core hace `spawn` del comando del adapter (un array
   `command: string[]`, p.ej. `['node', 'dist/bridge-entry.js']`).
2. El core **escribe un payload JSON por `stdin`** y cierra `stdin`.
3. El adapter procesa el payload y **escribe una respuesta JSON por `stdout`**.
4. El adapter termina con **exit code 0** si pudo procesar el comando (aunque
   reporte `success: false` por un error de validación o de negocio), o con
   exit code distinto de 0 si el proceso falló.

El transporte es **stdin/stdout**, no archivos temporales ni argumentos de línea
de comando ad-hoc (SPEC-0002 AC-2). El payload es siempre serializable en JSON,
consistente con ADR-0003.

La función pública del core es `invokeAdapter(command, payload, options?)`, que
devuelve un `AdapterResult` (ver §3). No necesitás llamarla para escribir un
adapter —la llama el core—, pero define exactamente qué se te envía y qué se
espera de vos.

---

## 2. Forma del payload de entrada

El core serializa el `payload` que recibe y lo envía por `stdin`. El adapter de
referencia espera un **objeto JSON con un campo `action` de tipo string** que
selecciona la operación; los demás campos dependen de la acción.

```json
{ "action": "<nombre-de-la-accion>", "...": "campos según la acción" }
```

Si el payload no es un objeto con un `action` string, el adapter de referencia
responde con error `step: "validación"` (ver §4).

### Acciones del adapter de referencia

Estas son las acciones que implementa el adapter de referencia hoy. Un adapter
nuevo debería implementar, como mínimo, las mismas para ser intercambiable. La
semántica de los comandos y los tipos de sus payloads pertenecen al **contrato
del adapter** (SPEC-0006, ver [`adapter-contract-v0.md`](./adapter-contract-v0.md)).

| `action` | Campos de entrada | Qué devuelve en `data` |
|---|---|---|
| `get-contract` | `target?` (`"backend-full"` \| `"frontend-static"`; opcional, default `backend-full`) | El `AdapterContract` del target pedido |
| `create-project` | `name` (string, requerido), `topology` (string, requerido), `destinationPath` (string, requerido), `target` (string, requerido), `contractVersion?` (`"0"`) | `CreateProjectData` (`{ projectPath, message? }`) |

Para `get-contract`, un `target` presente que no sea `"backend-full"` ni
`"frontend-static"` produce un error `step: "validación"`. Para
`create-project`, cada campo requerido ausente o de tipo incorrecto produce un
error `step: "validación"`.

Ejemplos de payload:

```json
{ "action": "get-contract" }
```

```json
{ "action": "get-contract", "target": "frontend-static" }
```

```json
{
  "action": "create-project",
  "name": "mi-proyecto",
  "topology": "monolith",
  "destinationPath": "/home/user/mi-proyecto",
  "target": "default"
}
```

---

## 3. Forma de la respuesta (envelope del bridge)

El adapter debe escribir por `stdout` un **único objeto JSON** con el envelope
del bridge, una unión discriminada por el campo booleano `success`:

```typescript
// Lo que el adapter devuelve
type BridgeResponse =
  | { success: true; data: unknown }
  | { success: false; error: { message: string; step?: string } };
```

Del lado del core, `invokeAdapter` devuelve un `AdapterResult` con la misma
forma, más un `exitCode` opcional que el **core** agrega cuando el fallo viene
del proceso (exit distinto de 0 o timeout); el adapter no necesita incluir
`exitCode`:

```typescript
// Lo que invokeAdapter devuelve al core (exportado desde @fractal/core)
type AdapterResult =
  | { success: true; data: unknown }
  | { success: false; error: { message: string; step?: string; exitCode?: number } };
```

Reglas:

- **Éxito:** `{ success: true, data: <datos específicos del comando> }`. El
  shape de `data` depende de la acción (p.ej. `CreateProjectData` para
  `create-project`).
- **Error:** `{ success: false, error: { message, step? } }`. `message` debe ser
  legible para una persona (ver §4). `step` es opcional pero recomendado.
- La respuesta debe ser un objeto JSON válido con un campo `success` booleano.
  Si no lo es, el core lo trata como error (ver §4).
- El adapter termina con **exit code 0** cuando pudo procesar el comando,
  incluso si devuelve `success: false`. Un exit distinto de 0 se interpreta como
  fallo del proceso, no como un `success: false` de negocio.

**Ejemplo de respuesta exitosa:**

```json
{
  "success": true,
  "data": {
    "projectPath": "/home/user/mi-proyecto",
    "message": "Proyecto generado exitosamente"
  }
}
```

**Ejemplo de respuesta de error:**

```json
{
  "success": false,
  "error": {
    "message": "El directorio /home/user/mi-proyecto no está vacío",
    "step": "validación"
  }
}
```

---

## 4. Códigos de error esperados

El bridge propaga errores **legibles**: el `message` describe qué falló y en qué
paso, **sin exponer un stacktrace crudo** del proceso hijo (SPEC-0002 AC-3). El
campo `step` identifica la etapa; no es un enum cerrado, pero el core usa un
vocabulario fijo que los adapters deberían reutilizar por consistencia.

`step` producidos por el core (`invokeAdapter`):

| `step` | Cuándo lo produce el core |
|---|---|
| `validación` | El comando está vacío, o la respuesta del adapter no es un objeto, o le falta el campo booleano `success` |
| `serialización` | El payload de entrada no se pudo serializar a JSON |
| `ejecución` | No se pudo lanzar el proceso (p.ej. binario inexistente), o el proceso terminó con exit code distinto de 0 |
| `timeout` | El proceso no respondió dentro del tiempo máximo y fue terminado (ver §5) |
| `lectura` | El proceso terminó con éxito pero no escribió nada por `stdout` |
| `parseo` | El `stdout` del adapter no es JSON válido |
| `adapter` | El adapter reportó `success: false` pero sin un `message` utilizable |

`step` producidos por el adapter de referencia al validar el payload:
`lectura` (no llegó payload por `stdin`), `parseo` (JSON inválido), `validación`
(falta `action` o un campo requerido), `ejecución` (error interno inesperado).
Un adapter nuevo debería usar `step` descriptivos en el mismo espíritu (p.ej.
`validación`, `generación`).

Campo `exitCode`: cuando el fallo viene del proceso (exit distinto de 0 o
timeout), el core incluye `error.exitCode` con el código observado. Los adapters
no lo setean; comunican el estado por el exit code real del proceso y por el
envelope.

---

## 5. Timeout y concurrencia

**Timeout.** `invokeAdapter` aplica un timeout por defecto de **60000 ms
(60 segundos)**, configurable vía `options.timeout`. Al vencer, envía `SIGTERM`
al proceso hijo y, si no termina en 5 segundos, `SIGKILL`; devuelve un error
`step: "timeout"` y no deja procesos huérfanos (SPEC-0002 AC-5).

> Nota: existe además un helper independiente `withTimeout` /
> `DEFAULT_TIMEOUT_MS` en `packages/core/src/bridge/timeout.ts`, con un default
> propio de 5 minutos. **No** está cableado dentro de `invokeAdapter`; el default
> efectivo de una invocación del bridge es el de `invokeAdapter` (60 s).

**Concurrencia.** El mecanismo de lock de proyecto `.fractal.lock` (PID +
timestamp, con detección de lock huérfano) está implementado en
`packages/core/src/lock/lock-manager.ts` (`LockManager`, `withLock`) para
SPEC-0002 AC-7 y AC-8. No forma parte del envelope del bridge y no requiere nada
del adapter; se documenta aquí solo como referencia.

---

## 6. Cómo escribir el entry-point de un adapter

Un adapter es un ejecutable que el core lanza como proceso hijo. Su entry-point
debe:

1. **Leer** todo el `stdin` hasta `end`.
2. **Parsear** el JSON. Si falla, responder `{ success: false, error: { message, step: "parseo" } }` y salir con código 1.
3. **Despachar** según `payload.action`. Validar los campos requeridos de cada
   acción; si falta alguno, responder con `step: "validación"`.
4. **Ejecutar** la operación (invocando la toolchain del target según
   corresponda) y construir el envelope de éxito o error.
5. **Escribir** la respuesta JSON por `stdout` y salir con código `0` si
   `success: true`, `1` si `success: false`.

El entry-point del adapter de referencia en
`packages/adapter-*/src/bridge-entry.ts` implementa exactamente este flujo y
sirve de plantilla. Los tipos del envelope y de los payloads se importan desde
`@fractal/core`:

```typescript
import type { CreateProjectPayload } from '@fractal/core';

type BridgeResponse =
  | { success: true; data: unknown }
  | { success: false; error: { message: string; step?: string } };
```

El adapter no debe filtrar secrets del entorno del usuario en `message` ni en
los datos que devuelve (SPEC-0002 §7, Seguridad).

---

## 7. Referencias

- [SPEC-0002: Bridge Node → toolchain del target](../../../docs/specs/0002-bridge-node-toolchain.md)
- [SPEC-0006: Contrato del adapter v0](../../../docs/specs/0006-contrato-adapter-v0.md)
- [Contrato del Adapter v0](./adapter-contract-v0.md) — payloads y respuestas tipadas que viajan por el bridge
- [ADR-0001: CLI híbrido Node + toolchain del target](../../../docs/adr/0001-cli-hibrido-node-toolchain.md)
- [ADR-0003: Diseño de FDL (formato JSON)](../../../docs/adr/0003-diseno-fdl.md)
- [CONSTITUTION.md, Artículo II](../../../docs/CONSTITUTION.md) — el core no conoce ningún framework
