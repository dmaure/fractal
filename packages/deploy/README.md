# @fractal/deploy

Provisioning, contenedorización, y CI/CD para proyectos Fractal.

## Principios

- **Agnóstico de framework** (Artículo II de CONSTITUTION.md)
- Funciona para cualquier target soportado por Fractal
- Consume la declaración de runtime del adapter contract (SPEC-0006)
- Genera configuración de Docker, Nginx, SSL, firewall, CI/CD

## Módulos

### Runtime

Gestión de contenedores Docker y Docker Compose.

- **`DockerInstaller`**: Instala Docker CE y Docker Compose de forma idempotente
- **`ComposeGenerator`**: Genera `docker-compose.yml` consumiendo `DeployRuntime` del adapter contract
- **`RuntimeManager`**: Orquesta instalación y configuración del runtime

El módulo `runtime` consume la declaración `DeployRuntime` del adapter contract en lugar de constantes hardcodeadas. Cada adapter declara sus propios servicios, comandos de build/migración, puerto y healthcheck.

**Ejemplo de uso:**

```typescript
import { RuntimeManager } from '@fractal/deploy';
import type { DeployRuntime } from '@fractal/core';

const runtime: DeployRuntime = {
  services: ['app', 'nginx', 'db', 'redis'],
  buildCommand: 'docker build -t myapp:latest .',
  migrateCommand: 'docker compose exec app migrate',
  port: 80,
  healthcheck: { path: '/api/health' },
};

const manager = new RuntimeManager(sshClient);
await manager.setup({
  compose: {
    runtime,
    projectName: 'myproject',
    outputPath: '/home/deploy/docker-compose.yml',
  },
});
```

### Hardening

Endurecimiento de sistema: usuario no-root, SSH, firewall.

### DNS

Configuración automática de DNS (Cloudflare) o manual con polling.

### SSL

Certificados Let's Encrypt con renovación automática.

### CI/CD

Generación de workflows para GitHub Actions y GitLab CI.

### State Management

Tracking de estado de provisioning para idempotencia (AC-11).

### Manifest

Coordinación de deploy multirepo en el primer deploy (AC-13).

## Referencias

- [SPEC-0003: Deploy inicial a VPS](../../docs/specs/0003-deploy-inicial-vps.md)
- [SPEC-0006: Contrato del adapter v0](../../docs/specs/0006-contrato-adapter-v0.md)
- [CONSTITUTION.md](../../docs/CONSTITUTION.md) (Artículo II)
