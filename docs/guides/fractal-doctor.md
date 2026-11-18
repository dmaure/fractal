# Guía de usuario: `fractal doctor`

`fractal doctor <target>` es un chequeo determinista post-deploy: le pasás la URL
o el dominio de tu app y te dice, sin ambigüedad, si está sana. Hace sondeos
HTTP(S) de solo lectura (no despliega ni toca el servidor) y termina con un
**exit code** que identifica exactamente qué falló, pensado para consumir desde
un pipeline de CI. Esta guía describe el comportamiento real del comando, flag
por flag y exit code por exit code.

> Fuente de verdad: el comando vive en `packages/core`
> (`src/commands/doctor.ts`, con el registro de la CLI y los flags en
> `src/cli.ts`). El contrato de exit codes, los checks y la precedencia de fallo
> están especificados en el AC-9 de
> `docs/specs/0007-convenciones-y-prompts-para-generacion.md`. Es un comando
> agnóstico de framework (Artículo II): el contenido esperado nunca se hardcodea,
> llega siempre por `--expect-content`. Esta guía refleja el código en `master`;
> si algo diverge, el código manda.

---

## Sinopsis

```bash
fractal doctor [opciones] <target>
```

El `target` es el único argumento posicional y es obligatorio: una URL completa
(`https://mi-app.com`) o un dominio pelado (`mi-app.com`, en cuyo caso se asume
`https://`). De ahí el comando deriva la forma HTTPS y, si pedís verificar la
redirección, también la forma HTTP del mismo host, puerto y path.

| Opción | Default | Descripción |
|---|---|---|
| `--expect-content <texto>` | — | Substring que debe aparecer en el body de `GET /` (señal de que la app está arriba). |
| `--timeout <ms>` | `10000` | Timeout por sondeo, en ms (entero ≥ 1). |
| `--retries <n>` | `10` | Máximo de intentos **totales**, incluido el primero, ante fallos transitorios (entero ≥ 1). |
| `--retry-delay <ms>` | `5000` | Espera base entre intentos, en ms. |
| `--insecure` | off | Omite la validación del certificado TLS (staging / self-signed). |
| `--check-redirect` | off | Verifica también la redirección HTTP→HTTPS. |
| `--json` | off | Salida machine-readable en JSON (incluye `reason` y el exit code). |

La salida literal de `fractal doctor --help` es:

```
Usage: fractal doctor [options] <target>

Chequeo determinista post-deploy: HTTPS, app levantada y página base

Options:
  --expect-content <text>  Substring que debe aparecer en la página base (señal
                           de app arriba)
  --timeout <ms>           Timeout por request en ms, entero >= 1 (default
                           10000)
  --retries <n>            Máximo de intentos TOTALES (incluye el primero) ante
                           fallos transitorios, entero >= 1 (default 10)
  --retry-delay <ms>       Delay base entre intentos en ms (default 5000)
  --insecure               Omite la validación del certificado TLS (staging /
                           self-signed)
  --check-redirect         Verifica también la redirección HTTP→HTTPS
  --json                   Salida machine-readable en JSON
  -h, --help               display help for command
```

---

## Requisitos previos

- **Una app ya desplegada** (o en proceso de levantar) accesible por HTTP(S) en
  el `target` que le pasás. Lo natural es correr `fractal doctor` después de
  `fractal deploy` o como último paso del pipeline de deploy por merge.
- **Salida de red** desde donde corrés el comando hacia el `target`. En CI eso
  normalmente ya está; en una red con proxy saliente puede no estarlo.
- **El CLI de Fractal** disponible (`fractal --help`). Para los requisitos de
  desarrollo del repositorio (Node.js ≥ 20, pnpm) ver el
  [README](../../README.md).

No necesitás credenciales, ni acceso SSH, ni tocar el servidor: `doctor` es
solo lectura y hace únicamente requests HTTP(S).

---

## Qué chequea

El comando corre, en orden, estas verificaciones sobre la forma HTTPS del
`target` (y, con `--check-redirect`, una verificación extra sobre la forma HTTP):

1. **HTTPS responde** — el host contesta sobre HTTPS. Si no (TLS caído, conexión
   rechazada, timeout), falla con exit `2`.
2. **App levantada (sin 5xx)** — la respuesta no es un `5xx`. Un `5xx` significa
   que el proxy está arriba pero la app está caída: exit `4`.
3. **Página base servida (200)** — `GET /` devuelve `200`. Otro status no-5xx
   (p. ej. `404`/`403`/`3xx`) es exit `3`.
4. **Contenido esperado** (solo con `--expect-content`) — el body de `GET /`
   contiene el texto que pediste. Si no, exit `4`.
