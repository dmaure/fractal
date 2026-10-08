#!/usr/bin/env node
/**
 * Entry point del bridge para adapter-laravel.
 * 
 * Lee comandos JSON por stdin y responde por stdout según el formato del bridge (SPEC-0002).
 * Acciones soportadas:
 * - get-contract: devuelve el contrato del adapter (SPEC-0006 AC-2, AC-3)
 * - create-project: genera un proyecto Laravel (SPEC-0006 AC-1)
 * 
 * @see docs/specs/0002-bridge-node-toolchain.md
 * @see docs/specs/0006-contrato-adapter-v0.md
 */

import { createProject } from './commands/create-project.js';
import { getAdapterContract } from './contract.js';
import type { CreateProjectPayload } from '@fractal/core';

interface BridgeAction {
  action: string;
  [key: string]: unknown;
}

/**
 * Envelope de respuesta del bridge.
 * 
 * @see SPEC-0002 AC-2, AC-3
 */
type BridgeResponse =
  | { success: true; data: unknown }
  | { success: false; error: { message: string; step?: string } };

/**
 * Lee un payload JSON desde stdin.
 */
async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    
    process.stdin.setEncoding('utf-8');
    
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    
    process.stdin.on('end', () => {
      resolve(data);
    });
    
    process.stdin.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Escribe una respuesta JSON a stdout.
 */
function writeResponse(response: BridgeResponse): void {
  process.stdout.write(JSON.stringify(response));
}

/**
 * Punto de entrada principal.
 */
async function main(): Promise<void> {
  try {
    // Leer stdin
    const stdinData = await readStdin();
    
    if (!stdinData.trim()) {
      writeResponse({
        success: false,
        error: {
          message: 'No se recibió ningún payload por stdin',
          step: 'lectura',
        },
      });
      process.exit(1);
    }
    
    // Parsear JSON
    let payload: BridgeAction;
    try {
      payload = JSON.parse(stdinData) as BridgeAction;
    } catch (error) {
      writeResponse({
        success: false,
        error: {
          message: `JSON inválido: ${error instanceof Error ? error.message : String(error)}`,
          step: 'parseo',
        },
      });
      process.exit(1);
    }
    
    // Validar que tenga el campo action
    if (!payload || typeof payload !== 'object' || typeof payload.action !== 'string') {
      writeResponse({
        success: false,
        error: {
          message: 'El payload debe ser un objeto JSON con un campo "action" de tipo string',
          step: 'validación',
        },
      });
      process.exit(1);
    }
    
    // Procesar acción
    let response: BridgeResponse;
    
    switch (payload.action) {
      case 'get-contract':
        response = {
          success: true,
          data: getAdapterContract(),
        };
        break;
      
      case 'create-project':
        // Validar campos requeridos para create-project
        if (!payload.name || typeof payload.name !== 'string') {
          response = {
            success: false,
            error: {
              message: 'El campo "name" es requerido y debe ser un string',
              step: 'validación',
            },
          };
          break;
        }
        
        if (!payload.topology || typeof payload.topology !== 'string') {
          response = {
            success: false,
            error: {
              message: 'El campo "topology" es requerido y debe ser un string',
              step: 'validación',
            },
          };
          break;
        }
        
        if (!payload.destinationPath || typeof payload.destinationPath !== 'string') {
          response = {
            success: false,
            error: {
              message: 'El campo "destinationPath" es requerido y debe ser un string',
              step: 'validación',
            },
          };
          break;
        }
        
        if (!payload.target || typeof payload.target !== 'string') {
          response = {
            success: false,
            error: {
              message: 'El campo "target" es requerido y debe ser un string',
              step: 'validación',
            },
          };
          break;
        }
        
        // Construir payload tipado
        const createProjectPayload: CreateProjectPayload = {
          name: payload.name,
          topology: payload.topology as 'monolith' | 'monorepo' | 'multirepo',
          destinationPath: payload.destinationPath,
          target: payload.target,
          contractVersion: payload.contractVersion as '0' | undefined,
        };
        
        // Invocar createProject
        response = await createProject(createProjectPayload);
        break;
      
      default:
        response = {
          success: false,
          error: {
            message: `Acción desconocida: "${payload.action}". Acciones soportadas: get-contract, create-project`,
            step: 'validación',
          },
        };
        break;
    }
    
    // Escribir respuesta
    writeResponse(response);
    process.exit(response.success ? 0 : 1);
    
  } catch (error) {
    // Error inesperado del proceso
    writeResponse({
      success: false,
      error: {
        message: `Error interno: ${error instanceof Error ? error.message : String(error)}`,
        step: 'ejecución',
      },
    });
    process.exit(1);
  }
}

// Ejecutar
main();
