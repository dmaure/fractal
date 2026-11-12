/**
 * Escritura del pack de convenciones en un proyecto.
 *
 * Valida TODAS las rutas antes de escribir nada (ruta segura, AC-4), soporta
 * `--dry-run` (planifica sin tocar disco, AC-6) y, en modo real, escribe cada
 * archivo de forma atómica (AC-5). Devuelve siempre la lista de rutas
 * (relativas) planificadas o escritas, para que el caller las imprima.
 *
 * Agnóstico de framework (Artículo II): los contenidos del pack son dato opaco;
 * este módulo solo los escribe. El texto específico del stack vive en el
 * adapter.
 *
 * @see SPEC-0007 AC-4, AC-5, AC-6, AC-8
 */

import { writeFileAtomic } from './atomic-write.js';
import { resolveSafePackPath } from './path-safety.js';

/** Un archivo del pack: su ruta relativa al root del proyecto y su contenido. */
export interface PackFile {
  /** Ruta relativa (POSIX) dentro del proyecto. */
  path: string;
  /** Contenido textual del archivo. */
  contents: string;
}

/** Opciones de escritura del pack. */
export interface WritePackOptions {
  /** Si es `true`, no escribe nada: solo planifica las rutas (AC-6). */
  dryRun?: boolean;
}

/**
 * Escribe (o planifica) el pack de convenciones en `projectRoot`.
 *
 * Flujo:
 * 1. Valida TODAS las rutas con {@link resolveSafePackPath}; si alguna es
 *    insegura, lanza antes de escribir cualquier archivo (AC-4).
 * 2. Si `dryRun`, no toca disco y devuelve las rutas relativas planificadas.
 * 3. Si no, escribe cada archivo de forma atómica (AC-5) y devuelve las rutas.
 *
 * @param projectRoot - Root del proyecto destino.
 * @param files - Archivos del pack a escribir.
 * @param options - Opciones (p. ej. `dryRun`).
 * @returns Las rutas relativas planificadas o escritas, en el orden recibido.
 * @throws {import('./path-safety.js').PackPathError} Si alguna ruta es insegura.
 */
export async function writePack(
  projectRoot: string,
  files: PackFile[],
  options: WritePackOptions = {}
): Promise<string[]> {
  // Fase 1: validar TODAS las rutas antes de escribir nada (fail-fast, AC-4).
  const targets = files.map((file) => ({
    relativePath: file.path,
    absPath: resolveSafePackPath(projectRoot, file.path),
    contents: file.contents,
  }));

  // Fase 2: dry-run no toca disco (AC-6).
  if (options.dryRun === true) {
    return targets.map((t) => t.relativePath);
  }

  // Fase 3: escritura atómica archivo por archivo (AC-5).
  for (const target of targets) {
    await writeFileAtomic(target.absPath, target.contents);
  }

  return targets.map((t) => t.relativePath);
}
