# Contrato del Adapter v0

Este documento describe el contrato v0 que un adapter debe cumplir para que el core pueda invocarlo vía el bridge (SPEC-0002) y generar proyectos base.

**Versión:** 0  
**Spec:** [SPEC-0006](../../../docs/specs/0006-contrato-adapter-v0.md)  
**Estado:** Implementado

## Principios

1. **Agnóstico de framework** (Artículo II): Los tipos del contrato no mencionan ningún framework específico. Todo conocimiento de framework vive en `packages/adapter-*`.

2. **Serializable en JSON**: Todos los payloads y respuestas son serializables en JSON, consistente con el transporte stdin/stdout del bridge.

3. **Versionable**: Aunque v0 no formaliza una estrategia de migración, el contrato incluye ganchos para versionado futuro (`contractVersion`, `AdapterContractVersion`).

## Tipos principales

### CreateProjectPayload

Payload para el comando "crear proyecto base" (AC-1 de SPEC-0006).

```typescript
interface CreateProjectPayload {
  name: string;                            // Nombre del proyecto (requerido)
  topology: ProjectTopology;               // Topología: monolith | monorepo | multirepo (requerido)
  destinationPath: string;                 // Path absoluto donde generar el proyecto (requerido)
  contractVersion?: AdapterContractVersion; // Versión del contrato, opcional
}
```

**Campos obligatorios:**
- `name`: Nombre del proyecto a generar
- `topology`: Una de las topologías válidas (ver ADR-0010)
- `destinationPath`: Path absoluto donde crear el proyecto

**Campos opcionales:**
- `contractVersion`: Versión del contrato que usa el core. El adapter puede validar compatibilidad.

### CreateProjectResponse

Respuesta del comando "crear proyecto base".

```typescript
type CreateProjectResponse = CreateProjectSuccess | CreateProjectError;

interface CreateProjectSuccess {
  success: true;
  projectPath: string;    // Path absoluto del proyecto generado
  message?: string;       // Mensaje opcional para el usuario
}

interface CreateProjectError {
  success: false;
  error: string;          // Mensaje de error legible (sin stacktraces crudos)
  code?: string;          // Código de error opcional para clasificación
}
```

**Respuesta exitosa:**
- `success: true`
- `projectPath`: Path del proyecto generado (normalmente coincide con `destinationPath`)
- `message`: Mensaje opcional para mostrar al usuario

**Respuesta de error:**
- `success: false`
- `error`: Mensaje legible sin stacktraces (ver SPEC-0002 AC-3)
- `code`: Código de error opcional (e.g., `DIRECTORY_NOT_EMPTY`)

### RuntimeRequirements

Declaración de versiones mínimas de runtime (AC-2 de SPEC-0006).

```typescript
interface RuntimeRequirements {
  binaries: BinaryRequirement[];
}

interface BinaryRequirement {
  name: string;          // Nombre del binario en el PATH
  minVersion: string;    // Versión mínima en formato semver
  displayName?: string;  // Nombre legible para mensajes de error
}
```

**Ejemplo:**

```typescript
const requirements: RuntimeRequirements = {
  binaries: [
    { name: 'node', minVersion: '20.0.0' },
    { name: 'npm', minVersion: '10.0.0', displayName: 'npm (Node Package Manager)' },
  ],
};
```

### DeployRuntime

Declaración de runtime de deploy (AC-3 de SPEC-0006).

```typescript
interface DeployRuntime {
  services: ServiceName[];        // Lista de servicios (e.g., ["app", "nginx", "db"])
  buildCommand?: string;          // Comando de build (opcional)
  migrateCommand?: string;        // Comando de migración (opcional)
  port: number;                   // Puerto principal expuesto
  healthcheck: HealthCheck;       // Configuración de healthcheck
}

interface HealthCheck {
  path: string;  // Ruta HTTP para healthcheck (debe empezar con "/")
}

type ServiceName = string;
```

**Campos obligatorios:**
- `services`: Lista de nombres de servicios del runtime
- `port`: Puerto que expone la aplicación
- `healthcheck`: Configuración de healthcheck con `path`

**Campos opcionales:**
- `buildCommand`: Comando para construir la aplicación antes del deploy
- `migrateCommand`: Comando para ejecutar migraciones de base de datos

**Ejemplos:**

