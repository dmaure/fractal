/**
 * FDL (Fractal Definition Language) v0 — representación TypeScript del documento.
 *
 * Tipos agnósticos de framework y de motor de DB (Artículo II, ADR-0002,
 * ADR-0004). Son una representación fiel del documento JSON de FDL v0: modelan
 * el shape (claves obligatorias vs opcionales, modificadores por tipo), no las
 * reglas de validación semántica (VR-1..VR-12), que son alcance de SPEC-0005.
 * Por eso los modificadores específicos de tipo se dejan opcionales a nivel de
 * representación.
 *
 * @see SPEC-0004 §7
 * @version 0
 */

/** Versión del lenguaje FDL. v0 ⇒ "0". @see SPEC-0004 §7.1 */
export type FdlVersion = '0';

/** Conjunto base de tipos escalares abstractos. @see SPEC-0004 §7.4 */
export type FieldType =
  | 'string'
  | 'text'
  | 'integer'
  | 'bigInteger'
  | 'decimal'
  | 'float'
  | 'boolean'
  | 'date'
  | 'time'
  | 'datetime'
  | 'uuid'
  | 'json'
  | 'enum';

/** Cardinalidades de relación. @see SPEC-0004 §7.5 */
export type RelationKind = 'one-to-many' | 'many-to-one' | 'many-to-many';

/** Valor por defecto de un campo; su tipo debe ser compatible con `type` (VR-9, validado en SPEC-0005). */
export type FdlFieldDefault = string | number | boolean;

/** Metadatos de dominio del proyecto (no describe infraestructura). @see SPEC-0004 §7.1 */
export interface FdlProject {
  name: string;
  description?: string;
}

/** Campo de una entidad. Los modificadores específicos de tipo son opcionales a nivel de representación. @see SPEC-0004 §7.3 */
export interface FdlField {
  name: string;
  type: FieldType;
  /** Default: false. */
  nullable?: boolean;
  /** Default: false. */
  unique?: boolean;
  /** Default: false. Reemplaza al id implícito de la entidad. */
  primaryKey?: boolean;
  default?: FdlFieldDefault;
  /** Solo `string`. */
  maxLength?: number;
  /** Solo `decimal`. */
  precision?: number;
  /** Solo `decimal`. */
  scale?: number;
  /** Obligatorio si `type` es `enum`; prohibido en otros (VR-4, validado en SPEC-0005). */
  values?: string[];
}

/** Relación saliente declarada en la entidad origen. @see SPEC-0004 §7.5 */
export interface FdlRelation {
  name: string;
  kind: RelationKind;
  target: string;
  inverse?: string;
  /** Para `many-to-one`: si la referencia puede faltar. Default: false. */
  nullable?: boolean;
}

/** Entidad del dominio. @see SPEC-0004 §7.2 */
export interface FdlEntity {
  name: string;
  description?: string;
  fields: FdlField[];
  relations?: FdlRelation[];
}

/** Documento FDL v0 completo. @see SPEC-0004 §7.1 */
export interface FdlDocument {
  fdlVersion: FdlVersion;
  project: FdlProject;
  entities: FdlEntity[];
}
