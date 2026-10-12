import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import type { ProgressData } from '../types/progress.js';
import { generateDiagrama1, generateDiagrama2 } from './progress-map.js';
import type {
  RenderRequest,
  RenderedFile,
} from '@fractal/progress-export';

/**
 * Exportación de los diagramas del mapa de progreso a SVG/PNG (FRA-48).
 *
 * `@fractal/core` sigue siendo la única fuente del TEXTO Mermaid (Diagrama 1 de
 * hitos y Diagrama 2 de capacidades, ver `./progress-map.ts`). Este módulo:
 *
 *   - arma, de forma pura y testeable sin navegador, QUÉ diagramas exportar,
 *     a qué formatos y con qué rutas de salida, y
 *   - delega el render real (Mermaid -> SVG/PNG en Chromium headless) en el
 *     paquete `@fractal/progress-export`, cargado de forma perezosa (solo
 *     cuando se usa `fractal status --export`), para no arrastrar sus
 *     dependencias pesadas en el camino normal del CLI.
 *
 * La exportación es una acción OPT-IN y de solo lectura respecto de
 * `progress.json`/`MAPA_DE_PROGRESO.md`: no toca el mapa ni participa de la
 * guardia de CI (`--check`). Agnóstico de framework (Artículo II).
 */

/** Formatos aceptados por `--format`. */
export type ExportFormat = 'svg' | 'png' | 'both';

/** Formatos concretos de archivo (sin `both`). */
export type ImageFormat = 'svg' | 'png';

export const VALID_EXPORT_FORMATS: readonly ExportFormat[] = [
  'svg',
  'png',
  'both',
];

/** Directorio de salida por defecto (relativo al cwd del proyecto). */
export const DEFAULT_EXPORT_DIR = ['docs', 'progress-map'] as const;

/** Un diagrama exportable: su nombre de archivo base y su texto Mermaid. */
export interface DiagramExport {
  /** Nombre de archivo base (sin extensión), p. ej. "mapa-hitos". */
  basename: string;
  /** Etiqueta legible. */
  label: string;
  /** Texto Mermaid crudo (sin las cercas ```mermaid). */
  mermaid: string;
}

/** Una entrada del plan de exportación: el diagrama y sus archivos destino. */
export interface ExportPlanEntry extends DiagramExport {
  formats: ImageFormat[];
  outputs: { format: ImageFormat; path: string }[];
}

/**
 * Quita las cercas de un bloque Mermaid fenceado (```mermaid ... ```) y
 * devuelve el texto crudo. Tolera espacios alrededor de las cercas.
 */
export function extractMermaid(fencedBlock: string): string {
  const lines = fencedBlock.split('\n');
  if (lines.length > 0 && lines[0].trim().startsWith('```')) {
    lines.shift();
  }
  if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
    lines.pop();
  }
  return lines.join('\n').trim();
}

/**
 * Construye la lista de diagramas a exportar desde los datos ya validados.
 * El Diagrama 2 (capacidades) solo se incluye si `progress.json` trae el bloque
 * `capacidades`, igual que la regeneración del mapa (compatibilidad hacia atrás).
 */
export function buildDiagramExports(data: ProgressData): DiagramExport[] {
  const items: DiagramExport[] = [
    {
      basename: 'mapa-hitos',
      label: 'Diagrama 1 — hitos',
      mermaid: extractMermaid(generateDiagrama1(data.milestones)),
    },
  ];
  if (data.capacidades !== undefined) {
    items.push({
      basename: 'mapa-capacidades',
      label: 'Diagrama 2 — capacidades',
      mermaid: extractMermaid(generateDiagrama2(data.capacidades)),
    });
  }
  return items;
}

/**
 * Normaliza y valida el valor de `--format`. `both` se expande a `['svg','png']`.
 * Lanza un Error accionable si el formato no es válido.
 */
export function resolveFormats(format: string): ImageFormat[] {
  if (!VALID_EXPORT_FORMATS.includes(format as ExportFormat)) {
    throw new Error(
      `Formato de exportación inválido: "${format}". ` +
        `Valores permitidos: ${VALID_EXPORT_FORMATS.join(' | ')}.`
    );
  }
  return format === 'both' ? ['svg', 'png'] : [format as ImageFormat];
}

/**
 * Arma el plan de exportación: por cada diagrama disponible, los formatos
 * pedidos y la ruta de cada archivo de salida dentro de `outDir`. Puro y
 * determinístico (testeable sin navegador).
 */
export function buildExportPlan(
  data: ProgressData,
  outDir: string,
  format: string
): ExportPlanEntry[] {
  const formats = resolveFormats(format);
  return buildDiagramExports(data).map((d) => ({
    ...d,
    formats,
    outputs: formats.map((f) => ({
      format: f,
      path: join(outDir, `${d.basename}.${f}`),
    })),
  }));
}

/** Ruta del directorio de salida por defecto, resuelta desde el cwd. */
export function defaultExportDir(): string {
  return resolve(process.cwd(), ...DEFAULT_EXPORT_DIR);
}

export interface ExportDiagramsOptions {
  /** Datos ya cargados y validados de `progress.json`. */
  data: ProgressData;
  /** Directorio de salida. Por defecto `docs/progress-map/` del cwd. */
  outDir?: string;
  /** Formato pedido. Por defecto `both`. */
  format?: string;
}

export interface ExportDiagramsResult {
  outDir: string;
  written: RenderedFile[];
}

/**
 * Exporta los diagramas a disco. Crea el directorio de salida si falta y delega
 * el render en `@fractal/progress-export` (import perezoso). No escribe ni valida
 * `MAPA_DE_PROGRESO.md`.
 */
export async function exportDiagrams(
  options: ExportDiagramsOptions
): Promise<ExportDiagramsResult> {
  const outDir = options.outDir ?? defaultExportDir();
  const format = options.format ?? 'both';
  const plan = buildExportPlan(options.data, outDir, format);

  await mkdir(outDir, { recursive: true });

  const requests: RenderRequest[] = plan.map((entry) => ({
    id: `fractal-${entry.basename}`,
    label: entry.label,
    mermaid: entry.mermaid,
    targets: entry.outputs,
  }));

  // Import perezoso: solo cargamos el renderer (y su Chromium/Mermaid) cuando
  // realmente se exporta, manteniendo liviano el resto del CLI.
  const { renderDiagrams } = await import('@fractal/progress-export');
  const written = await renderDiagrams(requests);

  return { outDir, written };
}
