/**
 * Capa de diagnósticos legibles de FDL (Fractal Definition Language) v0.
 *
 * Convierte los errores crudos de las capas anteriores en diagnósticos
 * autodescriptivos y accionables, sin stacktraces:
 * - los errores de **forma** del parser (`./parser.ts`, FRA-57): `INVALID_JSON`,
 *   `MISSING_KEY`, `INVALID_TYPE`;
 * - las violaciones **semánticas** del validador (`./validator.ts`, FRA-58):
 *   VR-1..VR-12.
 *
 * Para cada uno resuelve una ubicación humana (documento / versión / proyecto /
 * entidad / campo / relación) y, cuando hay un documento disponible, nombra la
 * entidad, el campo o la relación afectada en lugar de exponer solo la ruta
 * máquina (p. ej. `entities[0].relations[0].target`). El hecho crudo emitido
 * por el parser y el validador se preserva tal cual: solo se le antepone el
 * localizador legible, nunca se reescribe ni se traduce.
 *
 * Agnóstico de framework (Artículo II): solo conoce los tipos abstractos de FDL
 * y las rutas máquina del documento.
 *
 * ## Idioma
 * Este encabezado y los comentarios del módulo están en español (estilo de la
 * casa), pero los **mensajes de diagnóstico** se emiten en inglés, por
 * consistencia con los hechos crudos en inglés de `parser.ts` y `validator.ts`
 * (que no se traducen).
 *
 * Es el paso T4 de la cadena FDL (FRA-59); el pulido mayor de diagnósticos pasa
 * a ser alcance de SPEC-0005 (documento aún inexistente).
 *
 * @see SPEC-0004 §8, §10 T4
 * @see ./parser.ts
 * @see ./validator.ts
 */

import { FdlParseError, parseFdl } from './parser.js';
import type { FdlParseErrorCode } from './parser.js';
import { validateFdl } from './validator.js';
import type {
  FdlValidationRule,
  FdlViolation,
  FdlValidationResult,
} from './validator.js';
import type { FdlDocument } from '../types/fdl.js';

/** Origen de un diagnóstico: forma (parser) o semántica (validador). */
export type FdlDiagnosticSource = 'parse' | 'validate';

/** Código del diagnóstico: código de forma (parser) o regla VR (validador). */
export type FdlDiagnosticCode = FdlParseErrorCode | FdlValidationRule;

/** Clase de ubicación humana dentro del documento FDL. */
export type FdlLocationKind =
  | 'document'
  | 'version'
  | 'project'
  | 'entity'
  | 'field'
  | 'relation';

/** Ubicación resuelta de un diagnóstico dentro del documento. */
export interface FdlLocation {
  kind: FdlLocationKind;
  /** Resolved entity name if available (validation path; undefined for parse errors or when unresolved). */
  entity?: string;
  /** Resolved field name if the location is a field and it could be resolved. */
  field?: string;
  /** Resolved relation name if the location is a relation and it could be resolved. */
  relation?: string;
  /** Original machine path within the document (e.g. "entities[0].fields[1].name"). */
  path: string;
}

/** Un diagnóstico legible y autocontenido. */
export interface FdlDiagnostic {
  source: FdlDiagnosticSource;
  /** The shape-error code (parser) or the violated VR rule (validator). */
  code: FdlDiagnosticCode;
  location: FdlLocation;
  /** Readable, self-contained, actionable message. No stacktrace. */
  message: string;
}

// --- Regexes de ruta (mismo estilo de segmentos "a.b", "a[i]" del parser) ------

/** Índice de entidad dentro de una ruta: captura `i` de `entities[i]`. */
const ENTITY_INDEX_RE = /entities\[(\d+)\]/;
/** Índice de campo dentro de una ruta: captura `j` de `fields[j]`. */
const FIELD_INDEX_RE = /fields\[(\d+)\]/;
/** Índice de relación dentro de una ruta: captura `k` de `relations[k]`. */
const RELATION_INDEX_RE = /relations\[(\d+)\]/;

/** Segmento `entities[i]` de una ruta, para el fallback sin nombre resuelto. */
const ENTITY_SEGMENT_RE = /entities\[\d+\]/;
/** Segmento `entities[i].fields[j]` de una ruta, para el fallback de campo. */
const FIELD_SEGMENT_RE = /entities\[\d+\]\.fields\[\d+\]/;
/** Segmento `entities[i].relations[k]` de una ruta, para el fallback de relación. */
const RELATION_SEGMENT_RE = /entities\[\d+\]\.relations\[\d+\]/;

/**
 * Determina la clase de ubicación a partir de la ruta, con la precedencia:
 * relación → campo → entidad → entities (array raíz) → proyecto → versión →
 * documento (raíz o cualquier otra cosa).
 */
function locationKind(path: string): FdlLocationKind {
  if (RELATION_INDEX_RE.test(path)) return 'relation';
  if (FIELD_INDEX_RE.test(path)) return 'field';
  if (ENTITY_INDEX_RE.test(path)) return 'entity';
  if (path === 'entities') return 'document';
  if (path.startsWith('project')) return 'project';
  if (path === 'fdlVersion') return 'version';
  return 'document';
}

/** Extrae el primer grupo numérico de una ruta, o `undefined` si no hay. */
function matchIndex(re: RegExp, path: string): number | undefined {
  const m = re.exec(path);
  return m ? Number(m[1]) : undefined;
}

