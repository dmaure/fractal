import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  ProgressData,
  Milestone,
  Capacidades,
  CapacidadNodo,
  CapacidadGrupo,
  Estado,
} from '../types/progress.js';
import { isValidTaskStatus, VALID_STATUSES } from '../types/progress.js';

/**
 * Regeneración del mapa de avance — núcleo de `fractal status` (SPEC-0031 T2 /
 * AC-3).
 *
 * Este módulo es la ÚNICA fuente de verdad de la lógica que regenera, de forma
 * idempotente, los diagramas Mermaid de `docs/MAPA_DE_PROGRESO.md` desde
 * `docs/progress.json`, entre marcadores HTML propios de cada diagrama:
 *
 *   - Diagrama 1 (avance por milestone) entre
 *     `<!-- progress-map:auto:start -->` / `<!-- progress-map:auto:end -->`
 *   - Diagrama 2 (capacidades y módulos) entre
 *     `<!-- progress-map:diagrama2:start -->` /
 *     `<!-- progress-map:diagrama2:end -->`
 *
 * El Diagrama 2 se genera solo si `progress.json` incluye el bloque
 * `capacidades` (compatible hacia atrás: un `progress.json` sin ese campo sigue
 * funcionando y solo regenera el Diagrama 1, ver SPEC-0031 §7).
 *
 * Antes vivía en `scripts/progress-map.js` (semilla / dogfooding). FRA-47 lo
 * trae al core de producto: el comando `fractal status` en modo escritura
 * (`--write`) usa este módulo, y `scripts/progress-map.js` (`pnpm progress`)
 * quedó como un wrapper fino que delega toda la lógica de dominio acá, para que
 * ambos caminos no puedan divergir.
 *
 * Agnóstico de framework (Artículo II): opera solo sobre `progress.json` y
 * markdown, sin conocer ningún target, y sin dependencias externas más allá de
 * la stdlib de Node.
 */

/** Marcadores de auto-generación, uno por diagrama (SPEC-0031 §7, T2). */
export interface Markers {
  start: string;
  end: string;
}

export const DIAGRAMA1_MARKERS: Markers = {
  start: '<!-- progress-map:auto:start -->',
  end: '<!-- progress-map:auto:end -->',
};

export const DIAGRAMA2_MARKERS: Markers = {
  start: '<!-- progress-map:diagrama2:start -->',
  end: '<!-- progress-map:diagrama2:end -->',
};

/** Representación por estado, alineada con el resumen en terminal. */
const GLYPHS: Record<Estado, string> = {
  completado: '✅',
  en_curso: '🟡',
  pendiente: '⬜',
};
const ESTADO_CLASS: Record<Estado, string> = {
  completado: 'done',
  en_curso: 'curso',
  pendiente: 'pend',
};
const ESTADO_LABEL: Record<Estado, string> = {
  completado: 'Completado',
  en_curso: 'En curso',
  pendiente: 'Pendiente',
};

/** classDef compartido por ambos diagramas (coloreado por estado). */
const CLASS_DEFS = [
  'classDef done fill:#2e7d32,color:#fff,stroke:#1b5e20;',
  'classDef curso fill:#f9a825,color:#000,stroke:#f57f17;',
  'classDef pend fill:#cfd8dc,color:#000,stroke:#90a4ae;',
];

/** Ruta por defecto de la fuente de verdad (relativa al cwd del proyecto). */
export function defaultProgressPath(): string {
  return resolve(process.cwd(), 'docs', 'progress.json');
}

/** Ruta por defecto del mapa visual (relativa al cwd del proyecto). */
export function defaultMapaPath(): string {
  return resolve(process.cwd(), 'docs', 'MAPA_DE_PROGRESO.md');
}

/**
 * Lee y valida `docs/progress.json`. Lanza un Error con mensaje claro si el
 * archivo falta, no parsea, o tiene una forma inesperada.
 */
export async function loadProgress(
  progressPath: string = defaultProgressPath()
): Promise<ProgressData> {
  let raw: string;
  try {
    raw = await readFile(progressPath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `No se encontró la fuente de verdad en ${progressPath}.\n` +
          `Se necesita para regenerar el mapa de avance.`
      );
    }
    throw err;
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `${progressPath} no es JSON válido: ${(err as Error).message}`
    );
  }

  validateProgress(data);
  return data;
}

