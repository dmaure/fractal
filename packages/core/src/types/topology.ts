/**
 * Topologías de proyecto disponibles.
 * 
 * - monolith: Un repo, sin packages separados. SPA en resources/js.
 * - monorepo: Un repo con api/ y web/ como packages, orquestados con Turborepo.
 * - multirepo: Dos repos git separados, cada uno con su propio pipeline CI/CD.
 * 
 * @see docs/adr/0010-topologia-proyecto-generado-sin-inertia.md
 */
export type ProjectTopology = 'monolith' | 'monorepo' | 'multirepo';

export interface TopologyOption {
  value: ProjectTopology;
  name: string;
  description: string;
}

export const TOPOLOGY_OPTIONS: TopologyOption[] = [
  {
    value: 'monolith',
    name: 'Monolito',
    description: 'Un repositorio, API y SPA en la misma estructura',
  },
  {
    value: 'monorepo',
    name: 'Monorepo desacoplado',
    description: 'Un repositorio, api/ y web/ como packages con Turborepo',
  },
  {
    value: 'multirepo',
    name: 'Multirepo',
    description: 'Dos repositorios git separados, cada uno con su pipeline',
  },
];

export const DEFAULT_TOPOLOGY: ProjectTopology = 'monolith';

export function isValidTopology(value: string): value is ProjectTopology {
  return ['monolith', 'monorepo', 'multirepo'].includes(value);
}
