# Fixtures de FDL

Fixtures JSON estables del lenguaje FDL v0 (SPEC-0004) usados por la suite de
tests de punta a punta `src/fdl/fixtures.test.ts` (FRA-60, T5), que recorre la
cadena **parser → validador → diagnósticos** sobre cada archivo y fija
_snapshots_ comprometidos del IR parseado y de los diagnósticos formateados.

Viven bajo `test/` a propósito: ese nombre de directorio los exime del lint de
acoplamiento (`scripts/lint-coupling.js`, Artículo II), necesario porque el
fixture de VR-10 contiene, por diseño, una palabra de vocabulario de ORM.

## Layout

- `valid/` — documentos FDL completos y semánticamente válidos (pasan las 12
  reglas VR-1..VR-12). Son los ejemplos de SPEC-0004 §7.6, verbatim:
  - `minimal.json` — ejemplo mínimo (un `project`, una entidad, un campo).
  - `relational.json` — ejemplo relacional (dos entidades, campos con
    modificadores y una relación bidireccional con `inverse`).
- `invalid/` — documentos **bien formados** (parsean sin error de forma) pero
  semánticamente inválidos. Hay exactamente uno por regla, nombrados
  `vr-NN-<slug>.json`, y cada uno dispara **solo** su regla `VR-NN`:
  `vr-01`..`vr-12`.

## Cómo actualizar los snapshots

Si cambiás un fixture (o el formato de diagnósticos / el IR), regenerá los
snapshots y revisá el diff antes de commitear:

```sh
pnpm --filter @fractal/core test -u
git diff packages/core/src/fdl/__snapshots__/fixtures.test.ts.snap
```
