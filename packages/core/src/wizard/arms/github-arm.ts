/**
 * Brazo GitHub: crear repo remoto, setear secrets.
 * Opcional, independiente de infraestructura.
 *
 * SPEC-0032, AC-7. Placeholder — implementación concreta en FRA-86.
 */

import type { WizardArm, WizardContext, WizardArmResult } from '../../types/wizard-arm.js';

export class GitHubArm implements WizardArm {
  readonly id = 'github';
  readonly name = 'GitHub';
  readonly responsibility = 'Crea repositorio remoto y setea secrets (opcional)';
  readonly required = false;

  isEnabled(_context: WizardContext): boolean {
    // Placeholder: se habilita si el usuario provee token de GitHub (checklist
    // o flag). Por ahora siempre false.
    return false;
  }

  async execute(context: WizardContext): Promise<WizardArmResult> {
    // Placeholder: implementación concreta en FRA-86
    return {
      success: true,
      context,
    };
  }
}
