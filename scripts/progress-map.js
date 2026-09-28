#!/usr/bin/env node
/**
 * Mapa de avance — MVP dev-tool (semilla de SPEC-0031)
 *
 * Lee la fuente de verdad estructurada `docs/progress.json`, imprime un
 * resumen legible del estado del proyecto en terminal, y regenera de forma
 * idempotente los diagramas de `docs/MAPA_DE_PROGRESO.md` entre marcadores
 * HTML propios de cada diagrama:
 *
 *   - Diagrama 1 (avance por milestone) entre
 *     `<!-- progress-map:auto:start -->` / `<!-- progress-map:auto:end -->`
 *   - Diagrama 2 (capacidades y módulos) entre
 *     `<!-- progress-map:diagrama2:start -->` /
 *     `<!-- progress-map:diagrama2:end -->`
 *
 * El Diagrama 2 se genera solo si `progress.json` incluye el bloque
 * `capacidades` (compatible hacia atrás: un `progress.json` sin ese campo
 * sigue funcionando y solo regenera el Diagrama 1, ver SPEC-0031 §7).
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
 *   node scripts/progress-map.js            # regenera los diagramas y escribe
 *   node scripts/progress-map.js --check    # valida sincronía (no escribe);
 *                                           # exit != 0 si está desactualizado
 *
 * Sin dependencias externas — solo Node stdlib. Referencia: SPEC-0031.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(__dirname, '..');

export const PROGRESS_JSON = join(repoRoot, 'docs', 'progress.json');
export const MAPA_MD = join(repoRoot, 'docs', 'MAPA_DE_PROGRESO.md');

// Marcadores de auto-generación, uno por diagrama (SPEC-0031 §7, T2).
export const DIAGRAMA1_MARKERS = {
  start: '<!-- progress-map:auto:start -->',
  end: '<!-- progress-map:auto:end -->',
};
export const DIAGRAMA2_MARKERS = {
  start: '<!-- progress-map:diagrama2:start -->',
  end: '<!-- progress-map:diagrama2:end -->',
};

// Estados permitidos y su representación
const GLYPHS = { completado: '✅', en_curso: '🟡', pendiente: '⬜' };
const ESTADO_CLASS = { completado: 'done', en_curso: 'curso', pendiente: 'pend' };
const ESTADO_LABEL = { completado: 'Completado', en_curso: 'En curso', pendiente: 'Pendiente' };
const ESTADOS = ['completado', 'en_curso', 'pendiente'];

// classDef compartido por ambos diagramas (coloreado por estado).
const CLASS_DEFS = [
  'classDef done fill:#2e7d32,color:#fff,stroke:#1b5e20;',
  'classDef curso fill:#f9a825,color:#000,stroke:#f57f17;',
  'classDef pend fill:#cfd8dc,color:#000,stroke:#90a4ae;',
];

/**
 * Lee y valida docs/progress.json. Lanza un Error con mensaje claro si el
 * archivo falta, no parsea, o tiene una forma inesperada.
 */
