/**
 * Orquestador del wizard v2 (SPEC-0032, ADR-0016).
 *
 * Ejecuta los brazos habilitados en orden, acumulando sus salidas en un
 * contexto compartido. No contiene lógica específica de framework (Art. II).
 */

import type { WizardArm, WizardContext, WizardArmResult } from '../types/wizard-arm.js';

/**
 * Configuración del orquestador.
 */
export interface OrchestratorConfig {
  /**
   * Lista ordenada de brazos a ejecutar.
   */
  arms: WizardArm[];

  /**
   * Contexto inicial.
   */
  initialContext: WizardContext;
}

/**
 * Resultado de la orquestación completa.
 */
export interface OrchestratorResult {
  /**
   * Si la orquestación completó exitosamente.
   */
  success: boolean;

  /**
   * Contexto final tras ejecutar todos los brazos.
   */
  context: WizardContext;

  /**
   * Brazos que se ejecutaron.
   */
  executedArms: string[];

  /**
   * Brazos que se saltearon (deshabilitados).
   */
  skippedArms: string[];

  /**
   * Error, si alguno falló.
   */
  error?: {
    armId: string;
    message: string;
  };
}

/**
 * Ejecuta los brazos del wizard en orden, respetando habilitación.
 */
export async function orchestrateWizard(config: OrchestratorConfig): Promise<OrchestratorResult> {
  const { arms, initialContext } = config;
  let context = { ...initialContext };
  const executedArms: string[] = [];
  const skippedArms: string[] = [];

  for (const arm of arms) {
    // Verificar si el brazo está habilitado
    const enabled = arm.isEnabled(context);

    if (!enabled) {
      skippedArms.push(arm.id);
      continue;
    }

    // Ejecutar el brazo
    const result: WizardArmResult = await arm.execute(context);

    if (!result.success) {
      return {
        success: false,
        context,
        executedArms,
        skippedArms,
        error: {
          armId: arm.id,
          message: result.error || 'Error desconocido',
        },
      };
    }

    // Acumular salida
    context = result.context;
    executedArms.push(arm.id);
  }

  return {
    success: true,
    context,
    executedArms,
    skippedArms,
  };
}