Backend completo:
```typescript
const backendRuntime: DeployRuntime = {
  services: ['app', 'nginx', 'db', 'cache', 'worker', 'scheduler'],
  buildCommand: 'npm run build',
  migrateCommand: 'npm run migrate',
  port: 8080,
  healthcheck: { path: '/api/health' },
};
```

Frontend estático (nginx-only, ver ADR-0013):
```typescript
const nginxOnlyRuntime: DeployRuntime = {
  services: ['nginx'],
  port: 80,
  healthcheck: { path: '/health.txt' },
};
```

### AdapterContract

Contrato completo del adapter.

```typescript
interface AdapterContract {
  version: AdapterContractVersion;           // Versión del contrato ("0")
  runtimeRequirements: RuntimeRequirements;  // Requisitos de runtime
  deployRuntime: DeployRuntime;              // Declaración de runtime de deploy
}
```

## Uso desde el core

El core importa estos tipos desde `@fractal/core`:

```typescript
import type {
  CreateProjectPayload,
  CreateProjectResponse,
  RuntimeRequirements,
  DeployRuntime,
  AdapterContract,
} from '@fractal/core';
```

## Uso desde un adapter

Los adapters también importan estos tipos para cumplir el contrato:

```typescript
import type {
  CreateProjectPayload,
  CreateProjectResponse,
  RuntimeRequirements,
  DeployRuntime,
} from '@fractal/core';

// El adapter implementa funciones que usan estos tipos
async function createProject(payload: CreateProjectPayload): Promise<CreateProjectResponse> {
  // ...implementación específica del framework
}
```

## Validación

### En tiempo de compilación

TypeScript valida que los payloads y respuestas cumplen con el contrato. Campos faltantes o tipos incorrectos son errores de compilación.

### En tiempo de ejecución

El bridge (SPEC-0002) valida:
- Que el adapter devuelve JSON válido
- Que la respuesta tiene la estructura esperada (`success` boolean)
- Que los errores son propagables sin stacktraces crudos

## Campos agnósticos vs específicos

### Campo único de healthcheck

El contrato usa un único campo `healthcheck.path` agnóstico al runtime (ver SPEC-0006 §8 P2). El adapter/runtime decide qué hay detrás:

- **Backend completo**: Endpoint real de la aplicación (e.g., `/api/health`)
- **Nginx-only**: Ruta estática servida por nginx (e.g., `/health.txt`)

No se filtra la topología del runtime dentro del contrato (alineado con ADR-0002).

### ServiceName como string

`ServiceName` es un `string` genérico, no un enum. Esto permite a cada adapter declarar los servicios que necesite sin modificar el contrato.

Servicios comunes: `app`, `nginx`, `db`, `cache`, `worker`, `scheduler`, `queue`.

## Versionado

### Versión actual: "0"

```typescript
type AdapterContractVersion = '0';
```

### Estrategia de versionado

El contrato v0 incluye ganchos para versionado futuro:
- `AdapterContractVersion` type
- Campo opcional `contractVersion` en `CreateProjectPayload`
- Campo `version` en `AdapterContract`

La estrategia formal de migración entre versiones se definirá cuando aparezca necesidad real de romper compatibilidad (ver SPEC-0006 §7 Compatibilidad).

## Tests

Los tipos del contrato están cubiertos por tests en `packages/core/src/types/adapter-contract.test.ts`:

- ✅ Payloads válidos compilan correctamente
- ✅ Campos requeridos vs opcionales están bien marcados
- ✅ Union types funcionan correctamente (respuestas success/error)
- ✅ Tipos son agnósticos de framework (verificado por lint de acoplamiento)

Ejecutar tests:
```bash
cd packages/core
npm test
```

Verificar acoplamiento:
```bash
npm run lint:coupling
```

## Referencias

- [SPEC-0006: Contrato del adapter v0](../../../docs/specs/0006-contrato-adapter-v0.md)
- [SPEC-0002: Bridge Node → toolchain](../../../docs/specs/0002-bridge-node-toolchain.md)
- [ADR-0002: Arquitectura multi-target](../../../docs/adr/0002-arquitectura-multi-target.md)
- [ADR-0010: Topología de proyecto generado](../../../docs/adr/0010-topologia-proyecto-generado-sin-inertia.md)
- [ADR-0013: Nginx-only para frontend estático](../../../docs/adr/0013-nginx-only-frontend-estatico.md)
- [CONSTITUTION.md, Artículo II](../../../docs/CONSTITUTION.md) — El core no conoce ningún framework
