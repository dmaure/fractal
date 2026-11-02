/**
 * Brazo Dominio (FDL): entidades, campos, relaciones.
 * Opcional.
 *
 * SPEC-0032, AC-7. Placeholder — implementación concreta más adelante.
 */

import type { WizardArm, WizardContext, WizardArmResult } from '../../types/wizard-arm.js';

export class DomainArm implements WizardArm {
  readonly id = 'domain';
  readonly name = 'Dominio (FDL)';
  readonly responsibility = 'Recolecta definición del dominio en FDL (opcional)';
  readonly required = false;

  isEnabled(_context: WizardContext): boolean {
    // Placeholder: se habilita explícitamente cuando el usuario lo solicita
    // (checklist o flag). Por ahora siempre false.
    return false;
  }

  async execute(context: WizardContext): Promise<WizardArmResult> {
    // Placeholder: implementación concreta cuando se conecte el brazo
    return {
      success: true,
      context,
    };
  }
}
