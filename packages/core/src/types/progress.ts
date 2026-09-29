/**
 * Tipos de la fuente de verdad estructurada `docs/progress.json`.
 *
 * Este es el MISMO shape que consume el dev-tool `scripts/progress-map.js`
 * (semilla de SPEC-0031): milestones con `{ id, nombre, entregable, estado }`
 * y un bloque opcional `capacidades`. Mantener ambos alineados evita que el
 * comando `fractal status` y `pnpm progress` diverjan (FRA-46).
 */

/**
 * Estado válido de un milestone o nodo de capacidades en progress.json.
 */
export type Estado = 'completado' | 'en_curso' | 'pendiente';

/**
 * Alias retrocompatible. El estado se usa tanto en milestones como en nodos.
 */
export type TaskStatus = Estado;

/**
 * Conjunto de estados válidos para validación (orden estable para el resumen).
 */
export const VALID_STATUSES: readonly Estado[] = [
  'completado',
  'en_curso',
  'pendiente',
] as const;

/**
 * Milestone del roadmap (Diagrama 1 / resumen de terminal).
 */
export interface Milestone {
  id: string;
  nombre: string;
  entregable: string;
  estado: Estado;
}

/**
 * Nodo del bloque `capacidades` (Diagrama 2).
 */
export interface CapacidadNodo {
  id: string;
  label: string;
  estado: Estado;
}

/**
 * Grupo (subgraph) del bloque `capacidades`.
 */
export interface CapacidadGrupo {
  id: string;
  titulo: string;
  nodos: CapacidadNodo[];
}

/**
 * Bloque opcional `capacidades`. Modela grupos, nodos sueltos y aristas.
 */
export interface Capacidades {
  grupos?: CapacidadGrupo[];
  nodos?: CapacidadNodo[];
  aristas?: [string, string][];
}

/**
 * Estructura raíz de `docs/progress.json`.
 */
export interface ProgressData {
  proyecto?: string;
  actualizado?: string;
  leyenda?: Record<string, string>;
  milestones: Milestone[];
  capacidades?: Capacidades;
}

/**
 * Conteo por estado (para el resumen de terminal).
 */
export interface StatusSummary {
  completado: number;
  en_curso: number;
  pendiente: number;
  total: number;
}

/**
 * Verifica si un valor es un Estado válido.
 */
export function isValidTaskStatus(status: unknown): status is Estado {
  return (
    typeof status === 'string' && VALID_STATUSES.includes(status as Estado)
  );
}
