# @fractal/core

CLI, FDL (Fractal Definition Language), y orquestación del generador.

## Principios

- **Agnóstico de framework** (Artículo II de CONSTITUTION.md)
- No contiene referencias a Laravel, Rails, ni ningún framework específico
- Todo conocimiento de framework vive en `packages/adapter-*`

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

## Scripts

```bash
# Compilar TypeScript
pnpm build

# Ejecutar tests
pnpm test

# Tests en modo watch
pnpm test:watch
```

## Estado

M1 — Implementado parcialmente. 

Bridge invocation base y timeout/lock completados (FRA-24).
FDL y CLI pendientes.
