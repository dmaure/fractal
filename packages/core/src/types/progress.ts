/**
 * Estado válido de una tarea en progress.json
 */
export type TaskStatus = 'completado' | 'en_curso' | 'pendiente';

/**
 * Conjunto de estados válidos para validación
 */
export const VALID_STATUSES: readonly TaskStatus[] = [
  'completado',
  'en_curso',
  'pendiente',
] as const;

/**
 * Estructura de una tarea individual
 */
export interface Task {
  name: string;
  status: TaskStatus;
}

/**
 * Estructura de un milestone
 */
export interface Milestone {
  name: string;
  tasks: Task[];
}

/**
 * Estructura raíz de progress.json
 */
export interface ProgressData {
  milestones: Milestone[];
}

/**
 * Estadísticas de un milestone
 */
export interface MilestoneStats {
  name: string;
  completado: number;
  en_curso: number;
  pendiente: number;
  total: number;
}

/**
 * Verifica si un string es un TaskStatus válido
 */
export function isValidTaskStatus(status: unknown): status is TaskStatus {
  return (
    typeof status === 'string' &&
    VALID_STATUSES.includes(status as TaskStatus)
  );
}
