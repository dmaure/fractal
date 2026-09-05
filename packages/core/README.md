# @fractal/core

CLI, FDL, y orquestación. Núcleo framework-agnostic de Fractal.

## Instalación

```bash
pnpm add @fractal/core
```

## Uso

### Verificación de binarios externos

Antes de invocar un adapter, verificar que el binario externo necesario esté
disponible:

```typescript
import { ensureBinaryAvailable } from '@fractal/core';

// Antes de invocar el adapter:
try {
  ensureBinaryAvailable('somebin', 'Instrucciones de instalación aquí');
  // Continuar con la invocación del adapter
} catch (error) {
  if (error instanceof BinaryNotAvailableError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
```

### API de bajo nivel

Si necesitas solo verificar sin lanzar excepción:

```typescript
import { checkBinaryAvailable } from '@fractal/core';

const result = checkBinaryAvailable('somebin');
if (!result.available) {
  console.log('Binario no disponible');
  console.log(result.error);
} else {
  console.log('Binario encontrado en:', result.path);
}
```

## Desarrollo

```bash
# Construir
pnpm build

# Tests
pnpm test

# Tests en modo watch
pnpm test:watch
```

## Arquitectura

Este paquete implementa:

- **Bridge:** Mecanismos para invocar adapters externos (SPEC-0002)
- **FDL:** Pendiente
- **Orquestación:** Pendiente

### Cumplimiento del Artículo II

Este paquete NUNCA contiene referencias a frameworks concretos. Términos
prohibidos: `laravel`, `artisan`, `eloquent`, `blade`, `composer`, `rails`,
`activerecord`, `gemfile`, `bundler`, `erb`.

Todo conocimiento específico de framework vive en `packages/adapter-*`.

## License

MIT