5. **Redirección HTTP→HTTPS** (solo con `--check-redirect`) — el host en HTTP
   responde con un `3xx` (`301`/`302`/`307`/`308`) cuyo `Location` apunta a
   `https:`. Si no, exit `5`.

### Exit codes

El contrato de exit codes es idéntico a `DOCTOR_EXIT` en `doctor.ts` (AC-9):

| Code | Nombre | Significado |
|---|---|---|
| `0` | `HEALTHY` | Todos los checks pasan: la app está sana. |
| `1` | `USAGE` | Target faltante/inválido o flag mal formado (error de uso). |
| `2` | `HTTPS_UNREACHABLE` | HTTPS/TLS no responde (TLS caído, conexión rechazada, timeout). |
| `3` | `BASE_PAGE_FAILED` | La página base no se sirve (status ≠200, no-5xx; p. ej. 404/403). |
| `4` | `APP_NOT_UP` | La app no está levantada (5xx, o falta el contenido esperado). |
| `5` | `REDIRECT_FAILED` | Falló la verificación de la redirección HTTP→HTTPS. |

### Precedencia de fallo

Cuando hay varias cosas mal, se reporta **el primer motivo que aplica** en este
orden:

```
HTTPS caído (2)  >  5xx (4)  >  status ≠200 (3)  >  contenido esperado faltante (4)  >  redirección (5)
```

Por eso un `503` siempre reporta "app no levantada" (exit `4`) y un `404`
reporta "página base no servida" (exit `3`), aunque además falte el contenido
esperado o la redirección: el exit code identifica la causa raíz, no el síntoma
de más abajo.

### Reintentos (la app recién booteó)

Justo después de un deploy la app puede estar todavía levantando o el DNS sin
propagar del todo. Por eso `doctor` **reintenta** ante condiciones transitorias
hasta `--retries` intentos totales (incluido el primero), esperando
`--retry-delay` ms entre uno y otro:

- Errores de red transitorios (`ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`,
  `ENOTFOUND`, `EAI_AGAIN`) se reintentan siempre.
- En la sonda HTTPS, además, se reintentan los `5xx`, los status ≠ `200` y —si
  pediste `--expect-content`— un body que todavía no contiene el texto.
- La sonda de redirección (con `--check-redirect`) **solo** reintenta errores de
  red: un status de redirección es una respuesta definitiva.

Con los defaults (`--retries 10`, `--retry-delay 5000`) eso da hasta ~45 s de
espera entre el primer intento y el último antes de reportar un fallo.

---

## Ejemplos de uso en CI

```bash
# Chequeo básico post-deploy: ¿está sana la app?
fractal doctor https://mi-app.com

# Confirmar que carga contenido real de la app y que HTTP redirige a HTTPS
fractal doctor https://mi-app.com \
  --expect-content "Mi App" \
  --check-redirect

# Esperar a que la app termine de levantar tras el deploy:
# hasta 20 intentos, 3 s entre cada uno, 5 s de timeout por sondeo
fractal doctor https://mi-app.com \
  --retries 20 \
  --retry-delay 3000 \
  --timeout 5000

# Salida JSON para parsear en un pipeline (incluye reason y exitCode)
fractal doctor https://mi-app.com --json

# Staging con certificado self-signed: omitir la validación TLS
fractal doctor https://staging.mi-app.com --insecure --expect-content "Mi App"
```

Con `--json`, la salida es un objeto con el target normalizado, el `exitCode`,
el `reason` del primer check que falló (si lo hubo) y los `checks` nombrados en
orden, apto para parsear con `jq`:

```bash
# Falla el paso si el exit code no es 0, y muestra el motivo
fractal doctor https://mi-app.com --json | tee doctor.json
jq -e '.healthy == true' doctor.json || {
  echo "Doctor reportó: $(jq -r '.reason' doctor.json)"
  exit 1
}
```

> **Nota:** el exit code del comando es la fuente de verdad para fallar un job
> (ver abajo). El `--json` es para **leer el motivo**; no reemplaza al exit code.

### Snippet de GitHub Actions

Este paso corre el doctor, deja que su exit code decida si el job pasa, y
—cuando falla— traduce el código a un mensaje accionable distinguiendo 2/3/4/5
con `$?`:

```yaml
- name: Verificar el deploy con fractal doctor
  run: |
    # No cortar el script en el fallo del comando: queremos leer $?
    set +e
    fractal doctor "https://${{ vars.APP_DOMAIN }}" \
      --expect-content "Mi App" \
      --check-redirect \
      --retries 20 --retry-delay 3000
    code=$?
    set -e

    case "$code" in
      0) echo "✓ App sana" ;;
      1) echo "::error::Error de uso: target o flag inválido" ;;
      2) echo "::error::HTTPS no responde (TLS caído / conexión rechazada / timeout)" ;;
      3) echo "::error::La página base no se sirve (status ≠200, no-5xx)" ;;
      4) echo "::error::La app no está levantada (5xx o falta el contenido esperado)" ;;
      5) echo "::error::Falló la redirección HTTP→HTTPS" ;;
      *) echo "::error::Exit code inesperado: $code" ;;
    esac

    exit "$code"   # el job falla con el mismo código que el doctor
```

