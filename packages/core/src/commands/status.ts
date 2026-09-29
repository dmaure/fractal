import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import chalk from 'chalk';
import type {
  ProgressData,
  Milestone,
  Capacidades,
  CapacidadNodo,
  StatusSummary,
  Estado,
} from '../types/progress.js';
import { isValidTaskStatus, VALID_STATUSES } from '../types/progress.js';
import type { StatusCommandOptions } from '../types/status-command.js';
import { regenerateMap } from './progress-map.js';

/**
 * Glifos y etiquetas por estado. Idénticos a los de `scripts/progress-map.js`
 * (`printSummary`), para que `fractal status` y `pnpm progress` muestren el
 * mismo resumen (SPEC-0031, FRA-46).
 */
const GLYPHS: Record<Estado, string> = {
  completado: '✅',
  en_curso: '🟡',
  pendiente: '⬜',
};

const ESTADO_LABEL: Record<Estado, string> = {
  completado: 'Completado',
  en_curso: 'En curso',
  pendiente: 'Pendiente',
};

/**
 * Ruta de la fuente de verdad, relativa a la raíz del proyecto actual.
 */
const PROGRESS_RELATIVE_PATH = ['docs', 'progress.json'] as const;

/**
 * Ruta del mapa visual, relativa a la raíz del proyecto actual.
 */
const MAPA_RELATIVE_PATH = ['docs', 'MAPA_DE_PROGRESO.md'] as const;

/**
 * Comando `fractal status`.
 *
 * Lee `docs/progress.json` del proyecto actual y muestra el mismo resumen
 * legible que `pnpm progress` (`scripts/progress-map.js`): el roadmap por
 * milestone y el conteo/porcentaje por estado.
 *
 * Con `--write` (modo escritura, SPEC-0031 AC-3 / FRA-47) además regenera, de
 * forma idempotente, el Diagrama 1 (milestones) y el Diagrama 2 (capacidades y
 * módulos) de `docs/MAPA_DE_PROGRESO.md`, usando el mismo núcleo compartido que
 * `pnpm progress` (`./progress-map.ts`) para que ambos caminos no diverjan.
 *
 * Cumple SPEC-0031 AC-1 y AC-2 sobre el shape real de la fuente de verdad
 * (`{ id, nombre, entregable, estado }` + `capacidades` opcional):
 * - Parsea `docs/progress.json` con validación estricta
 * - Estados válidos: completado | en_curso | pendiente
 * - Mensajes de error accionables
 */
export async function statusCommand(
  options: StatusCommandOptions = {}
): Promise<void> {
  const progressPath = resolve(process.cwd(), ...PROGRESS_RELATIVE_PATH);

  let progressData: ProgressData;

  try {
    progressData = await loadProgressFile(progressPath);
  } catch (error) {
    handleLoadError(error, progressPath);
    process.exit(1);
  }

  displaySummary(progressData);

  if (options.write) {
    await regenerateDiagrams(progressData);
  }
}

/**
 * Modo escritura: regenera los diagramas del mapa desde los datos ya cargados
 * y validados. Delega la lógica de dominio en `./progress-map.ts` (única fuente
 * de verdad, compartida con `pnpm progress`). Idempotente (AC-3): una segunda
 * corrida no produce diff.
 */
async function regenerateDiagrams(data: ProgressData): Promise<void> {
  const mapaPath = resolve(process.cwd(), ...MAPA_RELATIVE_PATH);

  try {
    const { changed, inSync } = await regenerateMap({ mapaPath, data });

    if (inSync) {
      console.log(
        '✅ Los diagramas ya estaban sincronizados; no hubo cambios en docs/MAPA_DE_PROGRESO.md.'
      );
      return;
    }

    console.log(
      `✅ Diagramas regenerados en docs/MAPA_DE_PROGRESO.md desde docs/progress.json: ${changed.join(', ')}.`
    );
  } catch (error) {
    handleRegenerateError(error, mapaPath);
    process.exit(1);
  }
}

/**
 * Carga y valida `docs/progress.json`.
 */
