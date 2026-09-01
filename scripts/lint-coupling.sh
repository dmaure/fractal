#!/usr/bin/env bash
# Lint de acoplamiento - Artículo II
# Verifica que packages/core y packages/deploy no contengan referencias a frameworks específicos

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Términos prohibidos en packages/core y packages/deploy (ADR-0002)
FORBIDDEN_TERMS=(
  "laravel"
  "artisan"
  "eloquent"
  "blade"
  "composer"
  "rails"
  "activerecord"
  "gemfile"
  "bundler"
  "erb"
)

# Directorios a verificar
DIRS_TO_CHECK=("packages/core" "packages/deploy")

echo "🔍 Ejecutando lint de acoplamiento (Artículo II)..."
echo ""

violations_found=0

for dir in "${DIRS_TO_CHECK[@]}"; do
  if [ ! -d "$dir" ]; then
    echo "⚠️  Directorio $dir no existe, omitiendo..."
    continue
  fi
  
  echo "Verificando $dir..."
  
  for term in "${FORBIDDEN_TERMS[@]}"; do
    # Buscar el término (case-insensitive) en archivos .ts, .js, .json
    # Excluir node_modules, dist, test fixtures
    matches=$(grep -ril \
      --include="*.ts" \
      --include="*.js" \
      --include="*.json" \
      --exclude-dir="node_modules" \
      --exclude-dir="dist" \
      --exclude-dir=".git" \
      "$term" "$dir" 2>/dev/null || true)
    
    if [ -n "$matches" ]; then
      echo -e "${RED}❌ Término prohibido encontrado: '$term'${NC}"
      echo "$matches" | while read -r file; do
        echo "   → $file"
      done
      echo ""
      violations_found=1
    fi
  done
done

if [ $violations_found -eq 0 ]; then
  echo -e "${GREEN}✅ Lint de acoplamiento pasó. El core permanece agnóstico.${NC}"
  exit 0
else
  echo -e "${RED}❌ Lint de acoplamiento falló.${NC}"
  echo ""
  echo "El core y deploy no pueden contener referencias a frameworks específicos (Artículo II)."
  echo "Todo conocimiento de framework debe vivir en packages/adapter-*/"
  exit 1
fi
