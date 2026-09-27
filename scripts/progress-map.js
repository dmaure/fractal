#!/usr/bin/env node
/**
 * Mapa de avance — MVP dev-tool (semilla de SPEC-0031)
 *
 * Lee la fuente de verdad estructurada `docs/progress.json`, imprime un
 * resumen legible del estado del proyecto en terminal, y regenera el
 * Diagrama 1 (avance por milestone) de `docs/MAPA_DE_PROGRESO.md` entre los
 * marcadores HTML `<!-- progress-map:auto:start -->` /
 * `<!-- progress-map:auto:end -->`.
 *
 * Objetivo: que el mapa de avance deje de mantenerse a mano y no pueda
 * desincronizarse de la fuente de verdad (ver MAPA_DE_PROGRESO.md, sección
 * "Roadmap de este documento").
 *
 * Este script es un dev-tool del repo (hermano de scripts/lint-coupling.js),
 * NO la capability de producto. La capability completa `fractal status` la
 * especifica SPEC-0031 y la construye packages/core más adelante; este script
 * es la semilla para dogfooding.
 *
 * Uso:
 *   node scripts/progress-map.js            # regenera el diagrama y escribe
 *   node scripts/progress-map.js --check    # valida sincronía (no escribe);
 *                                           # exit != 0 si está desactualizado
 *
 * Sin dependencias externas — solo Node stdlib. Referencia: SPEC-0031.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(__dirname, '..');

const PROGRESS_JSON = join(repoRoot, 'docs', 'progress.json');
const MAPA_MD = join(repoRoot, 'docs', 'MAPA_DE_PROGRESO.md');

const START_MARKER = '<!-- progress-map:auto:start -->';
const END_MARKER = '<!-- progress-map:auto:end -->';

// Estados permitidos y su representación
const GLYPHS = { completado: '✅', en_curso: '🟡', pendiente: '⬜' };
const ESTADO_CLASS = { completado: 'done', en_curso: 'curso', pendiente: 'pend' };
const ESTADO_LABEL = { completado: 'Completado', en_curso: 'En curso', pendiente: 'Pendiente' };
const ESTADOS = ['completado', 'en_curso', 'pendiente'];

/**
 * Lee y valida docs/progress.json. Lanza un Error con mensaje claro si el
 * archivo falta, no parsea, o tiene una forma inesperada.
 */
async function loadProgress() {
  let raw;
  try {
    raw = await readFile(PROGRESS_JSON, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        `No se encontró la fuente de verdad en docs/progress.json.\n` +
          `Este script la necesita para regenerar el mapa de avance.`
      );
    }
    throw err;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`docs/progress.json no es JSON válido: ${err.message}`);
  }

  if (!Array.isArray(data.milestones) || data.milestones.length === 0) {
    throw new Error(`docs/progress.json debe tener un arreglo "milestones" no vacío.`);
  }

  for (const m of data.milestones) {
    if (!m || typeof m.id !== 'string' || typeof m.nombre !== 'string' || typeof m.entregable !== 'string') {
      throw new Error(
        `Cada milestone en docs/progress.json requiere "id", "nombre" y "entregable" (string). ` +
          `Milestone inválido: ${JSON.stringify(m)}`
      );
    }
    if (!ESTADOS.includes(m.estado)) {
      throw new Error(
        `Estado inválido "${m.estado}" en milestone ${m.id}. ` +
          `Permitidos: ${ESTADOS.join(' | ')}.`
      );
    }
  }

  return data;
}

/**
 * Genera el bloque Mermaid del Diagrama 1 (avance por milestone) a partir de
 * los datos. Equivalente estructuralmente al diagrama mantenido a mano: mismos
 * nodos, misma cadena M0 → … → Mn, mismos classDef, coloreado por estado.
 */