async function loadProgressFile(path: string): Promise<ProgressData> {
  let content: string;

  try {
    content = await readFile(path, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('FILE_NOT_FOUND');
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('INVALID_JSON');
  }

  validateProgressData(parsed);

  return parsed as ProgressData;
}

/**
 * Valida la estructura de `docs/progress.json`.
 *
 * `milestones` es obligatorio (arreglo no vacío) y `capacidades` es opcional;
 * cuando está presente se valida su forma. Alineado con la validación de
 * `scripts/progress-map.js` para no divergir de la fuente de verdad.
 */
function validateProgressData(data: unknown): asserts data is ProgressData {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('INVALID_STRUCTURE: root must be object');
  }

  if (!('milestones' in data)) {
    throw new Error('INVALID_STRUCTURE: missing "milestones" field');
  }

  const { milestones } = data as { milestones: unknown };

  if (!Array.isArray(milestones)) {
    throw new Error('INVALID_STRUCTURE: "milestones" must be array');
  }

  if (milestones.length === 0) {
    throw new Error('INVALID_STRUCTURE: "milestones" must not be empty');
  }

  milestones.forEach((milestone, idx) => {
    if (typeof milestone !== 'object' || milestone === null) {
      throw new Error(`INVALID_STRUCTURE: milestone[${idx}] must be object`);
    }

    for (const field of ['id', 'nombre', 'entregable'] as const) {
      if (!(field in milestone) || typeof milestone[field] !== 'string') {
        throw new Error(
          `INVALID_STRUCTURE: milestone[${idx}].${field} must be string`
        );
      }
    }

    if (!('estado' in milestone)) {
      throw new Error(
        `INVALID_STRUCTURE: milestone[${idx}].estado is required`
      );
    }

    if (!isValidTaskStatus(milestone.estado)) {
      throw new Error(
        `INVALID_STATUS: milestone[${idx}].estado "${milestone.estado}" is not valid. ` +
          `Valid statuses: ${VALID_STATUSES.join(', ')}`
      );
    }
  });

  if ('capacidades' in data && (data as ProgressData).capacidades !== undefined) {
    validateCapacidades((data as { capacidades: unknown }).capacidades);
  }
}

/**
 * Valida el bloque opcional `capacidades` (Diagrama 2).
 */
function validateCapacidades(cap: unknown): asserts cap is Capacidades {
  if (typeof cap !== 'object' || cap === null || Array.isArray(cap)) {
    throw new Error('INVALID_STRUCTURE: "capacidades" must be object');
  }

  const { grupos, nodos, aristas } = cap as {
    grupos?: unknown;
    nodos?: unknown;
    aristas?: unknown;
  };

  const validarNodo = (nodo: unknown, contexto: string): void => {
    if (
      typeof nodo !== 'object' ||
      nodo === null ||
      typeof (nodo as CapacidadNodo).id !== 'string' ||
      typeof (nodo as CapacidadNodo).label !== 'string'
    ) {
      throw new Error(
        `INVALID_STRUCTURE: "capacidades" node in ${contexto} must have string "id" and "label"`
      );
    }
    if (!isValidTaskStatus((nodo as CapacidadNodo).estado)) {
      throw new Error(
        `INVALID_STATUS: "capacidades" node "${(nodo as CapacidadNodo).id}" estado is not valid. ` +
          `Valid statuses: ${VALID_STATUSES.join(', ')}`
      );
    }
  };

  if (grupos !== undefined) {
    if (!Array.isArray(grupos)) {
      throw new Error('INVALID_STRUCTURE: "capacidades.grupos" must be array');
    }
    grupos.forEach((grupo, idx) => {
      if (
        typeof grupo !== 'object' ||
        grupo === null ||
        typeof grupo.id !== 'string' ||
        typeof grupo.titulo !== 'string' ||
        !Array.isArray(grupo.nodos)
      ) {
        throw new Error(
          `INVALID_STRUCTURE: "capacidades.grupos[${idx}]" must have string "id", "titulo" and array "nodos"`
        );
      }
      grupo.nodos.forEach((nodo: unknown) => validarNodo(nodo, `grupos[${idx}]`));
    });
  }

  if (nodos !== undefined) {
    if (!Array.isArray(nodos)) {
      throw new Error('INVALID_STRUCTURE: "capacidades.nodos" must be array');
    }
    nodos.forEach((nodo) => validarNodo(nodo, 'nodos'));
  }

  if (aristas !== undefined) {
    if (!Array.isArray(aristas)) {
      throw new Error('INVALID_STRUCTURE: "capacidades.aristas" must be array');
    }
    aristas.forEach((arista, idx) => {
      if (
        !Array.isArray(arista) ||
        arista.length !== 2 ||
        arista.some((x) => typeof x !== 'string')
      ) {
        throw new Error(
          `INVALID_STRUCTURE: "capacidades.aristas[${idx}]" must be a ["origen", "destino"] pair`
        );
      }
    });
  }
}