Como el comando ya devuelve un exit code ≠0 ante cualquier problema, en el caso
más simple alcanza con `run: fractal doctor https://mi-app.com` y dejar que
Actions falle el job solo; el `case` de arriba agrega diagnóstico legible.

---

## Errores típicos

Cada exit code ≠0 corresponde a una causa concreta. El reporte humano marca cada
check con `✓`/`✗` y cierra con el motivo (`✘ Falló (exit N): ...`); con `--json`
el mismo motivo está en `reason`.

### Exit 1 — Error de uso (`USAGE`)

```
✗ Target vacío: se requiere una URL o un dominio.
```

El `target` falta, está vacío o es inválido, o una opción numérica está mal
formada (`--timeout`, `--retries` exigen un entero ≥ 1; `--retry-delay`, un
entero no negativo). No se hizo ningún sondeo: es un error de invocación.
Corregí el comando. Pasá una URL/dominio válido y valores enteros a los flags
numéricos.

### Exit 2 — HTTPS no responde (`HTTPS_UNREACHABLE`)

```
✘ Falló (exit 2): HTTPS no responde (ECONNREFUSED).
```

El host no contestó sobre HTTPS tras agotar los reintentos: TLS caído, conexión
rechazada, DNS sin resolver o timeout. Diagnóstico: verificá que el dominio
resuelva (`dig`/`nslookup`), que el puerto 443 esté abierto y que el
certificado/servidor estén levantados. Si estás contra staging con un
certificado self-signed, probá `--insecure`. Si la app todavía está booteando,
subí `--retries`/`--retry-delay`.

### Exit 3 — La página base no se sirve (`BASE_PAGE_FAILED`)

```
✘ Falló (exit 3): Página base no servida: status 404 (se esperaba 200).
```

HTTPS respondió, pero `GET /` devolvió un status distinto de `200` que **no** es
`5xx` (típicamente `404`, `403` o un `3xx`). El servidor web está arriba pero no
sirve la raíz como se espera. Diagnóstico: revisá la config del servidor/proxy
(root, rutas, index), que la ruta `/` exista y que no haya un redirect
inesperado.

### Exit 4 — La app no está levantada (`APP_NOT_UP`)

```
✘ Falló (exit 4): App no levantada: status 503 (5xx).
```

o, cuando usaste `--expect-content`:

```
✘ Falló (exit 4): App no levantada: contenido esperado ausente en la página base.
```

Dos causas, mismo código: o `GET /` devolvió un `5xx` (el proxy está arriba pero
la app detrás está caída) o la página base no contiene el texto de
`--expect-content`. Diagnóstico: mirá los logs de la app y del runtime
(contenedores), confirmá que el proceso de la app arrancó, y verificá que el
texto que pasaste a `--expect-content` efectivamente aparezca en el HTML de la
raíz.

### Exit 5 — Falló la redirección HTTP→HTTPS (`REDIRECT_FAILED`)

```
✘ Falló (exit 5): La verificación de la redirección HTTP→HTTPS falló.
```

Con `--check-redirect`, el host en HTTP no redirigió a HTTPS: no devolvió un
`3xx` (`301`/`302`/`307`/`308`) o el `Location` no apunta a `https:`. Todo lo
anterior (HTTPS, página base, contenido) pasó. Diagnóstico: revisá la regla de
redirección HTTP→HTTPS del servidor/proxy (el paso de SSL de `fractal deploy` la
configura; ver [`fractal-deploy.md`](./fractal-deploy.md#ssl)).

---

## Referencias

- [`docs/specs/0007-convenciones-y-prompts-para-generacion.md`](../specs/0007-convenciones-y-prompts-para-generacion.md) — especificación; el contrato de `fractal doctor` está en el **AC-9**.
- [`packages/core/src/commands/doctor.ts`](../../packages/core/src/commands/doctor.ts) — implementación del comando (lógica pura `evaluateHealth` + I/O de las sondas).
- [`packages/core/src/cli.ts`](../../packages/core/src/cli.ts) — registro del comando y de sus flags en la CLI.
- [`docs/guides/fractal-deploy.md`](./fractal-deploy.md) — `fractal deploy`, el paso previo que deja la app online (incluido el [SSL](./fractal-deploy.md#ssl) y la redirección HTTP→HTTPS que verifica `--check-redirect`).
- [`docs/guides/pack-de-convenciones.md`](./pack-de-convenciones.md) — el pack de convenciones del proyecto generado (misma SPEC-0007).
