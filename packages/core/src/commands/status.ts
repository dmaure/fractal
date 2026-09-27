import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import chalk from 'chalk';
import type {
  ProgressData,
  Milestone,
  MilestoneStats,
  TaskStatus,
} from '../types/progress.js';
import { isValidTaskStatus, VALID_STATUSES } from '../types/progress.js';

/**
 * Comando `fractal status`.
 *
 * Lee progress.json del proyecto actual y muestra un resumen legible
 * milestone por milestone, con conteo y porcentaje por estado.
 *
 * Cumple SPEC-0031 AC-1 y AC-2:
 * - Parsea progress.json con validación estricta
 * - Muestra resumen por milestone
 * - Estados válidos: completado | en_curso | pendiente
 * - Mensajes de error accionables
 */
export async function statusCommand(): Promise<void> {
  const progressPath = resolve(process.cwd(), 'progress.json');

  let progressData: ProgressData;

  try {
    progressData = await loadProgressFile(progressPath);
  } catch (error) {
    handleLoadError(error, progressPath);
    process.exit(1);
  }

  const stats = calculateStats(progressData);

  displayStatus(stats);
}

/**
 * Carga y valida progress.json
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
 * Valida la estructura de progress.json
 */
function validateProgressData(data: unknown): asserts data is ProgressData {
  if (typeof data !== 'object' || data === null) {
    throw new Error('INVALID_STRUCTURE: root must be object');
  }

  if (!('milestones' in data)) {
    throw new Error('INVALID_STRUCTURE: missing "milestones" field');
  }

  const { milestones } = data as { milestones: unknown };

  if (!Array.isArray(milestones)) {
    throw new Error('INVALID_STRUCTURE: "milestones" must be array');
  }

  milestones.forEach((milestone, idx) => {
    if (typeof milestone !== 'object' || milestone === null) {
      throw new Error(
        `INVALID_STRUCTURE: milestone[${idx}] must be object`
      );
    }

    if (!('name' in milestone) || typeof milestone.name !== 'string') {
      throw new Error(
        `INVALID_STRUCTURE: milestone[${idx}].name must be string`
      );
    }

    if (!('tasks' in milestone) || !Array.isArray(milestone.tasks)) {
      throw new Error(
        `INVALID_STRUCTURE: milestone[${idx}].tasks must be array`
      );
    }

    milestone.tasks.forEach((task: unknown, taskIdx: number) => {
      if (typeof task !== 'object' || task === null) {
        throw new Error(
          `INVALID_STRUCTURE: milestone[${idx}].tasks[${taskIdx}] must be object`
        );
      }

      if (!('name' in task) || typeof task.name !== 'string') {
        throw new Error(
          `INVALID_STRUCTURE: milestone[${idx}].tasks[${taskIdx}].name must be string`
        );
      }

      if (!('status' in task)) {
        throw new Error(
          `INVALID_STRUCTURE: milestone[${idx}].tasks[${taskIdx}].status is required`
        );
      }

      if (!isValidTaskStatus(task.status)) {
        throw new Error(
          `INVALID_STATUS: milestone[${idx}].tasks[${taskIdx}].status "${task.status}" is not valid. ` +
            `Valid statuses: ${VALID_STATUSES.join(', ')}`
        );
      }
    });
  });
}

/**
 * Calcula estadísticas por milestone
 */
function calculateStats(data: ProgressData): MilestoneStats[] {
  return data.milestones.map((milestone: Milestone) => {
    const stats: MilestoneStats = {
      name: milestone.name,
      completado: 0,
      en_curso: 0,
      pendiente: 0,
      total: milestone.tasks.length,
    };

    milestone.tasks.forEach((task) => {
      stats[task.status]++;
    });

    return stats;
  });
}

/**
 * Muestra el resumen de estado en terminal
 */
function displayStatus(stats: MilestoneStats[]): void {
  console.log(chalk.blue('\n📊 Estado del proyecto\n'));

  if (stats.length === 0) {
    console.log(chalk.dim('   No hay milestones definidos\n'));
    return;
  }

  stats.forEach((milestone) => {
    console.log(chalk.bold(`${milestone.name}`));

    if (milestone.total === 0) {
      console.log(chalk.dim('   Sin tareas\n'));
      return;
    }

    const completadoPct = ((milestone.completado / milestone.total) * 100).toFixed(1);
    const enCursoPct = ((milestone.en_curso / milestone.total) * 100).toFixed(1);
    const pendientePct = ((milestone.pendiente / milestone.total) * 100).toFixed(1);

    console.log(
      `   ${chalk.green('✓')} Completado: ${chalk.bold(milestone.completado.toString())} (${completadoPct}%)`
    );
    console.log(
      `   ${chalk.yellow('◷')} En curso:   ${chalk.bold(milestone.en_curso.toString())} (${enCursoPct}%)`
    );
    console.log(
      `   ${chalk.dim('○')} Pendiente:  ${chalk.bold(milestone.pendiente.toString())} (${pendientePct}%)`
    );
    console.log(chalk.dim(`   Total:      ${milestone.total}`));
    console.log();
  });
}

/**
 * Maneja errores de carga con mensajes accionables
 */
function handleLoadError(error: unknown, path: string): void {
  const message = error instanceof Error ? error.message : String(error);

  if (message === 'FILE_NOT_FOUND') {
    console.error(
      chalk.red(
        `\n❌ Error: No se encontró progress.json\n\n` +
          `   Ubicación esperada: ${chalk.dim(path)}\n\n` +
          `   ${chalk.yellow('→')} Crea el archivo progress.json en la raíz del proyecto.\n`
      )
    );
    return;
  }

  if (message === 'INVALID_JSON') {
    console.error(
      chalk.red(
        `\n❌ Error: progress.json no es un JSON válido\n\n` +
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
        `\n❌ Error: Estructura inválida en progress.json\n\n` +
          `   ${detail}\n\n` +
          `   ${chalk.yellow('→')} Verifica que el archivo tenga la estructura esperada:\n` +
          `      { "milestones": [ { "name": "...", "tasks": [ { "name": "...", "status": "..." } ] } ] }\n`
      )
    );
    return;
  }

  if (message.startsWith('INVALID_STATUS:')) {
    const detail = message.replace('INVALID_STATUS: ', '');
    console.error(
      chalk.red(
        `\n❌ Error: Estado inválido en progress.json\n\n` +
          `   ${detail}\n`
      )
    );
    return;
  }

  console.error(
    chalk.red(
      `\n❌ Error inesperado al leer progress.json\n\n` +
        `   ${message}\n`
    )
  );
}
