/**
 * Parser de FDL (Fractal Definition Language) v0: JSON → IR tipada.
 *
 * Convierte el texto de un documento FDL (JSON) en la representación interna
 * (IR) tipada definida por los tipos de `../types/fdl.ts` (FRA-56). El parser
 * no tiene gramática ni lexer propios (ADR-0003): hace `JSON.parse` y mapea el
 * valor resultante a `FdlDocument`, aplicando los defaults de modificadores de
 * §7.3 al construir la IR.
 *
 * Agnóstico de framework (Artículo II): solo conoce los tipos abstractos de FDL.
 *
 * ## Frontera forma / semántica
 * Este módulo reporta únicamente errores de **forma de documento**:
 * - JSON inválido (`JSON.parse` lanza),
 * - claves obligatorias ausentes,
 * - tipos de valor JS incorrectos (string / number / boolean / array / object).
 *
 * **No** aplica validación semántica (VR-1..VR-12): no verifica unicidad ni
 * validez de nombres, integridad referencial de `target`, compatibilidad de
 * tipo/modificador, que `values` exista para `enum`, que `fdlVersion` sea un
 * valor soportado, la membresía de `type`/`kind` en sus conjuntos cerrados, etc.
 * Todo eso es alcance de FRA-58 (SPEC-0004 §10 T3). En consecuencia, valores
 * como `type: "banana"`, `kind: "weird"` o `fdlVersion: "9"` se parsean sin
 * error: son documentos bien formados aunque semánticamente inválidos.
 *
 * @see SPEC-0004 §7 (shape), §8 (reglas deferidas), §10 T2
 * @see ../types/fdl.ts
 */

import type {
  FdlDocument,
  FdlEntity,
  FdlField,
  FdlFieldDefault,
  FdlProject,
  FdlRelation,
  FieldType,
  RelationKind,
  FdlVersion,
} from '../types/fdl.js';

/**
 * Código de un error de forma de documento FDL.
 *
 * - `INVALID_JSON`: el texto fuente no es JSON parseable.
 * - `MISSING_KEY`: falta una clave obligatoria.
 * - `INVALID_TYPE`: una clave presente tiene un tipo de valor JS incorrecto
 *   (p. ej. `entities` no es un array, `name` no es un string).
 *
 * Estos son errores de **forma**, no semánticos. Las reglas VR-1..VR-12 se
 * validan en FRA-58 y no producen ninguno de estos códigos.
 */
export type FdlParseErrorCode = 'INVALID_JSON' | 'MISSING_KEY' | 'INVALID_TYPE';

/**
 * Error de forma al parsear un documento FDL.
 *
 * Solo representa errores de forma de documento (ver {@link FdlParseErrorCode}),
 * nunca errores semánticos (VR-1..VR-12 son alcance de FRA-58). `parseFdl`
 * lanza este error en cuanto detecta la primera violación de forma
 * (fail-fast).
 *
 * @property code - La categoría del error de forma.
 * @property path - Ubicación localizada del error dentro del documento, con la
 *   raíz representada como `(root)` y las rutas anidadas unidas por `.` y con
 *   índices de array entre corchetes (p. ej. `entities[0].fields[2].name`).
 */
export class FdlParseError extends Error {
  readonly code: FdlParseErrorCode;
  readonly path: string;

  constructor(code: FdlParseErrorCode, path: string, message: string) {
    super(message);
    this.name = 'FdlParseError';
    this.code = code;
    this.path = path;
  }
}

/** Raíz del documento en las rutas localizadas de error. */
const ROOT_PATH = '(root)';

/** Une un path base con una clave hija (`a` + `b` → `a.b`, raíz → `b`). */
function childPath(base: string, key: string): string {
  return base === ROOT_PATH ? key : `${base}.${key}`;
}

/** Une un path base con un índice de array (`a` + `0` → `a[0]`). */
function indexPath(base: string, index: number): string {
  return `${base}[${index}]`;
}

/** Nombre legible del tipo JS de un valor, para mensajes de error. */
function jsTypeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** True si `value` es un objeto JSON (no null, no array). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Exige que `value` sea un objeto JSON; lanza INVALID_TYPE si no. */
function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new FdlParseError(
      'INVALID_TYPE',
      path,
      `Expected an object at ${path}, but got ${jsTypeName(value)}.`
    );
  }
  return value;
}

/** Exige que `value` sea un array; lanza INVALID_TYPE si no. */
function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new FdlParseError(
      'INVALID_TYPE',
      path,
      `Expected an array at ${path}, but got ${jsTypeName(value)}.`
    );
  }
  return value;
}

/** Exige presencia de una clave; lanza MISSING_KEY si está ausente. */
function requirePresent(
  obj: Record<string, unknown>,
  key: string,
  containerPath: string
): unknown {
  if (!(key in obj) || obj[key] === undefined) {
    throw new FdlParseError(
      'MISSING_KEY',
      containerPath,
      `Missing required key "${key}" at ${containerPath}.`
    );
  }
  return obj[key];
}

