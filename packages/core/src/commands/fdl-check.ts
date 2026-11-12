/**
 * Comando `fractal fdl check <path>`.
 *
 * Valida un archivo FDL como contrato del dominio (SPEC-0007 AC-1), reutilizando
 * el parser + validador existentes (`diagnoseFdl`, VR-1..VR-12). Imprime cada
 * violación como `{rule, path, message}` legible y sale con código 0 si el FDL
 * es válido o distinto de 0 si es inválido (o si el archivo no se puede leer).
 *
 * Agnóstico de framework (Artículo II): solo conoce el FDL abstracto.
 *
 * @see SPEC-0007 AC-1
 */

import { readFile } from 'node:fs/promises';
import chalk from 'chalk';
import { diagnoseFdl } from '../fdl/diagnostics.js';
import type { FdlDiagnostic } from '../fdl/diagnostics.js';

/** Resultado de chequear el texto fuente de un FDL. */
export interface FdlCheckResult {
  /** `true` sii el documento es un FDL válido (sin diagnósticos). */
  ok: boolean;
  /** Diagnósticos crudos (uno por violación de forma o semántica). */
  diagnostics: FdlDiagnostic[];
  /** Reporte legible, una línea por violación (o un OK). */
  report: string;
}

/**
 * Formatea un diagnóstico como `{rule, path, message}` legible.
 * `rule` es el código VR-x (o el código de forma del parser) y `message` ya
 * incluye el localizador humano.
 */
function formatViolation(d: FdlDiagnostic): string {
  return `  • {rule: ${d.code}, path: ${d.location.path}}\n    ${d.message}`;
}

/**
 * Chequea el texto fuente de un FDL y arma el reporte legible.
 *
 * Función pura (no toca disco ni el proceso): se usa desde el comando y es
 * directamente testeable.
 *
 * @param source - Texto JSON del documento FDL.
 * @returns El resultado con `ok`, los diagnósticos y el reporte legible.
 */
export function checkFdlSource(source: string): FdlCheckResult {
  const diagnostics = diagnoseFdl(source);

  if (diagnostics.length === 0) {
    return { ok: true, diagnostics, report: 'FDL válido: sin violaciones.' };
  }

  const header = `FDL inválido: ${diagnostics.length} violación(es):`;
  const lines = diagnostics.map(formatViolation);
  return { ok: false, diagnostics, report: [header, ...lines].join('\n') };
}

/**
 * Ejecuta `fractal fdl check <path>`: lee el archivo, lo valida e imprime el
 * reporte, saliendo con código 0 (válido) o 1 (inválido / error de lectura).
 *
 * @param filePath - Ruta al archivo FDL (`*.fdl.json`).
 */
export async function fdlCheckCommand(filePath: string): Promise<void> {
  let source: string;
  try {
    source = await readFile(filePath, 'utf-8');
  } catch (error) {
    console.error(
      chalk.red(
        `\n❌ No se pudo leer el archivo FDL "${filePath}": ${error instanceof Error ? error.message : String(error)}`
      )
    );
    process.exit(1);
  }

  const result = checkFdlSource(source);

  if (result.ok) {
    console.log(chalk.green(`✅ ${result.report}`));
    process.exit(0);
  }

  console.error(chalk.red(`\n❌ ${result.report}`));
  process.exit(1);
}
