# @fractal/core

CLI, FDL (Fractal Definition Language), y orquestación del generador.

## Principios

- **Agnóstico de framework** (Artículo II de CONSTITUTION.md)
- No contiene referencias a frameworks específicos
- Todo conocimiento de framework vive en `packages/adapter-*`

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

## Desarrollo

```bash
# Compilar
pnpm build

# Ejecutar tests
pnpm test

# Ejecutar tests una vez
pnpm test:run
```

## Estado

M1 — Comando `fractal new` implementado con validación y prompts.