/**
 * Resuelve la ubicación humana de una ruta máquina del documento.
 *
 * Deriva `kind` por precedencia (ver {@link locationKind}) y, si se pasa `doc`,
 * resuelve los nombres de entidad / campo / relación correspondientes a los
 * índices de la ruta. Un nombre solo se setea cuando resuelve a un string
 * (nunca `undefined`); sin `doc` (errores de forma) los nombres quedan sin
 * resolver. `path` siempre conserva la ruta original.
 */
export function parseLocation(path: string, doc?: FdlDocument): FdlLocation {
  const kind = locationKind(path);
  const location: FdlLocation = { kind, path };

  const i = matchIndex(ENTITY_INDEX_RE, path);
  const j = matchIndex(FIELD_INDEX_RE, path);
  const k = matchIndex(RELATION_INDEX_RE, path);

  if (doc !== undefined && i !== undefined) {
    const entity = doc.entities[i];
    if (entity?.name !== undefined) location.entity = entity.name;

    if (kind === 'field' && j !== undefined) {
      const fieldName = entity?.fields[j]?.name;
      if (fieldName !== undefined) location.field = fieldName;
    }

    if (kind === 'relation' && k !== undefined) {
      const relationName = entity?.relations?.[k]?.name;
      if (relationName !== undefined) location.relation = relationName;
    }
  }

  return location;
}

/** Extrae el segmento `re` de la ruta; cae a la ruta completa si no matchea. */
function segment(re: RegExp, path: string): string {
  return re.exec(path)?.[0] ?? path;
}

/**
 * Construye un localizador humano a partir de la ubicación. Para campos y
 * relaciones **siempre** nombra la entidad cuando se conoce; cuando un nombre no
 * resuelve (p. ej. errores de forma, sin documento) cae al segmento de ruta
 * (`the field at entities[0].fields[1]`).
 */
export function describeLocation(loc: FdlLocation): string {
  switch (loc.kind) {
    case 'document':
      return 'the document';
    case 'version':
      return 'the document version';
    case 'project':
      // El nombre del proyecto no vive en FdlLocation: locator genérico.
      return 'the project';
    case 'entity':
      return loc.entity !== undefined
        ? `entity "${loc.entity}"`
        : `the entity at ${segment(ENTITY_SEGMENT_RE, loc.path)}`;
    case 'field':
      if (loc.field !== undefined && loc.entity !== undefined) {
        return `field "${loc.field}" of entity "${loc.entity}"`;
      }
      if (loc.entity !== undefined) {
        return `a field of entity "${loc.entity}"`;
      }
      return `the field at ${segment(FIELD_SEGMENT_RE, loc.path)}`;
    case 'relation':
      if (loc.relation !== undefined && loc.entity !== undefined) {
        return `relation "${loc.relation}" of entity "${loc.entity}"`;
      }
      if (loc.entity !== undefined) {
        return `a relation of entity "${loc.entity}"`;
      }
      return `the relation at ${segment(RELATION_SEGMENT_RE, loc.path)}`;
    default: {
      // Exhaustividad: si se agrega una clase nueva, TS marca este punto.
      const unreachable: never = loc.kind;
      return unreachable;
    }
  }
}

/**
 * Convierte un error de forma del parser en un diagnóstico legible. No lee
 * nunca `error.stack`: solo usa `code`, `path` y `message`.
 */
export function diagnoseParseError(error: FdlParseError): FdlDiagnostic {
  const location = parseLocation(error.path);
  return {
    source: 'parse',
    code: error.code,
    location,
    message: `${describeLocation(location)}: ${error.message}`,
  };
}

/**
 * Convierte el resultado de validación semántica en diagnósticos legibles, uno
 * por violación y en el mismo orden (VR-1..VR-12). Devuelve `[]` si no hay
 * violaciones.
 */
export function diagnoseValidation(
  doc: FdlDocument,
  result: FdlValidationResult
): FdlDiagnostic[] {
  return result.violations.map((violation: FdlViolation) => {
    const location = parseLocation(violation.path, doc);
    return {
      source: 'validate',
      code: violation.rule,
      location,
      message: `${describeLocation(location)}: ${violation.message}`,
    };
  });
}

/**
 * Diagnóstico de punta a punta desde el texto fuente: parsea y, si la forma es
 * válida, valida. Un error de forma produce un único diagnóstico de parseo; un
 * documento bien formado pero semánticamente inválido produce un diagnóstico
 * por violación. Devuelve `[]` para un documento totalmente válido.
 */
export function diagnoseFdl(source: string): FdlDiagnostic[] {
  let doc: FdlDocument;
  try {
    doc = parseFdl(source);
  } catch (e) {
    if (e instanceof FdlParseError) return [diagnoseParseError(e)];
    throw e;
  }
  return diagnoseValidation(doc, validateFdl(doc));
}

/** Formatea un diagnóstico en una línea: `[<code>] <message> (<path>)`. */
export function formatDiagnostic(d: FdlDiagnostic): string {
  return `[${d.code}] ${d.message} (${d.location.path})`;
}

/**
 * Formatea una lista de diagnósticos. Sin diagnósticos devuelve
 * `No FDL diagnostics.`; con ellos, una cabecera con el conteo seguida de cada
 * diagnóstico en su propia línea, prefijado con `  - `.
 */
export function formatDiagnostics(diagnostics: FdlDiagnostic[]): string {
  if (diagnostics.length === 0) return 'No FDL diagnostics.';
  const header = `${diagnostics.length} FDL diagnostic(s):`;
  const lines = diagnostics.map((d) => `  - ${formatDiagnostic(d)}`);
  return [header, ...lines].join('\n');
}
