/**
 * Comando "crear proyecto base" para Laravel.
 * 
 * Implementa SPEC-0006 AC-1: genera proyectos Laravel en las tres topologías
 * (monolith, monorepo, multirepo) según el payload del contrato.
 */

import type {
  CreateProjectPayload,
  CreateProjectResponse,
} from '@fractal/core';
import { generateMonolith } from '../generators/monolith.js';
import { generateMonorepo } from '../generators/monorepo.js';
import { generateMultirepo } from '../generators/multirepo.js';

/**
 * Crea un proyecto Laravel según el payload del contrato.
 * 
 * @param payload - Payload del contrato con nombre, topología y path destino
 * @returns Respuesta con éxito o error propagable
 * 
 * @see SPEC-0006 AC-1
 * @see SPEC-0002 AC-3 — propagación de errores legible
 */
export async function createProject(
  payload: CreateProjectPayload
): Promise<CreateProjectResponse> {
  try {
    const { name, topology, destinationPath } = payload;

    let projectPath: string;

    switch (topology) {
      case 'monolith':
        projectPath = await generateMonolith(name, destinationPath);
        break;

      case 'monorepo':
        projectPath = await generateMonorepo(name, destinationPath);
        break;

      case 'multirepo':
        projectPath = await generateMultirepo(name, destinationPath);
        break;

      default:
        return {
          success: false,
          error: {
            message: `Topología no soportada: ${topology}`,
            step: 'validación',
          },
        };
    }

    return {
      success: true,
      data: {
        projectPath,
        message: `Proyecto Laravel ${topology} generado exitosamente`,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Error desconocido';
    const step = extractStepFromError(error);

    return {
      success: false,
      error: {
        message,
        step,
      },
    };
  }
}

/**
 * Extrae el paso de ejecución donde ocurrió el error, si está disponible.
 */
function extractStepFromError(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'step' in error) {
    return String(error.step);
  }
  return undefined;
}