/** Exige un string obligatorio (presente + tipo string). */
function requireString(
  obj: Record<string, unknown>,
  key: string,
  containerPath: string
): string {
  const value = requirePresent(obj, key, containerPath);
  if (typeof value !== 'string') {
    throw new FdlParseError(
      'INVALID_TYPE',
      childPath(containerPath, key),
      `Expected "${key}" to be a string at ${childPath(containerPath, key)}, but got ${jsTypeName(value)}.`
    );
  }
  return value;
}

/** Devuelve un string opcional; lanza INVALID_TYPE si está presente pero no es string. */
function optionalString(
  obj: Record<string, unknown>,
  key: string,
  containerPath: string
): string | undefined {
  if (!(key in obj) || obj[key] === undefined) return undefined;
  const value = obj[key];
  if (typeof value !== 'string') {
    throw new FdlParseError(
      'INVALID_TYPE',
      childPath(containerPath, key),
      `Expected "${key}" to be a string at ${childPath(containerPath, key)}, but got ${jsTypeName(value)}.`
    );
  }
  return value;
}

/** Devuelve un number opcional; lanza INVALID_TYPE si está presente pero no es number. */
function optionalNumber(
  obj: Record<string, unknown>,
  key: string,
  containerPath: string
): number | undefined {
  if (!(key in obj) || obj[key] === undefined) return undefined;
  const value = obj[key];
  if (typeof value !== 'number') {
    throw new FdlParseError(
      'INVALID_TYPE',
      childPath(containerPath, key),
      `Expected "${key}" to be a number at ${childPath(containerPath, key)}, but got ${jsTypeName(value)}.`
    );
  }
  return value;
}

/**
 * Devuelve un boolean opcional con default; lanza INVALID_TYPE si está presente
 * pero no es boolean. Materializa el default (§7.3) cuando está ausente.
 */
function booleanWithDefault(
  obj: Record<string, unknown>,
  key: string,
  containerPath: string,
  fallback: boolean
): boolean {
  if (!(key in obj) || obj[key] === undefined) return fallback;
  const value = obj[key];
  if (typeof value !== 'boolean') {
    throw new FdlParseError(
      'INVALID_TYPE',
      childPath(containerPath, key),
      `Expected "${key}" to be a boolean at ${childPath(containerPath, key)}, but got ${jsTypeName(value)}.`
    );
  }
  return value;
}

/** Mapea `project` aplicando forma: `name` obligatorio, `description` opcional. */
function parseProject(value: unknown, path: string): FdlProject {
  const obj = requireObject(value, path);
  const project: FdlProject = {
    name: requireString(obj, 'name', path),
  };
  const description = optionalString(obj, 'description', path);
  if (description !== undefined) project.description = description;
  return project;
}

/** Mapea el `default` opcional de un campo (string | number | boolean). */
function parseFieldDefault(
  obj: Record<string, unknown>,
  path: string
): FdlFieldDefault | undefined {
  if (!('default' in obj) || obj['default'] === undefined) return undefined;
  const value = obj['default'];
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean'
  ) {
    throw new FdlParseError(
      'INVALID_TYPE',
      childPath(path, 'default'),
      `Expected "default" to be a string, number, or boolean at ${childPath(path, 'default')}, but got ${jsTypeName(value)}.`
    );
  }
  return value;
}

/** Mapea el `values` opcional de un campo (array de strings). */
function parseFieldValues(
  obj: Record<string, unknown>,
  path: string
): string[] | undefined {
  if (!('values' in obj) || obj['values'] === undefined) return undefined;
  const valuesPath = childPath(path, 'values');
  const arr = requireArray(obj['values'], valuesPath);
  const result: string[] = [];
  for (let i = 0; i < arr.length; i++) {
    const element = arr[i];
    if (typeof element !== 'string') {
      throw new FdlParseError(
        'INVALID_TYPE',
        indexPath(valuesPath, i),
        `Expected "values" element to be a string at ${indexPath(valuesPath, i)}, but got ${jsTypeName(element)}.`
      );
    }
    result.push(element);
  }
  return result;
}

/** Mapea un campo (`entities[i].fields[j]`) aplicando defaults de modificadores. */
function parseField(value: unknown, path: string): FdlField {
  const obj = requireObject(value, path);

  const field: FdlField = {
    name: requireString(obj, 'name', path),
    // `type` se castea a FieldType sin verificar membresía (VR-3/semántico).
    type: requireString(obj, 'type', path) as FieldType,
    nullable: booleanWithDefault(obj, 'nullable', path, false),
    unique: booleanWithDefault(obj, 'unique', path, false),
    primaryKey: booleanWithDefault(obj, 'primaryKey', path, false),
  };

  const fieldDefault = parseFieldDefault(obj, path);
  if (fieldDefault !== undefined) field.default = fieldDefault;

  const maxLength = optionalNumber(obj, 'maxLength', path);
  if (maxLength !== undefined) field.maxLength = maxLength;

  const precision = optionalNumber(obj, 'precision', path);
  if (precision !== undefined) field.precision = precision;

  const scale = optionalNumber(obj, 'scale', path);
  if (scale !== undefined) field.scale = scale;

  const values = parseFieldValues(obj, path);
  if (values !== undefined) field.values = values;

  return field;
}

