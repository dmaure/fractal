/**
 * Brazo Base de datos: contraseña de producción (generate-or-ask).
 * Condicional: solo corre si hay deploy (datos de infraestructura, FRA-85).
 *
 * SPEC-0032, AC-7, FRA-87. La contraseña no se escribe en el .env local
 * (FRA-76): vive como secret del pipeline.
 */

import type { WizardArm, WizardContext, WizardArmResult } from '../../types/wizard-arm.js';
import {
  promptDbPassword,
  resolveDbPasswordFromFlagsOrEnv,
  type DbPasswordOptions,
} from '../../utils/db-password.js';

export class DatabaseArm implements WizardArm {
  readonly id = 'database';
  readonly name = 'Base de datos';
  readonly responsibility = 'Genera o pide contraseña de base (condicional)';
  readonly required = false;

  constructor(private readonly options: DbPasswordOptions = {}) {}

  isEnabled(context: WizardContext): boolean {
    // Condicional: solo si hay datos de infraestructura (deploy)
    return Boolean(context.infrastructure);
  }

  async execute(context: WizardContext): Promise<WizardArmResult> {
    const { mode = 'interactive' } = context;

    if (mode === 'interactive') {
      try {
        console.log('\nSecrets del workflow\n');
        console.log('   No se escribe un .env local: un .env subido pisaría /home/deploy/.env (FRA-76).');
        const { dbPassword, dbPasswordGenerated } = await promptDbPassword();
        return {
          success: true,
          context: {
            ...context,
            databasePassword: { password: dbPassword, passwordGenerated: dbPasswordGenerated },
          },
        };
      } catch (error) {
        return {
          success: false,
          context,
          error: `Error en base de datos: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    // No interactivo: flags/env, con generación por defecto
    const { result, error } = resolveDbPasswordFromFlagsOrEnv(this.options);
    if (!result) {
      return { success: false, context, error };
    }

    return {
      success: true,
      context: {
        ...context,
        databasePassword: {
          password: result.dbPassword,
          passwordGenerated: result.dbPasswordGenerated,
        },
      },
    };
  }
}
