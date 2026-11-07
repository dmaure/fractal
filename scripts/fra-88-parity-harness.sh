#!/usr/bin/env bash
#
# FRA-88 — Harness de paridad no interactiva + medición de TTS (SPEC-0032 AC-9/AC-10).
#
# Qué hace:
#   1. Compila el CLI si falta dist/cli.js.
#   2. Corre `fractal new` en modo NO INTERACTIVO, camino LOCAL-ONLY, dentro de
#      un directorio temporal, y mide el wall-clock del wizard + generación.
#   3. Verifica invariantes del camino local-only (sin servidor, sin secrets) y
#      que el proyecto se haya generado.
#   4. Imprime PASS/FAIL + la medición.
#
# Qué NO hace (ver docs/guides/fra-88-qa-handoff.md):
#   - NO corre `composer install` / `npm install` (dependencias del proyecto
#     generado, paso posterior del usuario, dependiente de red).
#   - NO despliega ni crea recursos cloud (TTP real queda para QA con un VPS).
#
# Idempotente: limpia su propio directorio temporal al entrar y al salir.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="${REPO_ROOT}/packages/core/dist/cli.js"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/fra88-harness.XXXXXX")"
PROJECT_NAME="fra88-local-only"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

echo "🧪 FRA-88 — Harness de paridad no interactiva (local-only)"
echo "   Repo: ${REPO_ROOT}"
echo "   Temp: ${TMP_DIR}"
echo

# 1. Build si falta el CLI compilado.
if [[ ! -f "${CLI}" ]]; then
  echo "⚙️  dist/cli.js no existe; compilando @fractal/core..."
  (cd "${REPO_ROOT}" && pnpm -C packages/core build)
fi

# 2. Correr el camino local-only y medir.
#    Aislamos el entorno de señales de infra/token para forzar local-only.
echo "▶️  fractal new ${PROJECT_NAME} --non-interactive (local-only)"
start_ms=$(date +%s%3N)
set +e
# El proyecto se genera en el cwd del proceso: corremos dentro de TMP_DIR para
# no ensuciar el repo y que el cleanup lo borre.
( cd "${TMP_DIR}" && \
  env -u FRACTAL_NEW_SERVER_IP -u FRACTAL_DEPLOY_SERVER_IP \
      -u FRACTAL_NEW_DOMAIN -u FRACTAL_DEPLOY_DOMAIN \
      -u FRACTAL_NEW_EMAIL -u FRACTAL_DEPLOY_EMAIL \
      -u FRACTAL_NEW_SSH_KEY_PATH -u FRACTAL_DEPLOY_SSH_KEY_PATH \
      -u FRACTAL_NEW_GITHUB_TOKEN -u FRACTAL_NEW_DEPLOY \
    node "${CLI}" new "${PROJECT_NAME}" \
      --non-interactive \
      --framework laravel \
      --database postgresql \
      --frontend react-vite ) \
  > "${TMP_DIR}/out.log" 2>&1
rc=$?
set -e
end_ms=$(date +%s%3N)
elapsed_ms=$((end_ms - start_ms))

echo "   Exit code: ${rc}"
echo "   Wall-clock (wizard + generación): ${elapsed_ms} ms"
echo

fail() { echo "❌ FAIL: $1"; echo "----- salida -----"; cat "${TMP_DIR}/out.log"; exit 1; }

# 3. Verificaciones.
[[ ${rc} -eq 0 ]] || fail "el comando salió con código ${rc}"
grep -q "Proyecto creado exitosamente" "${TMP_DIR}/out.log" || fail "no se generó el proyecto"
grep -q "local-only (sin servidor)" "${TMP_DIR}/out.log" || fail "no tomó el camino local-only"
[[ -d "${TMP_DIR}/${PROJECT_NAME}" ]] || fail "no existe el directorio del proyecto"
[[ -d "${TMP_DIR}/${PROJECT_NAME}/.git" ]] || fail "el proyecto no tiene repo git"
if grep -q "Encadenando a fractal deploy" "${TMP_DIR}/out.log"; then
  fail "el camino local-only no debería encadenar deploy"
fi

# 4. Resultado.
echo "✅ PASS — local-only no interactivo OK"
echo "   TTS (solo CLI + generación, sin composer/npm install): ${elapsed_ms} ms"
if [[ ${elapsed_ms} -lt 300000 ]]; then
  echo "   AC-10 (TTS < 5 min = 300000 ms): HOLGADAMENTE DENTRO del umbral para esta fase"
else
  echo "   AC-10 (TTS < 5 min): FUERA del umbral — revisar"
fi
