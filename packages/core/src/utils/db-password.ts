/**
 * Contraseña de la base de datos de producción: generate-or-ask (FRA-87).
 *
 * La contraseña nunca se escribe en el .env local (FRA-76): vive como secret
 * del pipeline y en /home/deploy/.env del servidor.
 */

import { password, select } from '@inquirer/prompts';
import { randomBytes } from 'node:crypto';
import { flagOrEnv } from './param-validators.js';

export interface DbPasswordResult {
  dbPassword: string;
  dbPasswordGenerated: boolean;
}

export interface DbPasswordOptions {
  dbPassword?: string;
  generateDbPassword?: boolean;
}

export function generateDbPassword(): string {
  return randomBytes(24).toString('hex');
}

/**
 * Interactivo: generar una contraseña segura ahora, o ingresarla.
 */
export async function promptDbPassword(): Promise<DbPasswordResult> {
  const mode = await select<'generate' | 'ask'>({
    message: 'Contraseña de la base de datos de producción:',
    choices: [
      {
        value: 'generate',
        name: 'Generar una contraseña segura ahora',
        description: '48 caracteres hex (equivalente a openssl rand -hex 24)',
      },
      {
        value: 'ask',
        name: 'Ingresar una contraseña',
        description: 'No se escribe en el .env local (FRA-76)',
      },
    ],
    default: 'generate',
  });

  if (mode === 'generate') {
    const dbPassword = generateDbPassword();
    console.log('   Contraseña generada (guardala: no se vuelve a mostrar ni se commitea).');
    return { dbPassword, dbPasswordGenerated: true };
  }

  const dbPassword = await password({
    message: 'Contraseña de la base de datos:',
    mask: '*',
    validate: (value) => {
      if (!value) return 'La contraseña es requerida';
      if (/[\r\n]/.test(value)) return 'La contraseña no puede contener saltos de línea';
      return true;
    },
  });
  return { dbPassword, dbPasswordGenerated: false };
}

/**
 * No interactivo: `--db-password` > FRACTAL_NEW_DB_PASSWORD >
 * FRACTAL_DEPLOY_DB_PASSWORD. Un valor provisto siempre gana; sin valor se
 * genera, salvo que `generateDbPassword` sea `false`.
 */
export function resolveDbPasswordFromFlagsOrEnv(
  options: DbPasswordOptions
): { result?: DbPasswordResult; error?: string } {
  const provided = flagOrEnv(options.dbPassword, 'FRACTAL_NEW_DB_PASSWORD', 'FRACTAL_DEPLOY_DB_PASSWORD');

  if (provided) {
    if (/[\r\n]/.test(provided)) {
      return { error: 'la contraseña de la base no puede contener saltos de línea' };
    }
    return { result: { dbPassword: provided, dbPasswordGenerated: false } };
  }

  if (options.generateDbPassword === false) {
    return {
      error: 'FRACTAL_NEW_DB_PASSWORD (o --db-password) es requerida si desactivás --generate-db-password',
    };
  }

  return { result: { dbPassword: generateDbPassword(), dbPasswordGenerated: true } };
}
