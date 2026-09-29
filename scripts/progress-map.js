#!/usr/bin/env node
/**
 * Mapa de avance — wrapper fino de `pnpm progress` (SPEC-0031).
 *
 * La lógica de dominio (leer/validar `docs/progress.json`, generar los
 * diagramas Mermaid y regenerarlos idempotentemente entre marcadores) vive
 * ahora en el core de producto: `@fractal/core/progress-map`, usada también por
 * `fractal status --write` (FRA-47). Este script quedó como un wrapper fino que
 * solo aporta el pegamento de CLI del dev-tool:
 *
 *   - resuelve las rutas del repo (cwd-independiente, vía la ubicación del
 *     script) para que `pnpm progress` funcione desde cualquier directorio,
 *   - parsea `--check`,
 *   - imprime el resumen y los mensajes de estado y fija el exit code.
 *
 * Así `pnpm progress` y `fractal status --write` comparten una única fuente de
 * verdad y no pueden divergir. El comportamiento observable de `pnpm progress`
 * (resumen + regeneración idempotente entre los mismos marcadores) no cambia.
 *
 * Requiere que `@fractal/core` esté compilado (`pnpm --filter @fractal/core
 * build`); el script `pnpm progress` lo hace por vos.
 *
 * Uso:
 *   node scripts/progress-map.js            # regenera los diagramas y escribe
 *   node scripts/progress-map.js --check    # valida sincronía (no escribe);
 *                                           # exit != 0 si está desactualizado
 *
 * Referencia: SPEC-0031.
 */

import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { regenerateMap, printSummary } from '@fractal/core/progress-map';

// Re-exportamos la lógica de dominio del core para que los tests del script
// (y cualquier consumidor histórico) sigan importándola desde acá sin cambios.
export {
  loadProgress,
  validateProgress,
  validateCapacidades,
  generateDiagrama1,
  generateDiagrama2,
  wrapBlock,
  locateMarkers,
  buildTargets,
  regenerateMap,
  printSummary,
  DIAGRAMA1_MARKERS,
  DIAGRAMA2_MARKERS,
} from '@fractal/core/progress-map';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(__dirname, '..');

// Rutas del repo, resueltas desde la ubicación del script (cwd-independiente).
export const PROGRESS_JSON = join(repoRoot, 'docs', 'progress.json');
export const MAPA_MD = join(repoRoot, 'docs', 'MAPA_DE_PROGRESO.md');

async function main() {
  const checkMode = process.argv.includes('--check');

  const { data, changed, inSync } = await regenerateMap({
    progressPath: PROGRESS_JSON,
    mapaPath: MAPA_MD,
    check: checkMode,
  });
  printSummary(data);

  const lista = changed.join(', ');

  if (checkMode) {
    if (inSync) {
      console.log('✅ Los diagramas de docs/MAPA_DE_PROGRESO.md están sincronizados con docs/progress.json.');
      process.exit(0);
    }
    console.error(
      `❌ Estos diagramas de docs/MAPA_DE_PROGRESO.md están desactualizados respecto de docs/progress.json: ${lista}.`
    );
    console.error('   Ejecutá `pnpm progress` (o `fractal status --write`) y commiteá el cambio.');
    process.exit(1);
  }

  if (inSync) {
    console.log('✅ Los diagramas ya estaban sincronizados; no hubo cambios en docs/MAPA_DE_PROGRESO.md.');
    process.exit(0);
  }

  console.log(`✅ Diagramas regenerados en docs/MAPA_DE_PROGRESO.md desde docs/progress.json: ${lista}.`);
  process.exit(0);
}

// Ejecutar solo si se invoca directamente (no al importar desde los tests).
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}
