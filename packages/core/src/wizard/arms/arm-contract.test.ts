/**
 * Tests del contrato de brazo (SPEC-0032, AC-4, AC-7).
 *
 * Verifica que un brazo puede reemplazarse sin afectar al resto.
 */

import { describe, it, expect } from 'vitest';
import { orchestrateWizard } from '../orchestrator.js';
import type { WizardArm, WizardContext, WizardArmResult } from '../../types/wizard-arm.js';

/**
 * Brazo original.
 */
class OriginalArm implements WizardArm {
  readonly id = 'test-arm';
  readonly name = 'Original';
  readonly responsibility = 'Original implementation';
  readonly required = false;

  isEnabled(): boolean {
    return true;
  }

  async execute(context: WizardContext): Promise<WizardArmResult> {
    return {
      success: true,
      context: {
        ...context,
        implementation: 'original',
      },
    };
  }
}

/**
 * Brazo doble que reemplaza al original con lógica distinta.
 */
class ReplacementArm implements WizardArm {
  readonly id = 'test-arm'; // mismo id
  readonly name = 'Replacement';
  readonly responsibility = 'Replacement implementation';
  readonly required = false;

  isEnabled(): boolean {
    return true;
  }

  async execute(context: WizardContext): Promise<WizardArmResult> {
    return {
      success: true,
      context: {
        ...context,
        implementation: 'replacement',
      },
    };
  }
}

/**
 * Brazo independiente (no debería afectarse por el reemplazo).
 */
class IndependentArm implements WizardArm {
  readonly id = 'independent';
  readonly name = 'Independent';
  readonly responsibility = 'Independent logic';
  readonly required = false;

  isEnabled(): boolean {
    return true;
  }

  async execute(context: WizardContext): Promise<WizardArmResult> {
    return {
      success: true,
      context: {
        ...context,
        independent: 'works',
      },
    };
  }
}

describe('contrato de brazo — reemplazo', () => {
  it('un brazo puede reemplazarse sin afectar a los demás', async () => {
    const independent = new IndependentArm();

    // Ejecución con brazo original
    const resultOriginal = await orchestrateWizard({
      arms: [new OriginalArm(), independent],
      initialContext: {},
    });

    expect(resultOriginal.success).toBe(true);
    expect(resultOriginal.context.implementation).toBe('original');
    expect(resultOriginal.context.independent).toBe('works');

    // Ejecución con brazo reemplazado (mismo id, distinta implementación)
    const resultReplacement = await orchestrateWizard({
      arms: [new ReplacementArm(), independent],
      initialContext: {},
    });

    expect(resultReplacement.success).toBe(true);
    expect(resultReplacement.context.implementation).toBe('replacement');
    expect(resultReplacement.context.independent).toBe('works');

    // El brazo independiente se ejecutó igual en ambos casos
    expect(resultOriginal.executedArms).toContain('independent');
    expect(resultReplacement.executedArms).toContain('independent');
  });

  it('reemplazar un brazo no requiere cambios en el orquestador', async () => {
    // El orquestador solo conoce el contrato WizardArm, no las implementaciones
    // concretas. Reemplazar un brazo es solo cambiar qué instancia se pasa.

    const arms1: WizardArm[] = [new OriginalArm()];
    const arms2: WizardArm[] = [new ReplacementArm()];

    const result1 = await orchestrateWizard({
      arms: arms1,
      initialContext: {},
    });

    const result2 = await orchestrateWizard({
      arms: arms2,
      initialContext: {},
    });

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    // Mismo orquestador, brazos intercambiables
    expect(result1.context.implementation).toBe('original');
    expect(result2.context.implementation).toBe('replacement');
  });
});
