/**
 * @fractal/adapter-laravel
 * 
 * Adapter para Laravel que implementa el contrato v0.
 * 
 * Expone la lógica para crear proyectos Laravel en las tres topologías
 * (monolith, monorepo, multirepo) y las declaraciones de runtime
 * requeridas por el core.
 * 
 * @see docs/specs/0006-contrato-adapter-v0.md
 */

export { createProject } from './commands/create-project.js';
export { getAdapterContract } from './contract.js';
export type { LaravelAdapterContract } from './contract.js';
