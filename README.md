# Fractal

> Generador de aplicaciones production-ready, multi-framework.
> De cero a desplegado en internet en menos de 30 minutos.

**Estado:** En diseño (M0 — Fundaciones)

---

## Qué es

Fractal genera una aplicación completa —CRUD, autenticación, API, frontend— y
**la despliega en internet** con HTTPS y CI/CD antes de que escribas la primera
línea de lógica de negocio.

El nombre describe la arquitectura: la misma estructura se repite en cada framework
destino. El dominio se define una vez, en FDL, y se proyecta sobre cada target.

```
fractal new mi-proyecto     # genera el proyecto
fractal deploy              # lo pone online con HTTPS y CI/CD
fractal entity Producto     # genera CRUD completo
```

---

## Targets

| Framework | Estado |
|---|---|
| Laravel | En desarrollo — target de referencia |
| Ruby on Rails | Planificado (M4) — target de validación |

---

## Desarrollo

### Requisitos

- Node.js >= 20.0.0
- pnpm 11.24.0 (gestionado vía `packageManager` en package.json)

### Setup

```bash
# Instalar dependencias
pnpm install

# Lint de acoplamiento (Artículo II)
pnpm lint:coupling
```

### Estructura del monorepo

```
packages/
├── core/              CLI, FDL, orquestación. Agnóstico.
├── adapter-laravel/   Todo el conocimiento de PHP/Laravel
├── adapter-rails/     Todo el conocimiento de Ruby/Rails
└── deploy/            Provisioning y CI/CD. Agnóstico.
```

**Artículo II:** `core` y `deploy` nunca contienen referencias a frameworks específicos.
El lint de acoplamiento (`pnpm lint:coupling`) verifica esto en CI.

---

## Documentación

Toda la documentación del proyecto vive en [`docs/`](docs/).

Orden de lectura recomendado:

1. **[CONSTITUTION.md](docs/CONSTITUTION.md)** — principios innegociables
2. **[VISION.md](docs/VISION.md)** — qué construimos y para quién
3. **[ROADMAP.md](docs/ROADMAP.md)** — en qué orden
4. **[PROCESO.md](docs/PROCESO.md)** — cómo se trabaja

Decisiones técnicas en [`docs/adr/`](docs/adr/).
Especificaciones de capabilities en [`docs/specs/`](docs/specs/).

---

## Contribuir

Antes del primer PR, leer [PROCESO.md](docs/PROCESO.md).

Regla principal: **no se abre rama de implementación sin un spec aprobado.**

---

## Licencia

Por definir.