/**
 * Calcula el conteo por estado a partir de los milestones.
 */
function calculateSummary(milestones: Milestone[]): StatusSummary {
  const summary: StatusSummary = {
    completado: 0,
    en_curso: 0,
    pendiente: 0,
    total: milestones.length,
  };

  for (const milestone of milestones) {
    summary[milestone.estado]++;
  }

  return summary;
}

/**
 * Muestra el resumen del estado del proyecto.
 *
 * Reproduce el formato de `printSummary` de `scripts/progress-map.js` para que
 * `fractal status` y `pnpm progress` sean consistentes (FRA-46).
 */
function displaySummary(data: ProgressData): void {
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

  const summary = calculateSummary(milestones);
  for (const estado of VALID_STATUSES) {
    const count = summary[estado];
    const pct =
      summary.total > 0 ? Math.round((count / summary.total) * 100) : 0;
    console.log(
      `${GLYPHS[estado]} ${ESTADO_LABEL[estado]}: ${count}/${summary.total} (${pct}%)`
    );
  }

  console.log('');
}

/**
 * Maneja errores de carga con mensajes accionables.
 */
function handleLoadError(error: unknown, path: string): void {
  const message = error instanceof Error ? error.message : String(error);

  if (message === 'FILE_NOT_FOUND') {
    console.error(
      chalk.red(
        `\n❌ Error: No se encontró docs/progress.json\n\n` +
          `   Ubicación esperada: ${chalk.dim(path)}\n\n` +
          `   ${chalk.yellow('→')} Crea el archivo docs/progress.json en la raíz del proyecto.\n`
      )
    );
    return;
  }

  if (message === 'INVALID_JSON') {
    console.error(
      chalk.red(
        `\n❌ Error: docs/progress.json no es un JSON válido\n\n` +
          `   Archivo: ${chalk.dim(path)}\n\n` +
          `   ${chalk.yellow('→')} Verifica la sintaxis JSON (comillas, comas, llaves).\n`
      )
    );
    return;
  }

  if (message.startsWith('INVALID_STRUCTURE:')) {
    const detail = message.replace('INVALID_STRUCTURE: ', '');
    console.error(
      chalk.red(
        `\n❌ Error: Estructura inválida en docs/progress.json\n\n` +
          `   ${detail}\n\n` +
          `   ${chalk.yellow('→')} Verifica que el archivo tenga la estructura esperada:\n` +
          `      { "milestones": [ { "id": "...", "nombre": "...", "entregable": "...", "estado": "..." } ] }\n`
      )
    );
    return;
  }

  if (message.startsWith('INVALID_STATUS:')) {
    const detail = message.replace('INVALID_STATUS: ', '');
    console.error(
      chalk.red(
        `\n❌ Error: Estado inválido en docs/progress.json\n\n` + `   ${detail}\n`
      )
    );
    return;
  }

  console.error(
    chalk.red(
      `\n❌ Error inesperado al leer docs/progress.json\n\n` + `   ${message}\n`
    )
  );
}

/**
 * Maneja errores de la regeneración del mapa (modo `--write`) con mensajes
 * accionables: archivo del mapa ausente o marcadores faltantes/invertidos
 * (SPEC-0031 AC-5). El núcleo compartido ya lanza mensajes claros; acá se les
 * da el mismo formato en rojo que el resto del comando.
 */
function handleRegenerateError(error: unknown, path: string): void {
  if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
    console.error(
      chalk.red(
        `\n❌ Error: No se encontró docs/MAPA_DE_PROGRESO.md\n\n` +
          `   Ubicación esperada: ${chalk.dim(path)}\n\n` +
          `   ${chalk.yellow('→')} Crea el documento con los marcadores de auto-generación,\n` +
          `      o ejecuta 'fractal status' sin '--write' para solo ver el resumen.\n`
      )
    );
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(
    chalk.red(
      `\n❌ Error al regenerar los diagramas de docs/MAPA_DE_PROGRESO.md\n\n` +
        `   ${message}\n`
    )
  );
}
