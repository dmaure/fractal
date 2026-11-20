/**
 * Acción `create-frontend`: escribe el SPA React + Vite en `destinationPath`.
 * Mismo contenido en modo `embedded` (monolito) y `standalone`.
 */
import type { CreateFrontendPayload } from '@fractal/core';
import { writeFrontendFiles } from './web-files.js';

export async function createFrontend(
  payload: CreateFrontendPayload
): Promise<{ success: true; data: { path: string } } | { success: false; error: { message: string; step?: string } }> {
  try {
    await writeFrontendFiles(payload.destinationPath, payload.name, payload.mode);
    return { success: true, data: { path: payload.destinationPath } };
  } catch (error) {
    return {
      success: false,
      error: {
        message: `Error al generar el frontend: ${error instanceof Error ? error.message : String(error)}`,
        step: 'generación-frontend',
      },
    };
  }
}
