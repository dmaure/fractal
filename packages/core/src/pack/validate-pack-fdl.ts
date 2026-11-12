/**
 * Gate de contrato FDL del pack de convenciones.
 *
 * Encuentra el/los archivo(s) FDL del pack (`*.fdl.json`), los parsea con
 * `parseFdl` y los valida con `validateFdl` (reutilizando el validador
 * existente, VR-1..VR-12). Si alguno es inválido, reúne TODAS las violaciones
 * y lanza un error que las lista, bloqueando la escritura del pack.
 *
 * Agnóstico de framework (Artículo II): el contenido del pack se trata como
 * dato opaco; solo se interpreta como FDL abstracto.
 *
 * @see SPEC-0007 AC-1
 */

import { parseFdl, FdlParseError } from '../fdl/parser.js';
import { validateFdl } from '../fdl/validator.js';
import type { FdlValidationRule } from '../fdl/validator.js';
import type { PackFile } from './write-pack.js';

/** Sufijo que identifica un archivo FDL dentro del pack. */
const FDL_FILE_SUFFIX = '.fdl.json';

/** Una violación del contrato FDL de un archivo del pack, localizada. */
export interface PackFdlViolation {
  /** Ruta (relativa) del archivo del pack que incumple. */
  file: string;
  /** La regla VR-x incumplida, o el código de error de forma del parser. */
  rule: FdlValidationRule | string;
  /** Ubicación máquina dentro del documento (p. ej. `entities[0].fields[1]`). */
  path: string;
  /** Mensaje legible de la violación. */
  message: string;
}

/**
 * Error del gate de contrato FDL del pack.
 *
 * Expone TODAS las violaciones acumuladas (no fail-fast por documento) para que
 * el caller pueda reportarlas juntas y bloquear la escritura (AC-1).
 */
export class PackFdlValidationError extends Error {
  readonly violations: PackFdlViolation[];

  constructor(violations: PackFdlViolation[]) {
    const detail = violations
      .map((v) => `  - [${v.rule}] ${v.file}: ${v.message} (${v.path})`)
      .join('\n');
    super(`El pack contiene FDL inválido:\n${detail}`);
    this.name = 'PackFdlValidationError';
    this.violations = violations;
  }
}

/** True si el archivo del pack es un documento FDL por su ruta. */
export function isFdlPackFile(file: PackFile): boolean {
  return file.path.endsWith(FDL_FILE_SUFFIX);
}

/**
 * Valida todos los archivos FDL del pack.
 *
 * Parsea y valida cada `*.fdl.json`. Un error de forma produce una violación de
 * parseo; un documento bien formado pero semánticamente inválido produce una
 * violación por cada VR-x incumplida. Devuelve la lista completa (vacía si todo
 * es válido).
 *
 * @param files - Archivos del pack.
 * @returns Todas las violaciones encontradas, en orden de archivo y de regla.
 */
export function collectPackFdlViolations(files: PackFile[]): PackFdlViolation[] {
  const violations: PackFdlViolation[] = [];

  for (const file of files) {
    if (!isFdlPackFile(file)) continue;

    let doc;
    try {
      doc = parseFdl(file.contents);
    } catch (error) {
      if (error instanceof FdlParseError) {
        violations.push({
          file: file.path,
          rule: error.code,
          path: error.path,
          message: error.message,
        });
        continue;
      }
      throw error;
    }

    const result = validateFdl(doc);
    for (const v of result.violations) {
      violations.push({
        file: file.path,
        rule: v.rule,
        path: v.path,
        message: v.message,
      });
    }
  }

  return violations;
}

/**
 * Gate AC-1: valida el FDL del pack y lanza si hay cualquier violación.
 *
 * @param files - Archivos del pack.
 * @throws {PackFdlValidationError} Si algún `*.fdl.json` es inválido.
 */
export function assertPackFdlValid(files: PackFile[]): void {
  const violations = collectPackFdlViolations(files);
  if (violations.length > 0) {
    throw new PackFdlValidationError(violations);
  }
}
