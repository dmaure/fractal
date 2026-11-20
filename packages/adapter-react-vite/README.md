# @fractal/adapter-react-vite

Adapter frontend (`kind: frontend`, `platform: web`) que genera el SPA React + Vite.
Contrato: [ADR-0017](../../docs/adr/0017-frontend-como-adapter.md).

Acciones del bridge:

- `get-contract` — `FrontendContract`: build (imagen, install, build, `dist`), `serve: static`, dev (puerto 3000, proxy `/api`), `apiBaseEnv: VITE_API_URL`.
- `create-frontend` — escribe el SPA en `destinationPath` (`embedded` y `standalone` generan lo mismo por ahora).
- `get-pack` — convenciones del frontend (`fractal/frontends/react-vite.md`).

Alcance actual: monolito (FRA-116). Monorepo y multirepo siguen en FRA-117.
