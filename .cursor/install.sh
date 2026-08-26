#!/usr/bin/env bash
#
# Bootstrap del entorno de desarrollo de Fractal para Cloud Agents.
#
# Toolchain: Node.js + pnpm con workspaces (ADR-0001, ADR-0002). La imagen base
# por defecto de Cursor ya trae Node y pnpm vía corepack, así que este script no
# instala toolchains del sistema: solo prepara pnpm e instala las dependencias
# del monorepo cuando el manifest existe.
#
# El repositorio está en M0 (Fundaciones): hoy solo contiene documentacion y aún
# no hay package.json. Por eso el script debe ser seguro cuando no hay manifest y
# convertirse en la instalacion real en cuanto exista, sin cambios adicionales.
#
# Idempotente: puede ejecutarse multiples veces con el mismo resultado.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# corepack ya viene activo en la imagen base; habilitarlo es best-effort.
corepack enable >/dev/null 2>&1 || true

echo "node   $(node -v)"
echo "pnpm   $(corepack pnpm -v)"

if [ -f pnpm-lock.yaml ]; then
  echo "==> pnpm-lock.yaml presente: instalación reproducible (--frozen-lockfile)"
  corepack pnpm install --frozen-lockfile
elif [ -f package.json ]; then
  echo "==> package.json presente sin lockfile: instalando dependencias"
  corepack pnpm install
else
  echo "==> Sin package.json todavía (M0, solo documentación): nada que instalar."
  echo "    El toolchain queda listo para el monorepo cuando exista el manifest."
fi

echo "==> Entorno de Fractal listo."
