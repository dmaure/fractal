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
git clone https://github.com/dmaure/fractal.git
cd fractal
pnpm install      # instala dependencias, compila e instala el comando `fractal`

fractal --help
```

`pnpm install` (en su `postinstall`) compila el monorepo y deja un comando
`fractal` en el PATH: un shim que ejecuta `packages/core/dist/cli.js` de este
checkout. Lo escribe en el `bin/` de tu Node (nvm, Homebrew, instalador
oficial) o, si ese no es escribible, en `~/.local/bin`. No hace falta `sudo` ni
`pnpm setup`.

- Después de cambiar código del CLI, corré `pnpm build`: el comando usa el build
  del checkout, no una copia.
- Si ya tenías el repo instalado (pnpm saltea el `postinstall` cuando no hay
  cambios), o cambiaste de versión de Node: `pnpm cli:install`.
- Para quitarlo: `pnpm cli:uninstall`.
- Para elegir otro directorio: `FRACTAL_BIN_DIR=/ruta/en/el/PATH pnpm cli:install`.
- En CI (`CI` definido) o con `FRACTAL_SKIP_CLI_INSTALL=1` no se instala nada.

```bash
# Lint de acoplamiento (Artículo II)
pnpm lint:coupling
```

### Estado del proyecto y mapa de progreso

La fuente de verdad del avance es [`docs/progress.json`](docs/progress.json). El
comando `fractal status` la lee y muestra el resumen por milestone; los
diagramas Mermaid de [`docs/MAPA_DE_PROGRESO.md`](docs/MAPA_DE_PROGRESO.md) se
generan desde ahí (SPEC-0031).

```bash
fractal status            # imprime el resumen (solo lectura)
fractal status --write    # regenera los diagramas del mapa (idempotente)
fractal status --check    # valida sin escribir; falla si el mapa está desactualizado
```

`--check` es un **dry-run**: no escribe ningún archivo. Regenera los diagramas
en memoria y sale con código `!= 0` si `docs/MAPA_DE_PROGRESO.md` no coincide con
lo que produciría `--write`, o si faltan / están invertidos los marcadores de
auto-generación (`<!-- progress-map:auto:start -->` / `:end`, y el par
`:diagrama2:`). Sale con código `0` cuando todo está sincronizado.

**Gate de CI:** el workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
corre `pnpm status:check` (= `fractal status --check`) en cada pull request, de
modo que un mapa desactualizado **bloquea el merge**. Para arreglarlo, corré
`fractal status --write` (o `pnpm progress`) y commiteá el cambio.

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
4. **[MAPA_DE_PROGRESO.md](docs/MAPA_DE_PROGRESO.md)** — el avance, visualizado
5. **[PROCESO.md](docs/PROCESO.md)** — cómo se trabaja

Decisiones técnicas en [`docs/adr/`](docs/adr/).
Especificaciones de capabilities en [`docs/specs/`](docs/specs/).

---

## Contribuir

Antes del primer PR, leer [PROCESO.md](docs/PROCESO.md).

Regla principal: **no se abre rama de implementación sin un spec aprobado.**

---

## Licencia

Por definir.