export async function loadProgress(progressPath = PROGRESS_JSON) {
  let raw;
  try {
    raw = await readFile(progressPath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        `No se encontró la fuente de verdad en ${progressPath}.\n` +
          `Este script la necesita para regenerar el mapa de avance.`
      );
    }
    throw err;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${progressPath} no es JSON válido: ${err.message}`);
  }

  validateProgress(data);
  return data;
}

/**
 * Valida la forma de progress.json. `milestones` es obligatorio (Diagrama 1);
 * `capacidades` es opcional (Diagrama 2) y se valida solo si está presente,
 * para mantener compatibilidad hacia atrás (SPEC-0031 §7).
 */
export function validateProgress(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`progress.json debe ser un objeto.`);
  }

  if (!Array.isArray(data.milestones) || data.milestones.length === 0) {
    throw new Error(`progress.json debe tener un arreglo "milestones" no vacío.`);
  }

  for (const m of data.milestones) {
    if (!m || typeof m.id !== 'string' || typeof m.nombre !== 'string' || typeof m.entregable !== 'string') {
      throw new Error(
        `Cada milestone en progress.json requiere "id", "nombre" y "entregable" (string). ` +
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

  if (data.capacidades !== undefined) {
    validateCapacidades(data.capacidades);
  }
}

/**
 * Valida el bloque opcional `capacidades` que alimenta el Diagrama 2.
 * Forma:
 *   {
 *     "grupos":  [ { "id", "titulo", "nodos": [ nodo... ] } ],  // subgraphs
 *     "nodos":   [ nodo... ],                                   // nodos sueltos
 *     "aristas": [ ["origen", "destino"], ... ]
 *   }
 * donde nodo = { "id": string, "label": string, "estado": <enum> }.
 * Todos los campos son opcionales salvo la forma de cada nodo; ausencias se
 * tratan como listas vacías (fallback sensato).
 */
export function validateCapacidades(cap) {
  if (!cap || typeof cap !== 'object' || Array.isArray(cap)) {
    throw new Error(`"capacidades" en progress.json debe ser un objeto.`);
  }

  const ids = new Set();
  const validarNodo = (nodo, contexto) => {
    if (!nodo || typeof nodo.id !== 'string' || typeof nodo.label !== 'string') {
      throw new Error(
        `Cada nodo de "capacidades" requiere "id" y "label" (string). ` +
          `Nodo inválido en ${contexto}: ${JSON.stringify(nodo)}`
      );
    }
    if (!ESTADOS.includes(nodo.estado)) {
      throw new Error(
        `Estado inválido "${nodo.estado}" en nodo "${nodo.id}" de "capacidades". ` +
          `Permitidos: ${ESTADOS.join(' | ')}.`
      );
    }
    if (ids.has(nodo.id)) {
      throw new Error(`Id de nodo duplicado "${nodo.id}" en "capacidades".`);
    }
    ids.add(nodo.id);
  };

  const grupos = cap.grupos ?? [];
  if (!Array.isArray(grupos)) {
    throw new Error(`"capacidades.grupos" debe ser un arreglo.`);
  }
  for (const g of grupos) {
    if (!g || typeof g.id !== 'string' || typeof g.titulo !== 'string' || !Array.isArray(g.nodos)) {
      throw new Error(
        `Cada grupo de "capacidades" requiere "id", "titulo" (string) y "nodos" (arreglo). ` +
          `Grupo inválido: ${JSON.stringify(g)}`
      );
    }
    for (const nodo of g.nodos) validarNodo(nodo, `grupo ${g.id}`);
  }

  const sueltos = cap.nodos ?? [];
  if (!Array.isArray(sueltos)) {
    throw new Error(`"capacidades.nodos" debe ser un arreglo.`);
  }
  for (const nodo of sueltos) validarNodo(nodo, 'nodos');

  const aristas = cap.aristas ?? [];
  if (!Array.isArray(aristas)) {
    throw new Error(`"capacidades.aristas" debe ser un arreglo.`);
  }
  for (const arista of aristas) {
    if (!Array.isArray(arista) || arista.length !== 2 || arista.some((x) => typeof x !== 'string')) {
      throw new Error(
        `Cada arista de "capacidades" debe ser un par ["origen", "destino"]. ` +
          `Arista inválida: ${JSON.stringify(arista)}`
      );
    }
    for (const ref of arista) {
      if (!ids.has(ref)) {
        throw new Error(
          `La arista ${JSON.stringify(arista)} de "capacidades" referencia un nodo inexistente "${ref}".`
        );
      }
    }
  }
}

/**
 * Emite las líneas `class <ids> <clase>;` en orden estable a partir de una
 * lista de nodos con `{ id, estado }`, agrupando por estado. Determinístico.
 */
function classLines(nodos) {
  const lines = [];
  for (const estado of ESTADOS) {
    const ids = nodos.filter((n) => n.estado === estado).map((n) => n.id);
    if (ids.length > 0) {
      lines.push(`    class ${ids.join(',')} ${ESTADO_CLASS[estado]};`);
    }
  }
  return lines;
}

/**
 * Genera el bloque Mermaid del Diagrama 1 (avance por milestone) a partir de
 * los datos. Equivalente estructuralmente al diagrama mantenido a mano: mismos
 * nodos, misma cadena M0 → … → Mn, mismos classDef, coloreado por estado.
 */
export function generateDiagrama1(milestones) {
  const lines = [];
  lines.push('```mermaid');
  lines.push('flowchart LR');

  for (const m of milestones) {
    lines.push(`    ${m.id}["${m.id} · ${m.nombre}<br/>${m.entregable}"]`);
  }

  lines.push('');
  lines.push(`    ${milestones.map((m) => m.id).join(' --> ')}`);
  lines.push('');

  for (const def of CLASS_DEFS) lines.push(`    ${def}`);
  lines.push('');

  // Asignación de clases: una línea por clase con nodos, en orden estable.
  lines.push(...classLines(milestones.map((m) => ({ id: m.id, estado: m.estado }))));

  lines.push('```');
  return lines.join('\n');
}

/**
 * Genera el bloque Mermaid del Diagrama 2 (capacidades y módulos) a partir del
 * bloque `capacidades`. Reproduce la estructura del diagrama mantenido a mano:
 * subgraphs por grupo, nodos sueltos, aristas y coloreado por estado.
 */
