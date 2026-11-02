/**
 * Brazo Código: framework, topología, DB, frontend.
 * Obligatorio (siempre se ejecuta).
 *
 * SPEC-0032, AC-7. Placeholder — implementación concreta en FRA-84.
 */

import type { WizardArm, WizardContext, WizardArmResult } from '../../types/wizard-arm.js';

export class CodeArm implements WizardArm {
  readonly id = 'code';
  readonly name = 'Código';
  readonly responsibility =
    'Recolecta nombre del proyecto, framework, topología, base de datos, frontend';
  readonly required = true;

  isEnabled(_context: WizardContext): boolean {
    // Brazo obligatorio: siempre habilitado
    return true;
  }

  async execute(context: WizardContext): Promise<WizardArmResult> {
    // Placeholder: en FRA-84 se implementa la lógica de recolección
    // Por ahora, devuelve el contexto tal cual
    return {
      success: true,
      context,
    };
  }
}
