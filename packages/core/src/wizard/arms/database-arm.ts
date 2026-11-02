/**
 * Brazo Base de datos: contraseña.
 * Condicional (solo si hay deploy).
 *
 * SPEC-0032, AC-7. Placeholder — implementación concreta en FRA-87.
 */

import type { WizardArm, WizardContext, WizardArmResult } from '../../types/wizard-arm.js';

export class DatabaseArm implements WizardArm {
  readonly id = 'database';
  readonly name = 'Base de datos';
  readonly responsibility = 'Genera o pide contraseña de base (condicional)';
  readonly required = false;

  isEnabled(context: WizardContext): boolean {
    // Condicional: solo si hay datos de infraestructura (deploy)
    return Boolean(context.infrastructure);
  }

  async execute(context: WizardContext): Promise<WizardArmResult> {
    // Placeholder: implementación concreta en FRA-87
    return {
      success: true,
      context,
    };
  }
}
