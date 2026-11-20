#!/usr/bin/env node
/**
 * Bridge de adapter-react-vite. Lee un comando JSON por stdin y responde por
 * stdout (SPEC-0002). Acciones: get-contract, create-frontend, get-pack.
 */
import { isValidTopology, type CreateFrontendPayload, type ProjectTopology } from '@fractal/core';
import { getContract } from './contract.js';
import { createFrontend } from './create-frontend.js';
import { getPack } from './get-pack.js';

type BridgeResponse =
  | { success: true; data: unknown }
  | { success: false; error: { message: string; step?: string } };

const fail = (message: string, step = 'validación'): BridgeResponse => ({
  success: false,
  error: { message, step },
});

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function handle(payload: Record<string, unknown>): Promise<BridgeResponse> {
  switch (payload.action) {
    case 'get-contract':
      return { success: true, data: getContract() };

    case 'create-frontend': {
      if (typeof payload.name !== 'string' || !payload.name) {
        return fail('El campo "name" es requerido y debe ser un string');
      }
      if (typeof payload.destinationPath !== 'string' || !payload.destinationPath) {
        return fail('El campo "destinationPath" es requerido y debe ser un string');
      }
      if (payload.mode !== 'embedded' && payload.mode !== 'standalone') {
        return fail('El campo "mode" debe ser "embedded" o "standalone"');
      }
      return createFrontend(payload as unknown as CreateFrontendPayload);
    }

    case 'get-pack': {
      if (typeof payload.name !== 'string' || !payload.name) {
        return fail('El campo "name" es requerido y debe ser un string');
      }
      if (!isValidTopology(String(payload.topology))) {
        return fail('El campo "topology" debe ser monolith, monorepo o multirepo');
      }
      return { success: true, data: getPack(payload.name, payload.topology as ProjectTopology) };
    }

    default:
      return fail(
        `Acción desconocida: "${String(payload.action)}". Acciones soportadas: get-contract, create-frontend, get-pack`
      );
  }
}

async function main(): Promise<void> {
  let response: BridgeResponse;
  try {
    const stdinData = await readStdin();
    if (!stdinData.trim()) {
      response = fail('No se recibió ningún payload por stdin', 'lectura');
    } else {
      let payload: unknown;
      try {
        payload = JSON.parse(stdinData);
      } catch (error) {
        payload = undefined;
        response = fail(`JSON inválido: ${error instanceof Error ? error.message : String(error)}`, 'parseo');
      }
      if (payload && typeof payload === 'object' && typeof (payload as { action?: unknown }).action === 'string') {
        response = await handle(payload as Record<string, unknown>);
      } else {
        response ??= fail('El payload debe ser un objeto JSON con un campo "action" de tipo string');
      }
    }
  } catch (error) {
    response = fail(`Error interno: ${error instanceof Error ? error.message : String(error)}`, 'ejecución');
  }
  process.stdout.write(JSON.stringify(response));
  process.exit(response.success ? 0 : 1);
}

main();
