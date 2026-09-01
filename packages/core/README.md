# @fractal/core

Core de Fractal: CLI, FDL, orquestación. Agnóstico de framework (Artículo II).

## Instalación

```bash
pnpm install @fractal/core
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

## Tests

```bash
pnpm test
```

Los tests incluyen:

- ✅ Happy path: invocación exitosa
- ✅ Adapter reporta error (success: false)
- ✅ Adapter termina con exit code != 0
- ✅ Adapter devuelve JSON inválido
- ✅ Adapter no devuelve nada
- ✅ Adapter devuelve JSON sin campo success
- ✅ Comando no existe
- ✅ Payload no serializable
- ✅ Timeout

## Referencias

- [SPEC-0002: Bridge Node → toolchain del target](../../docs/specs/0002-bridge-node-toolchain.md)
- [ADR-0001: CLI en Node.js con invocación de la toolchain del target](../../docs/adr/0001-cli-hibrido-node-toolchain.md)
- [CONSTITUTION.md - Artículo II](../../docs/CONSTITUTION.md)
