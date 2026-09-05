import { select } from '@inquirer/prompts';
import { TOPOLOGY_OPTIONS, DEFAULT_TOPOLOGY, type ProjectTopology } from '../types/topology.js';

/**
 * Prompt para seleccionar la topología del proyecto.
 * Muestra las tres opciones con descripciones y aplica el default (monolito).
 */
export async function promptTopology(): Promise<ProjectTopology> {
  return await select({
    message: 'Selecciona la topología del proyecto:',
    choices: TOPOLOGY_OPTIONS.map(opt => ({
      value: opt.value,
      name: opt.name,
      description: opt.description,
    })),
    default: DEFAULT_TOPOLOGY,
  });
}
