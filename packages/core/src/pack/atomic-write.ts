/**
 * Escritura atómica de archivos del pack.
 *
 * Escribe a un archivo temporal en el MISMO directorio que el destino y luego
 * hace `rename` sobre el destino (operación atómica dentro de un filesystem).
 * Ante cualquier error limpia el temporal y repropaga, de modo que nunca queda
 * un archivo parcial ni un destino a medias.
 *
 * Agnóstico de framework (Artículo II): solo escribe bytes en rutas.
 *
 * @see SPEC-0007 AC-5
 */

import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Operaciones de filesystem inyectables.
 *
 * El default usa `node:fs/promises`. Se inyectan en tests para simular un fallo
 * a mitad de la escritura (p. ej. un `rename` que lanza) y verificar que no
 * queda un temporal parcial ni se crea el destino (AC-5).
 */
export interface AtomicWriteFsDeps {
  mkdir: typeof mkdir;
  writeFile: typeof writeFile;
  rename: typeof rename;
  rm: typeof rm;
}

const DEFAULT_FS_DEPS: AtomicWriteFsDeps = { mkdir, writeFile, rename, rm };

/** Contador de proceso para dar un sufijo temporal único entre llamadas concurrentes. */
let tmpCounter = 0;

/**
 * Escribe `contents` en `absPath` de forma atómica (tmp + rename).
 *
 * Garantías:
 * - crea el directorio padre si no existe (`mkdir -p`);
 * - escribe primero a `${absPath}.<pid>.<n>.tmp` en el mismo directorio;
 * - promueve el temporal al destino con `rename` (atómico);
 * - ante cualquier error, borra el temporal y repropaga el error, dejando el
 *   destino intacto (sin archivo parcial).
 *
 * @param absPath - Ruta absoluta del archivo destino.
 * @param contents - Contenido a escribir.
 * @param deps - Operaciones de filesystem (default: `node:fs/promises`).
 */
export async function writeFileAtomic(
  absPath: string,
  contents: string,
  deps: AtomicWriteFsDeps = DEFAULT_FS_DEPS
): Promise<void> {
  const dir = dirname(absPath);
  const tmpPath = `${absPath}.${process.pid}.${tmpCounter++}.tmp`;

  await deps.mkdir(dir, { recursive: true });

  try {
    await deps.writeFile(tmpPath, contents);
    await deps.rename(tmpPath, absPath);
  } catch (error) {
    // Limpiar el temporal sin enmascarar el error original.
    await deps.rm(tmpPath, { force: true }).catch(() => {});
    throw error;
  }
}
