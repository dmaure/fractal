# Rollback e Idempotencia

Este módulo implementa AC-10 y AC-11 del SPEC-0003.

## AC-10: Rollback automático

El `RollbackManager` ejecuta rollback automático a la imagen versionada anterior si el healthcheck post-deploy falla.

### Uso

```typescript
import { RollbackManager, StateManager, SshClient } from '@fractal/deploy';

const sshClient = new SshClient({ /* config */ });
const stateManager = new StateManager(sshClient);
const rollbackManager = new RollbackManager(sshClient, 'my-project');

// Obtener la versión anterior del estado
const lastDeploy = await stateManager.getLastDeploy();
const previousTag = lastDeploy?.imageTag || null;

// Desplegar con rollback automático
const result = await rollbackManager.deployWithAutoRollback(
  'v2.0.0',
  previousTag,
  {
    url: 'http://localhost/health',
    timeout: 5000,
    retries: 3,
    retryInterval: 2000,
    acceptableStatusCodes: [200, 204],
  }
);

if (result.success) {
  // Deploy exitoso - actualizar estado
  await stateManager.updateLastDeploy('v2.0.0', 'abc123');
} else if (result.rolledBack) {
  // Rollback automático se ejecutó
  console.error(`Deploy falló: ${result.error}`);
  console.log(`Sistema revertido a ${result.currentImageTag}`);
}
```

### Características

- **Determinístico (Artículo VII)**: Revierte al tag de imagen versionado, no reinicia un contenedor previo que puede ya no existir.
- **Healthcheck configurable**: Reintentos, timeout, códigos de estado aceptables.
- **Sin downtime**: Si el healthcheck falla, revierte automáticamente sin dejar el sitio caído.

## AC-11: Idempotencia

El `StateManager` guarda el estado del provisioning en `/etc/fractal/state.json` en el VPS.

### Uso

```typescript
import { StateManager, SshClient } from '@fractal/deploy';

const sshClient = new SshClient({ /* config */ });
const stateManager = new StateManager(sshClient);

// Inicializar estado si no existe
await stateManager.initialize();

// Verificar si un paso ya fue completado
const isHardeningDone = await stateManager.isStepCompleted('hardening');

if (!isHardeningDone) {
  // Ejecutar hardening...
  
  // Marcar como completado
  await stateManager.markStepCompleted('hardening');
}

// Lo mismo para otros pasos
const isRuntimeDone = await stateManager.isStepCompleted('runtime');
if (!isRuntimeDone) {
  // Instalar runtime...
  await stateManager.markStepCompleted('runtime');
}
```

### Pasos de provisioning

- `hardening`: Endurecimiento del sistema (AC-3)
- `runtime`: Instalación de Docker y Compose (AC-4)
- `dns`: Configuración DNS (AC-5, AC-6)
- `ssl`: Emisión de certificado SSL (AC-7)
- `initialDeploy`: Primer deploy

### Características

- **Idempotente**: Ejecutar `fractal deploy` dos veces con los mismos parámetros produce resultado idéntico.
- **Estado en el VPS**: El archivo describe el servidor, no el código. No viaja por el repositorio.
- **Escritura atómica**: Usa archivo temporal + mv para evitar corrupción.

## Integración

Ambos módulos están diseñados para ser framework-agnostic y cumplir con el Artículo II de la Constitución.

```typescript
// Ejemplo de flujo completo
const sshClient = new SshClient({ /* config */ });
const stateManager = new StateManager(sshClient);
const rollbackManager = new RollbackManager(sshClient, projectName);

// 1. Verificar estado de provisioning
await stateManager.initialize();

// 2. Ejecutar provisioning solo si es necesario
if (!await stateManager.isStepCompleted('hardening')) {
  // hardening...
  await stateManager.markStepCompleted('hardening');
}

if (!await stateManager.isStepCompleted('runtime')) {
  // runtime...
  await stateManager.markStepCompleted('runtime');
}

// 3. Deploy con rollback automático
const lastDeploy = await stateManager.getLastDeploy();
const deployResult = await rollbackManager.deployWithAutoRollback(
  newImageTag,
  lastDeploy?.imageTag || null,
  healthcheckConfig
);

if (deployResult.success) {
  await stateManager.updateLastDeploy(newImageTag, commitSha);
}
```

## Tests

Ambos módulos tienen tests unitarios completos:

- `state/state-manager.test.ts`: 18 tests
- `rollback/rollback-manager.test.ts`: 15 tests

Ejecutar:

```bash
cd packages/deploy
npm test
```