export function generateDiagrama2(capacidades) {
  const grupos = capacidades.grupos ?? [];
  const sueltos = capacidades.nodos ?? [];
  const aristas = capacidades.aristas ?? [];

  const lines = [];
  lines.push('```mermaid');
  lines.push('flowchart TD');

  for (const g of grupos) {
    lines.push(`    subgraph ${g.id}["${g.titulo}"]`);
    for (const nodo of g.nodos) {
      lines.push(`        ${nodo.id}["${nodo.label}"]`);
    }
    lines.push('    end');
    lines.push('');
  }

  for (const nodo of sueltos) {
    lines.push(`    ${nodo.id}["${nodo.label}"]`);
  }
  if (sueltos.length > 0) lines.push('');

  for (const [from, to] of aristas) {
    lines.push(`    ${from} --> ${to}`);
  }
  if (aristas.length > 0) lines.push('');

  for (const def of CLASS_DEFS) lines.push(`    ${def}`);
  lines.push('');

  // Orden estable: nodos de grupos (en orden) y luego nodos sueltos.
  const todos = [...grupos.flatMap((g) => g.nodos), ...sueltos];
  lines.push(...classLines(todos));

  lines.push('```');
  return lines.join('\n');
}

/**
 * Construye el bloque completo entre marcadores (marcadores incluidos).
 */
export function wrapBlock(markers, inner) {
  return `${markers.start}\n${inner}\n${markers.end}`;
}

/**
 * Localiza la región entre marcadores en el markdown. Lanza si falta alguno o
 * si están invertidos, nombrando los marcadores esperados (SPEC-0031 AC-5).
 */
export function locateMarkers(md, markers, label) {
  const startIdx = md.indexOf(markers.start);
  const endIdx = md.indexOf(markers.end);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(
      `No se encontraron los marcadores de auto-generación del ${label} en docs/MAPA_DE_PROGRESO.md.\n` +
        `Se esperaban "${markers.start}" y "${markers.end}" alrededor del ${label}.`
    );
  }
  if (endIdx < startIdx) {
    throw new Error(
      `Los marcadores del ${label} en docs/MAPA_DE_PROGRESO.md están invertidos ` +
        `("${markers.end}" aparece antes que "${markers.start}").`
    );
  }
  return { startIdx, endIdx: endIdx + markers.end.length };
}

/**
 * Construye la lista de diagramas a regenerar según los datos disponibles.
 * El Diagrama 2 solo se incluye si hay bloque `capacidades` (compat. atrás).
 */
export function buildTargets(data) {
  const targets = [
    {
      label: 'Diagrama 1',
      markers: DIAGRAMA1_MARKERS,
      block: wrapBlock(DIAGRAMA1_MARKERS, generateDiagrama1(data.milestones)),
    },
  ];
  if (data.capacidades !== undefined) {
    targets.push({
      label: 'Diagrama 2',
      markers: DIAGRAMA2_MARKERS,
      block: wrapBlock(DIAGRAMA2_MARKERS, generateDiagrama2(data.capacidades)),
    });
  }
  return targets;
}

/**
 * Regenera (o valida, en modo `check`) los diagramas del mapa de forma
 * idempotente. Devuelve el markdown resultante y qué diagramas cambiaron.
 * No escribe ni sale del proceso: eso lo maneja el CLI (`main`).
 */
export async function regenerateMap({ progressPath = PROGRESS_JSON, mapaPath = MAPA_MD, check = false } = {}) {
  const data = await loadProgress(progressPath);
  const originalMd = await readFile(mapaPath, 'utf-8');
  const targets = buildTargets(data);

  // Validar que todos los marcadores existan antes de tocar nada (AC-5).
  for (const t of targets) locateMarkers(originalMd, t.markers, t.label);

  let updated = originalMd;
  const changed = [];
  for (const t of targets) {
    // Re-localizar en el string en curso: reemplazar un diagrama corre los
    // índices de los que vienen después en el documento.
    const { startIdx, endIdx } = locateMarkers(updated, t.markers, t.label);
    const current = updated.slice(startIdx, endIdx);
    if (current !== t.block) {
      changed.push(t.label);
      updated = updated.slice(0, startIdx) + t.block + updated.slice(endIdx);
    }
  }

  const inSync = changed.length === 0;
  if (!check && !inSync) {
    await writeFile(mapaPath, updated, 'utf-8');
  }

  return { data, changed, inSync, updated };
}

/**
 * Imprime el resumen legible del estado del proyecto.
 */
export function printSummary(data) {
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

  const { data, changed, inSync } = await regenerateMap({ check: checkMode });
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
    console.error('   Ejecutá `pnpm progress` (o `node scripts/progress-map.js`) y commiteá el cambio.');
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