/**
 * Valida la forma de progress.json. `milestones` es obligatorio (Diagrama 1);
 * `capacidades` es opcional (Diagrama 2) y se valida solo si está presente,
 * para mantener compatibilidad hacia atrás (SPEC-0031 §7).
 */
export function validateProgress(data: unknown): asserts data is ProgressData {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`progress.json debe ser un objeto.`);
  }

  const milestones = (data as { milestones?: unknown }).milestones;
  if (!Array.isArray(milestones) || milestones.length === 0) {
    throw new Error(`progress.json debe tener un arreglo "milestones" no vacío.`);
  }

  for (const m of milestones) {
    if (
      !m ||
      typeof (m as Milestone).id !== 'string' ||
      typeof (m as Milestone).nombre !== 'string' ||
      typeof (m as Milestone).entregable !== 'string'
    ) {
      throw new Error(
        `Cada milestone en progress.json requiere "id", "nombre" y "entregable" (string). ` +
          `Milestone inválido: ${JSON.stringify(m)}`
      );
    }
    if (!isValidTaskStatus((m as Milestone).estado)) {
      throw new Error(
        `Estado inválido "${(m as Milestone).estado}" en milestone ${(m as Milestone).id}. ` +
          `Permitidos: ${VALID_STATUSES.join(' | ')}.`
      );
    }
  }

  const capacidades = (data as { capacidades?: unknown }).capacidades;
  if (capacidades !== undefined) {
    validateCapacidades(capacidades);
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
export function validateCapacidades(cap: unknown): asserts cap is Capacidades {
  if (!cap || typeof cap !== 'object' || Array.isArray(cap)) {
    throw new Error(`"capacidades" en progress.json debe ser un objeto.`);
  }

  const ids = new Set<string>();
  const validarNodo = (nodo: unknown, contexto: string): void => {
    if (
      !nodo ||
      typeof (nodo as CapacidadNodo).id !== 'string' ||
      typeof (nodo as CapacidadNodo).label !== 'string'
    ) {
      throw new Error(
        `Cada nodo de "capacidades" requiere "id" y "label" (string). ` +
          `Nodo inválido en ${contexto}: ${JSON.stringify(nodo)}`
      );
    }
    if (!isValidTaskStatus((nodo as CapacidadNodo).estado)) {
      throw new Error(
        `Estado inválido "${(nodo as CapacidadNodo).estado}" en nodo "${(nodo as CapacidadNodo).id}" de "capacidades". ` +
          `Permitidos: ${VALID_STATUSES.join(' | ')}.`
      );
    }
    if (ids.has((nodo as CapacidadNodo).id)) {
      throw new Error(
        `Id de nodo duplicado "${(nodo as CapacidadNodo).id}" en "capacidades".`
      );
    }
    ids.add((nodo as CapacidadNodo).id);
  };

  const grupos = (cap as { grupos?: unknown }).grupos ?? [];
  if (!Array.isArray(grupos)) {
    throw new Error(`"capacidades.grupos" debe ser un arreglo.`);
  }
  for (const g of grupos) {
    if (
      !g ||
      typeof (g as CapacidadGrupo).id !== 'string' ||
      typeof (g as CapacidadGrupo).titulo !== 'string' ||
      !Array.isArray((g as CapacidadGrupo).nodos)
    ) {
      throw new Error(
        `Cada grupo de "capacidades" requiere "id", "titulo" (string) y "nodos" (arreglo). ` +
          `Grupo inválido: ${JSON.stringify(g)}`
      );
    }
    for (const nodo of (g as CapacidadGrupo).nodos)
      validarNodo(nodo, `grupo ${(g as CapacidadGrupo).id}`);
  }

  const sueltos = (cap as { nodos?: unknown }).nodos ?? [];
  if (!Array.isArray(sueltos)) {
    throw new Error(`"capacidades.nodos" debe ser un arreglo.`);
  }
  for (const nodo of sueltos) validarNodo(nodo, 'nodos');

  const aristas = (cap as { aristas?: unknown }).aristas ?? [];
  if (!Array.isArray(aristas)) {
    throw new Error(`"capacidades.aristas" debe ser un arreglo.`);
  }
  for (const arista of aristas) {
    if (
      !Array.isArray(arista) ||
      arista.length !== 2 ||
      arista.some((x) => typeof x !== 'string')
    ) {
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
function classLines(nodos: { id: string; estado: Estado }[]): string[] {
  const lines: string[] = [];
  for (const estado of VALID_STATUSES) {
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
export function generateDiagrama1(milestones: Milestone[]): string {
  const lines: string[] = [];
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
  lines.push(
    ...classLines(milestones.map((m) => ({ id: m.id, estado: m.estado })))
  );

  lines.push('```');
  return lines.join('\n');
}

/**
 * Genera el bloque Mermaid del Diagrama 2 (capacidades y módulos) a partir del
 * bloque `capacidades`. Reproduce la estructura del diagrama mantenido a mano:
 * subgraphs por grupo, nodos sueltos, aristas y coloreado por estado.
 */
export function generateDiagrama2(capacidades: Capacidades): string {
  const grupos = capacidades.grupos ?? [];
  const sueltos = capacidades.nodos ?? [];
  const aristas = capacidades.aristas ?? [];

  const lines: string[] = [];
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
  const todos: CapacidadNodo[] = [...grupos.flatMap((g) => g.nodos), ...sueltos];
  lines.push(...classLines(todos));

  lines.push('```');
  return lines.join('\n');
}

/** Construye el bloque completo entre marcadores (marcadores incluidos). */
export function wrapBlock(markers: Markers, inner: string): string {
  return `${markers.start}\n${inner}\n${markers.end}`;
}

/**
 * Localiza la región entre marcadores en el markdown. Lanza si falta alguno o
 * si están invertidos, nombrando los marcadores esperados (SPEC-0031 AC-5).
 */
export function locateMarkers(
  md: string,
  markers: Markers,
  label: string
): { startIdx: number; endIdx: number } {
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

/** Un diagrama a regenerar: su etiqueta, marcadores y bloque ya envuelto. */
export interface Target {
  label: string;
  markers: Markers;
  block: string;
}

/**
 * Construye la lista de diagramas a regenerar según los datos disponibles.
 * El Diagrama 2 solo se incluye si hay bloque `capacidades` (compat. atrás).
 */
export function buildTargets(data: ProgressData): Target[] {
  const targets: Target[] = [
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

/** Resultado de una regeneración (o validación en modo `check`). */
export interface RegenerateResult {
  data: ProgressData;
  changed: string[];
  inSync: boolean;
  updated: string;
}

export interface RegenerateOptions {
  /** Ruta a progress.json. Ignorada si se pasa `data`. */
  progressPath?: string;
  /** Ruta al mapa markdown. Por defecto `docs/MAPA_DE_PROGRESO.md` del cwd. */
  mapaPath?: string;
  /** Modo validación: no escribe, solo reporta desincronización. */
  check?: boolean;
  /**
   * Datos ya cargados y validados. Si se pasan, se omite `loadProgress` (evita
   * releer/revalidar cuando el llamador —p. ej. `fractal status`— ya lo hizo).
   */
  data?: ProgressData;
}

/**
 * Regenera (o valida, en modo `check`) los diagramas del mapa de forma
 * idempotente. Devuelve el markdown resultante y qué diagramas cambiaron.
 * No sale del proceso ni imprime: eso lo maneja cada CLI llamador.
 */
export async function regenerateMap(
  options: RegenerateOptions = {}
): Promise<RegenerateResult> {
  const {
    progressPath = defaultProgressPath(),
    mapaPath = defaultMapaPath(),
    check = false,
  } = options;

  const data = options.data ?? (await loadProgress(progressPath));
  const originalMd = await readFile(mapaPath, 'utf-8');
  const targets = buildTargets(data);

  // Validar que todos los marcadores existan antes de tocar nada (AC-5).
  for (const t of targets) locateMarkers(originalMd, t.markers, t.label);

  let updated = originalMd;
  const changed: string[] = [];
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
 * Imprime el resumen legible del estado del proyecto (milestone por milestone
 * + conteo/porcentaje por estado). Formato compartido con `fractal status`.
 */
export function printSummary(data: ProgressData): void {
  const { milestones } = data;
  console.log(`🗺️  Mapa de avance — ${data.proyecto ?? 'Proyecto'}`);
  if (data.actualizado) {
    console.log(`    Actualizado: ${data.actualizado}`);
  }
  console.log('');

  for (const m of milestones) {
    console.log(`${GLYPHS[m.estado]} ${m.id} — ${m.nombre}: ${m.entregable}`);
  }

  console.log('');
  const total = milestones.length;
  for (const estado of VALID_STATUSES) {
    const count = milestones.filter((m) => m.estado === estado).length;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    console.log(`${GLYPHS[estado]} ${ESTADO_LABEL[estado]}: ${count}/${total} (${pct}%)`);
  }
  console.log('');
}
