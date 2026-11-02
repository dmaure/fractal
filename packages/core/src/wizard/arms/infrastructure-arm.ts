/**
 * Brazo Infraestructura: VPS, SSH, dominio, DNS.
 * Opcional (solo si el usuario tiene servidor).
 *
 * SPEC-0032, AC-7. Placeholder — implementación concreta en FRA-85.
 */

import type { WizardArm, WizardContext, WizardArmResult } from '../../types/wizard-arm.js';

export class InfrastructureArm implements WizardArm {
  readonly id = 'infrastructure';
  readonly name = 'Infraestructura';
  readonly responsibility = 'Recolecta IP, SSH, dominio, DNS (opcional)';
  readonly required = false;

  isEnabled(_context: WizardContext): boolean {
    // Placeholder: se habilita si el checklist indica que el usuario tiene
    // servidor. Por ahora siempre false.
    return false;
  }

  async execute(context: WizardContext): Promise<WizardArmResult> {
    // Placeholder: implementación concreta en FRA-85
    return {
      success: true,
      context,
    };
  }
}
