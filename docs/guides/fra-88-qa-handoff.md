# FRA-88 — Handoff a Fractal QA (paridad no interactiva + TTS/TTP)

Cubre SPEC-0032 **AC-9** (paridad no interactiva flags/env) y **AC-10**
(TTS < 5 min local / TTP < 30 min deploy). Documenta el harness reproducible, el
procedimiento de medición, los resultados **reales** medidos en el entorno de
desarrollo de este PR, y lo que queda pendiente para Fractal QA post-merge.

> La fuente de verdad del modo no interactivo es
> `loadNewWizardFromEnvAndFlags` en
> `packages/core/src/utils/new-wizard.ts`. Ese camino NO pasa por el
> orquestador/brazos (ese es el camino interactivo): la paridad significa que esa
> función cubre cada valor que cada brazo recolecta.

---

## 1. Harness de paridad (reproducible)

### Local-only (sin infraestructura)

```bash
./scripts/fra-88-parity-harness.sh
```

El script:
1. Compila el CLI si falta `packages/core/dist/cli.js`.
2. Corre `fractal new <proyecto> --non-interactive --framework laravel
   --database postgresql --frontend react-vite` dentro de un directorio temporal
   (aislando las señales de infra/token del entorno para forzar local-only).
3. Mide el wall-clock del wizard + generación.
4. Verifica las invariantes del camino local-only (sin servidor, repo git
   generado, sin encadenar deploy) y que el proyecto se haya creado.
5. Imprime PASS/FAIL + la medición. Es idempotente: limpia su directorio
   temporal al entrar y al salir.

Equivalente manual:

```bash
pnpm -C packages/core build
TMP=$(mktemp -d)
cd "$TMP"
node /ruta/al/repo/packages/core/dist/cli.js new demo \
  --non-interactive --framework laravel --database postgresql --frontend react-vite
```

### Deploy (dry run — sin desplegar nada)

El camino deploy se activa con cualquier señal de infraestructura. Para verificar
la **paridad de validación** (que lista correctamente lo que falta) sin tocar
ningún servidor:

```bash
# Set incompleto: debe abortar listando los requeridos que faltan.
node packages/core/dist/cli.js new demo --non-interactive --deploy

# Set completo apuntando a una IP de documentación (RFC 5737): valida el parseo
# pero NO conviene continuar a un deploy real desde el harness.
node packages/core/dist/cli.js new demo --non-interactive \
  --server-ip 203.0.113.10 \
  --ssh-key-path ~/.ssh/id_ed25519 \
  --domain app.example.com \
  --email ops@example.com
```

> Un `fractal new ... --deploy` con un set válido **encadenaría** `fractal
> deploy` contra un servidor real. No lo corras en el harness: la medición de
> TTP necesita un VPS desechable y credenciales (ver §4).

La cobertura automatizada de la paridad vive además en los tests:
`packages/core/src/utils/new-wizard.test.ts` (resolución flag/env, precedencia,
local-only, exclusión de `GITHUB_TOKEN` AC-5) y
`packages/core/src/commands/new.test.ts` (generación local-only end-to-end).

---

## 2. Procedimiento de medición de AC-10

### TTS (Time-to-Usable-Scaffold, < 5 min, camino local)

1. Correr el harness local-only (o los pasos manuales de §1).
2. El TTS que mide el harness es el **wall-clock del CLI**: parseo del wizard no
   interactivo + generación de estructura vía adapter + `git init` + commit
   inicial.
3. Para un "usable scaffold" **ejecutable** completo, sumar el tiempo de instalar
   dependencias del proyecto generado (`composer install`, `npm install`) y
   `php artisan serve`. Ese tramo depende de red y del cache de paquetes, no del
   CLI de Fractal.

### TTP (Time-to-Production, < 30 min, camino deploy)

1. Provisionar un VPS desechable y credenciales SSH (fuera de este repo).
2. Cronometrar desde `fractal new ... --deploy` (set completo) hasta que la app
   responde en el dominio por HTTPS.
3. Registrar el total y los tramos (generación, provisioning, build+push, deploy,
   emisión de certificado).

---

## 3. Resultados reales medidos en ESTE entorno

Entorno: contenedor de desarrollo del PR. Herramientas presentes: Node 22,
pnpm 11, PHP 8.3.6, Composer 2.x, adapter `@fractal/adapter-laravel` instalado.

| Medición | Resultado | Qué midió exactamente |
|---|---|---|
| TTS local-only (CLI + generación) | **~0.35 s** (346 ms; corridas repetidas 335–346 ms) | `fractal new --non-interactive` camino local-only: wizard no interactivo + `create-project` del adapter + `git init` + commit inicial. **No** incluye `composer install`/`npm install`. |
| `fractal new` exit code | 0 | Camino local-only completó sin TTY. |
| Invariantes local-only | OK | `serverIp=''`, sin `DB_PASSWORD`/secrets (AC-8), hand-off sin `fractal deploy` encadenado, repo git creado. |
| Suite de tests de core | verde (656 tests) | Incluye los tests de paridad AC-9 y la regresión AC-5 (`GITHUB_TOKEN` ignorado). |
| Lint de acoplamiento (Art. II) | verde | Sin términos de framework en `packages/core`. |

**Conclusión AC-10 (TTS):** el overhead del CLI/wizard para el camino local-only
está holgadamente por debajo del umbral de 5 min (sub-segundo). El TTS real
"hasta correr el servidor" depende del `composer install`/`npm install` del
proyecto generado, no del CLI.

---

## 4. Pendiente para Fractal QA (post-merge) — NO hecho acá

1. **TTS real "ejecutable"**: medir el flujo completo hasta `php artisan serve`
   respondiendo, incluyendo `composer install`/`npm install`. Requiere red y
   cache de paquetes. Acá se midió solo el overhead del CLI (sub-segundo), no el
   install de dependencias.
2. **TTP real (< 30 min)**: requiere un VPS desechable + credenciales SSH + DNS.
   **No se provisionó ni desplegó nada** en este PR (no se tocan recursos pagos
   ni producción). Correr el procedimiento de §2 con un servidor real.
3. **AC4 / DoD §7 — `docs/progress.json` + `docs/MAPA_DE_PROGRESO.md`**: la
   sincronización vía `fractal status --write` quedó **DEFERIDA** a Fractal QA
   post-merge (excepción explícita acordada). **No** se modificó `progress.json`,
   `MAPA_DE_PROGRESO.md`, ni se corrió `fractal status --write` en este PR.
4. **SPEC-0032 → "Implementado"**: en este PR la spec solo pasó de "En revisión"
   a **"Aprobado"**. Marcarla "Implementado" y cerrar el resto de los ítems de
   DoD §9 queda para el cierre de QA.

---

## 5. Límites de cobertura (resumen)

- Lo medido acá es el **overhead del CLI/wizard** del camino local-only, con un
  adapter real y PHP/Composer presentes. El scaffold se genera desde stubs; **no**
  se corre `composer install` (no hay `vendor/` tras `fractal new`).
- El camino **deploy** se validó solo a nivel de parseo/validación de parámetros
  (lista de requeridos faltantes). El deploy real y su TTP no se ejercitaron.
- No se crearon recursos cloud, no se tocó producción, nada pago.
