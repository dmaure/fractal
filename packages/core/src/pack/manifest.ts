/**
 * Manifiesto declarativo del pack de convenciones (SPEC-0007, FRA-104).
 *
 * El manifiesto es el 4º archivo del pack: declara, en una sola pasada y de
 * forma agnóstica (Artículo II), qué convenciones, framework, topología y datos
 * consume el agente del proyecto. El core define la forma abstracta
 * (`PackManifest`), lo serializa de forma determinista a un `PackFile` y lo
 * valida (campos requeridos + cross-check de que las rutas declaradas existen
 * en el pack). Los valores concretos del stack (el adapter, el nombre legible,
 * la topología) los aporta el adapter; acá no vive ninguna cadena de framework.
 *
 * @see SPEC-0007
 */

import type { PackFile } from './write-pack.js';

/** Versión del esquema del manifiesto. */
export const PACK_MANIFEST_VERSION = '1';

/** Ruta (relativa, POSIX) del manifiesto dentro del pack. */
export const PACK_MANIFEST_PATH = 'fractal/manifest.json';

/** Declaración del framework que consume el agente (valores los pone el adapter). */
export interface PackManifestFramework {
  /** Identificador del adapter/target que produjo el pack. */
  adapter: string;
  /** Nombre legible del stack para humanos. */
  name: string;
}

/** Declaración de los datos (contrato de dominio) que consume el agente. */
export interface PackManifestData {
  /** Ruta (relativa al pack) del documento FDL del dominio. */
  fdl: string;
}

/**
 * Manifiesto del pack/proyecto: declara las cuatro aristas que consume el
 * agente — convenciones, framework, topología y datos — más los prompts
 * reutilizables. Forma abstracta: sin términos de framework (Artículo II).
 */
export interface PackManifest {
  /** Versión del esquema del manifiesto. */
  manifestVersion: string;
  /** Proyecto descrito por el pack. */
  project: { name: string };
  /** Framework/stack que consume el agente. */
  framework: PackManifestFramework;
  /** Topología declarada del pack. */
  topology: string;
  /** Ruta (relativa al pack) del documento de convenciones. */
  conventions: string;
  /** Datos de dominio (contrato FDL). */
  data: PackManifestData;
  /** Prompts reutilizables del pack (rutas relativas al pack). */
  prompts: string[];
}

/** Una violación del manifiesto del pack, localizada por campo. */
export interface PackManifestViolation {
  /** Campo del manifiesto que incumple (p. ej. `project.name`, `prompts[0]`). */
  field: string;
  /** Mensaje legible de la violación. */
  message: string;
}

/**
 * Error del gate del manifiesto del pack.
 *
 * Expone TODAS las violaciones acumuladas para que el caller pueda reportarlas
 * juntas y bloquear la escritura del pack (simétrico con el gate FDL).
 */
export class PackManifestValidationError extends Error {
  readonly violations: PackManifestViolation[];

  constructor(violations: PackManifestViolation[]) {
    const detail = violations.map((v) => `  - ${v.field}: ${v.message}`).join('\n');
    super(`El manifiesto del pack es inválido:\n${detail}`);
    this.name = 'PackManifestValidationError';
    this.violations = violations;
  }
}

/** True si el archivo del pack es el manifiesto por su ruta. */
export function isManifestPackFile(file: PackFile): boolean {
  return file.path === PACK_MANIFEST_PATH;
}

/**
 * Serializa un `PackManifest` a su `PackFile` determinista.
 *
 * Reconstruye el documento con un orden de claves estable (independiente del
 * orden con que el caller armó el objeto) y lo emite como JSON con indentación
 * de 2 espacios y newline final, igual que el resto de los archivos del pack
 * (AC-8). Mismas entradas ⇒ mismos bytes.
 *
 * @param manifest - El manifiesto abstracto.
 * @returns El archivo del pack (`fractal/manifest.json`) con contenido estable.
 */
export function serializePackManifest(manifest: PackManifest): PackFile {
  const canonical = {
    manifestVersion: manifest.manifestVersion,
    project: { name: manifest.project.name },
    framework: { adapter: manifest.framework.adapter, name: manifest.framework.name },
    topology: manifest.topology,
    conventions: manifest.conventions,
    data: { fdl: manifest.data.fdl },
    prompts: [...manifest.prompts],
  };

  return {
    path: PACK_MANIFEST_PATH,
    contents: `${JSON.stringify(canonical, null, 2)}\n`,
  };
}

