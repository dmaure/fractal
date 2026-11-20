# ADR-0017: El frontend es un adapter reemplazable (backend + 0..N frontends)

**Estado:** Aprobado
**Fecha:** 2026-11-20
**Contexto:** Decisión de producto de Diego (PO), ticket FRA-115. Propuesta completa: sección 8 de `fractal-structure-proposal.md`.

## Contexto

Fractal es modular por identidad. Hoy el frontend (React) vive dentro de `adapter-laravel`, el wizard pregunta el frontend pero el valor nunca llega a un adapter, y `resolveSingleAdapter` exige un único adapter. Se quiere que hoy sea React, mañana otro stack y luego react-native (`platform: mobile`). Nunca Blade.

## Decisión

1. Un proyecto = **un adapter backend + 0..N adapters frontend**, con el mismo mecanismo de paquetes `adapter-*` y bridge.
2. `package.json > fractal` gana `kind` (`backend`|`frontend`, default `backend`) y `platform` (default `web`). Los adapters existentes siguen funcionando sin cambios.
3. Resolver: `resolveBackendAdapter(cliPath, target?)`, `resolveFrontendAdapters(cliPath, targets[])` y `listFrontendAdapters`; `resolveSingleAdapter` queda como alias del backend.
4. Core define los tipos `FrontendContract` (`get-contract` del frontend: build, serve `static|none`, dev, `apiBaseEnv`) y `CreateFrontendPayload` (acción `create-frontend`), y `computeLayout(topology, name, frontends)` como **única fuente de paths**:

   | Topología | backend | frontends |
   |---|---|---|
   | monolith | `.` | `web/`, `mobile/` |
   | monorepo | `api/` | `web/`, `mobile/` |
   | multirepo | `<nombre>-api` | `<nombre>-web`, `<nombre>-mobile` |

5. Las opciones de frontend del wizard salen de los adapters instalados; core no las hardcodea (`--frontend a,b` o `none`). Los elegidos se persisten en `fractal/manifest.json` como `frontends: [{ adapter, name, dir }]` (campo opcional; `manifestVersion` sigue en '1').
6. Los adapters no comparten fs: se comunican solo por contrato JSON.

## Retrocompatibilidad

Sin adapters frontend instalados, `fractal new` se comporta igual que antes (el valor legacy de `--frontend` se ignora, no se invoca `create-frontend`, el manifiesto no cambia).

## Fuera de alcance (tickets siguientes)

- FRA-116: mover el frontend de `adapter-laravel` a un adapter propio.
- FRA-117: monorepo/multirepo generados, Dockerfile/nginx del backend desde el contrato del frontend, deploy del rol `web`.
- `get-pack`/`generate-entity` por frontend y merge de packs.

## Consecuencias

El core queda agnóstico del stack de frontend; agregar react-native es un paquete nuevo (`kind: frontend`, `platform: mobile`, `serve: none`) sin tocar core.
