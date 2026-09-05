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

## Referencias

- [SPEC-0001: fractal new genera proyecto Laravel base](../../docs/specs/0001-fractal-new-laravel-base.md)
- [SPEC-0002: Bridge Node → toolchain del target](../../docs/specs/0002-bridge-node-toolchain.md)
- [ADR-0001: CLI en Node.js con invocación de la toolchain del target](../../docs/adr/0001-cli-hibrido-node-toolchain.md)
- [ADR-0010: Topología del proyecto generado](../../docs/adr/0010-topologia-proyecto-generado-sin-inertia.md)
- [CONSTITUTION.md - Artículo II](../../docs/CONSTITUTION.md)

## Estado

M1 — Bridge Node→toolchain (con timeout y lock de concurrencia) y comando `fractal new` (prompts, defaults, validación) implementados.