/** True si `value` es un string no vacío (tras recortar espacios). */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Valida un manifiesto ya parseado contra las rutas del pack.
 *
 * Comprueba que los campos requeridos estén presentes y bien formados, y hace
 * el cross-check de que `conventions`, `data.fdl` y cada `prompts[]` apunten a
 * un archivo que existe en el pack. Devuelve TODAS las violaciones (vacío si el
 * manifiesto es válido); no lanza.
 *
 * @param manifest - El manifiesto a validar (dato sin tipar; se valida su forma).
 * @param packPaths - Las rutas (relativas) de los archivos del pack.
 * @returns Las violaciones encontradas, en orden de campo.
 */
export function collectPackManifestViolations(
  manifest: unknown,
  packPaths: string[]
): PackManifestViolation[] {
  const violations: PackManifestViolation[] = [];

  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    return [{ field: '(root)', message: 'el manifiesto debe ser un objeto.' }];
  }

  const m = manifest as Record<string, unknown>;
  const known = new Set(packPaths);

  if (!isNonEmptyString(m.manifestVersion)) {
    violations.push({ field: 'manifestVersion', message: 'requerido: string no vacío.' });
  }

  const project = m.project as Record<string, unknown> | undefined;
  if (typeof project !== 'object' || project === null || !isNonEmptyString(project.name)) {
    violations.push({ field: 'project.name', message: 'requerido: string no vacío.' });
  }

  const framework = m.framework as Record<string, unknown> | undefined;
  if (typeof framework !== 'object' || framework === null) {
    violations.push({ field: 'framework', message: 'requerido: objeto con adapter y name.' });
  } else {
    if (!isNonEmptyString(framework.adapter)) {
      violations.push({ field: 'framework.adapter', message: 'requerido: string no vacío.' });
    }
    if (!isNonEmptyString(framework.name)) {
      violations.push({ field: 'framework.name', message: 'requerido: string no vacío.' });
    }
  }

  if (!isNonEmptyString(m.topology)) {
    violations.push({ field: 'topology', message: 'requerido: string no vacío.' });
  }

  if (!isNonEmptyString(m.conventions)) {
    violations.push({ field: 'conventions', message: 'requerido: string no vacío.' });
  } else if (!known.has(m.conventions)) {
    violations.push({
      field: 'conventions',
      message: `apunta a "${m.conventions}", que no está entre los archivos del pack.`,
    });
  }

  const data = m.data as Record<string, unknown> | undefined;
  if (typeof data !== 'object' || data === null || !isNonEmptyString(data.fdl)) {
    violations.push({ field: 'data.fdl', message: 'requerido: string no vacío.' });
  } else if (!known.has(data.fdl)) {
    violations.push({
      field: 'data.fdl',
      message: `apunta a "${data.fdl}", que no está entre los archivos del pack.`,
    });
  }

  if (!Array.isArray(m.prompts)) {
    violations.push({ field: 'prompts', message: 'requerido: arreglo de rutas.' });
  } else {
    m.prompts.forEach((prompt, i) => {
      if (!isNonEmptyString(prompt)) {
        violations.push({ field: `prompts[${i}]`, message: 'cada prompt debe ser un string no vacío.' });
      } else if (!known.has(prompt)) {
        violations.push({
          field: `prompts[${i}]`,
          message: `apunta a "${prompt}", que no está entre los archivos del pack.`,
        });
      }
    });
  }

  return violations;
}

/**
 * Gate FRA-104: valida el manifiesto del pack y lanza si hay cualquier violación.
 *
 * Simétrico con {@link import('./validate-pack-fdl.js').assertPackFdlValid}:
 * busca el manifiesto entre los archivos del pack, lo parsea y lo valida contra
 * las rutas del propio pack (campos requeridos + cross-check). Un manifiesto
 * ausente o con JSON malformado también es una violación que bloquea.
 *
 * @param files - Archivos del pack.
 * @throws {PackManifestValidationError} Si el manifiesto falta, no parsea o es inválido.
 */
export function assertPackManifestValid(files: PackFile[]): void {
  const manifestFile = files.find(isManifestPackFile);

  if (!manifestFile) {
    throw new PackManifestValidationError([
      { field: PACK_MANIFEST_PATH, message: 'el pack no incluye el manifiesto.' },
    ]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestFile.contents);
  } catch (error) {
    throw new PackManifestValidationError([
      {
        field: PACK_MANIFEST_PATH,
        message: `JSON malformado: ${error instanceof Error ? error.message : String(error)}`,
      },
    ]);
  }

  const violations = collectPackManifestViolations(
    parsed,
    files.map((file) => file.path)
  );
  if (violations.length > 0) {
    throw new PackManifestValidationError(violations);
  }
}