function generateMermaid(milestones) {
  const lines = [];
  lines.push('```mermaid');
  lines.push('flowchart LR');

  for (const m of milestones) {
    lines.push(`    ${m.id}["${m.id} · ${m.nombre}<br/>${m.entregable}"]`);
  }

  lines.push('');
  lines.push(`    ${milestones.map((m) => m.id).join(' --> ')}`);
  lines.push('');

  lines.push('    classDef done fill:#2e7d32,color:#fff,stroke:#1b5e20;');
  lines.push('    classDef curso fill:#f9a825,color:#000,stroke:#f57f17;');
  lines.push('    classDef pend fill:#cfd8dc,color:#000,stroke:#90a4ae;');
  lines.push('');

  // Asignación de clases: una línea por clase con nodos, en orden estable.
  for (const estado of ESTADOS) {
    const cls = ESTADO_CLASS[estado];
    const ids = milestones.filter((m) => m.estado === estado).map((m) => m.id);
    if (ids.length > 0) {
      lines.push(`    class ${ids.join(',')} ${cls};`);
    }
  }

  lines.push('```');
  return lines.join('\n');
}

/**
 * Construye el bloque completo entre marcadores (marcadores incluidos).
 */
function generateBlock(milestones) {
  return `${START_MARKER}\n${generateMermaid(milestones)}\n${END_MARKER}`;
}

/**
 * Localiza la región entre marcadores en el markdown. Lanza si falta alguno.
 */
function locateMarkers(md) {
  const startIdx = md.indexOf(START_MARKER);
  const endIdx = md.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(
      `No se encontraron los marcadores de auto-generación en docs/MAPA_DE_PROGRESO.md.\n` +
        `Se esperaban "${START_MARKER}" y "${END_MARKER}" alrededor del Diagrama 1.`
    );
  }
  if (endIdx < startIdx) {
    throw new Error(
      `Los marcadores de docs/MAPA_DE_PROGRESO.md están invertidos ` +
        `("${END_MARKER}" aparece antes que "${START_MARKER}").`
    );
  }
  return { startIdx, endIdx: endIdx + END_MARKER.length };
}

/**
 * Imprime el resumen legible del estado del proyecto.
 */
function printSummary(data) {
  const { milestones } = data;
  console.log(`🗺️  Mapa de avance — ${data.proyecto ?? 'Proyecto'}`);
  if (data.actualizado) {
    console.log(`    Actualizado: ${data.actualizado}`);
  }
  console.log('');

  for (const m of milestones) {
    const glyph = GLYPHS[m.estado];
    console.log(`${glyph} ${m.id} — ${m.nombre}: ${m.entregable}`);
  }

  console.log('');
  const total = milestones.length;
  for (const estado of ESTADOS) {
    const count = milestones.filter((m) => m.estado === estado).length;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    console.log(`${GLYPHS[estado]} ${ESTADO_LABEL[estado]}: ${count}/${total} (${pct}%)`);
  }
  console.log('');
}

async function main() {
  const checkMode = process.argv.includes('--check');

  const data = await loadProgress();
  printSummary(data);

  const md = await readFile(MAPA_MD, 'utf-8');
  const { startIdx, endIdx } = locateMarkers(md);

  const currentBlock = md.slice(startIdx, endIdx);
  const newBlock = generateBlock(data.milestones);
  const inSync = currentBlock === newBlock;

  if (checkMode) {
    if (inSync) {
      console.log('✅ El Diagrama 1 de docs/MAPA_DE_PROGRESO.md está sincronizado con docs/progress.json.');
      process.exit(0);
    }
    console.error('❌ El Diagrama 1 de docs/MAPA_DE_PROGRESO.md está desactualizado respecto de docs/progress.json.');
    console.error('   Ejecutá `pnpm progress` (o `node scripts/progress-map.js`) y commiteá el cambio.');
    process.exit(1);
  }

  if (inSync) {
    console.log('✅ El Diagrama 1 ya estaba sincronizado; no hubo cambios en docs/MAPA_DE_PROGRESO.md.');
    process.exit(0);
  }

  const updated = md.slice(0, startIdx) + newBlock + md.slice(endIdx);
  await writeFile(MAPA_MD, updated, 'utf-8');
  console.log('✅ Diagrama 1 regenerado en docs/MAPA_DE_PROGRESO.md desde docs/progress.json.');
  process.exit(0);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
