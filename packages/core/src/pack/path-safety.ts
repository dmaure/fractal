/**
 * Resolución segura de rutas del pack de convenciones.
 *
 * Dado el root de un proyecto y una ruta relativa del pack, resuelve la ruta
 * absoluta destino y la contiene dentro del root. Rechaza, con un error
 * tipado y explícito, cualquier ruta que:
 *
 * - sea absoluta;
 * - contenga un segmento `..`;
 * - escape del root una vez resuelta (comprobación por `path.relative`).
 *
 * Agnóstico de framework (Artículo II): solo opera sobre rutas y el root del
 * proyecto, sin conocer el stack destino.
 *
 * @see SPEC-0007 AC-4
 */

import { isAbsolute, relative, resolve, sep } from 'node:path';

/** Motivo por el que una ruta del pack fue rechazada. */
export type PackPathErrorReason = 'absolute' | 'parent-traversal' | 'escapes-root';

/**
 * Error tipado al resolver una ruta insegura del pack.
 *
 * Nombra siempre la ruta ofensora y el motivo, para que el fallo sea
 * accionable y no deje lugar a ambigüedad (AC-4).
 */
export class PackPathError extends Error {
  /** La ruta relativa (cruda) que disparó el rechazo. */
  readonly offendingPath: string;
  /** El motivo estructurado del rechazo. */
  readonly reason: PackPathErrorReason;

  constructor(offendingPath: string, reason: PackPathErrorReason, message: string) {
    super(message);
    this.name = 'PackPathError';
    this.offendingPath = offendingPath;
    this.reason = reason;
  }
}

/** True si la ruta POSIX/Win contiene un segmento exactamente igual a `..`. */
function hasParentTraversalSegment(relPath: string): boolean {
  return relPath
    .split(/[\\/]/)
    .some((segment) => segment === '..');
}

/**
 * Resuelve una ruta relativa del pack dentro de `projectRoot`, devolviendo la
 * ruta absoluta segura.
 *
 * Es fail-fast: lanza {@link PackPathError} ante la primera violación detectada
 * (absoluta → `..` → escape de root), de modo que un caller puede validar todas
 * las rutas antes de escribir ningún archivo.
 *
 * @param projectRoot - Root del proyecto (se resuelve a absoluto).
 * @param relativePackPath - Ruta relativa del archivo del pack.
 * @returns La ruta absoluta contenida dentro del root.
 * @throws {PackPathError} Si la ruta es absoluta, contiene `..` o escapa del root.
 */
export function resolveSafePackPath(
  projectRoot: string,
  relativePackPath: string
): string {
  if (isAbsolute(relativePackPath)) {
    throw new PackPathError(
      relativePackPath,
      'absolute',
      `Unsafe pack path "${relativePackPath}": absolute paths are not allowed.`
    );
  }

  if (hasParentTraversalSegment(relativePackPath)) {
    throw new PackPathError(
      relativePackPath,
      'parent-traversal',
      `Unsafe pack path "${relativePackPath}": parent-directory segments (..) are not allowed.`
    );
  }

  const root = resolve(projectRoot);
  const absTarget = resolve(root, relativePackPath);
  const rel = relative(root, absTarget);

  // `rel` vacío significa el root mismo (no es un archivo); un `..` inicial o una
  // ruta absoluta significan que la resolución escapó del root.
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new PackPathError(
      relativePackPath,
      'escapes-root',
      `Unsafe pack path "${relativePackPath}": resolves outside the project root.`
    );
  }

  return absTarget;
}