/** Mapea una relación (`entities[i].relations[k]`) aplicando el default de nullable. */
function parseRelation(value: unknown, path: string): FdlRelation {
  const obj = requireObject(value, path);

  const relation: FdlRelation = {
    name: requireString(obj, 'name', path),
    // `kind` se castea a RelationKind sin verificar membresía (VR-8/semántico).
    kind: requireString(obj, 'kind', path) as RelationKind,
    target: requireString(obj, 'target', path),
    nullable: booleanWithDefault(obj, 'nullable', path, false),
  };

  const inverse = optionalString(obj, 'inverse', path);
  if (inverse !== undefined) relation.inverse = inverse;

  return relation;
}

/** Mapea una entidad (`entities[i]`), sus campos y relaciones. */
function parseEntity(value: unknown, path: string): FdlEntity {
  const obj = requireObject(value, path);

  const name = requireString(obj, 'name', path);

  const fieldsPath = childPath(path, 'fields');
  const fieldsRaw = requireArray(
    requirePresent(obj, 'fields', path),
    fieldsPath
  );
  const fields = fieldsRaw.map((field, i) =>
    parseField(field, indexPath(fieldsPath, i))
  );

  const entity: FdlEntity = { name, fields };

  const description = optionalString(obj, 'description', path);
  if (description !== undefined) entity.description = description;

  if ('relations' in obj && obj['relations'] !== undefined) {
    const relationsPath = childPath(path, 'relations');
    const relationsRaw = requireArray(obj['relations'], relationsPath);
    entity.relations = relationsRaw.map((relation, k) =>
      parseRelation(relation, indexPath(relationsPath, k))
    );
  }

  return entity;
}

/**
 * Parsea el texto de un documento FDL (JSON) a la IR tipada {@link FdlDocument}.
 *
 * Hace `JSON.parse` sobre `source` (ADR-0003: sin parser propio) y luego mapea
 * estructuralmente el valor resultante a `FdlDocument`, aplicando los defaults
 * de modificadores de §7.3: `field.nullable`, `field.unique`,
 * `field.primaryKey` y `relation.nullable` se materializan en `false` cuando
 * están ausentes. Las claves desconocidas se ignoran: la IR producida solo
 * contiene claves conocidas.
 *
 * Solo detecta errores de **forma de documento** y es fail-fast: lanza
 * {@link FdlParseError} ante la primera violación encontrada.
 *
 * - `source` no parseable → `FdlParseError` con código `INVALID_JSON`.
 * - clave obligatoria ausente → código `MISSING_KEY`.
 * - tipo de valor JS incorrecto → código `INVALID_TYPE`.
 *
 * **No** ejecuta validación semántica (VR-1..VR-12, alcance de FRA-58): no
 * comprueba membresía de `type`/`kind` en sus conjuntos cerrados, ni que
 * `fdlVersion` sea un valor soportado, ni unicidad/validez de nombres, ni
 * integridad referencial, ni compatibilidad de tipo/modificador. Documentos
 * bien formados pero semánticamente inválidos (p. ej. `type: "banana"`) se
 * parsean sin error.
 *
 * @param source - Texto JSON del documento FDL.
 * @returns La IR tipada del documento con los defaults de §7.3 aplicados.
 * @throws {FdlParseError} Ante cualquier error de forma de documento.
 * @see SPEC-0004 §7, §10 T2
 */
export function parseFdl(source: string): FdlDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new FdlParseError(
      'INVALID_JSON',
      ROOT_PATH,
      `Invalid JSON at ${ROOT_PATH}: ${detail}`
    );
  }

  const root = requireObject(parsed, ROOT_PATH);

  // `fdlVersion` debe ser string; el valor concreto (VR-7) es semántico.
  const fdlVersion = requireString(root, 'fdlVersion', ROOT_PATH) as FdlVersion;

  const project = parseProject(
    requirePresent(root, 'project', ROOT_PATH),
    childPath(ROOT_PATH, 'project')
  );

  const entitiesRaw = requireArray(
    requirePresent(root, 'entities', ROOT_PATH),
    childPath(ROOT_PATH, 'entities')
  );
  const entities = entitiesRaw.map((entity, i) =>
    parseEntity(entity, indexPath(childPath(ROOT_PATH, 'entities'), i))
  );

  return { fdlVersion, project, entities };
}
