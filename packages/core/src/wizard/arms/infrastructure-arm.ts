/**
 * Brazo Infraestructura: VPS, SSH, dominio, DNS.
 * Opcional (solo si el usuario tiene servidor).
 *
 * SPEC-0032, AC-7, FRA-85.
 */

import type { WizardArm, WizardContext, WizardArmResult } from '../../types/wizard-arm.js';
import { promptDeployParams } from '../../utils/deploy-prompts.js';

export class InfrastructureArm implements WizardArm {
  readonly id = 'infrastructure';
  readonly name = 'Infraestructura';
  readonly responsibility = 'Recolecta IP, SSH, dominio, DNS (opcional)';
  readonly required = false;

  isEnabled(context: WizardContext): boolean {
    // Habilitado si el checklist indica que el usuario tiene servidor
    return context.checklist?.hasServer === 'yes';
  }

  async execute(context: WizardContext): Promise<WizardArmResult> {
    const { mode = 'interactive' } = context;

    // En modo interactivo, preguntar al usuario
    if (mode === 'interactive') {
      try {
        const deployParams = await promptDeployParams(false, undefined, {
          skipGitRepository: true,
        });

        return {
          success: true,
          context: {
            ...context,
            infrastructure: {
              serverIp: deployParams.serverIp,
              sshUser: deployParams.sshUser,
              authMethod: deployParams.authMethod,
              sshKeyPath: deployParams.sshKeyPath,
              sshPassword: deployParams.sshPassword,
              domain: deployParams.domain,
              email: deployParams.email,
              dnsProvider: deployParams.dnsProvider,
              dnsApiToken: deployParams.dnsApiToken,
            },
          },
        };
      } catch (error) {
        return {
          success: false,
          context,
          error: `Error en infraestructura: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    // En modo no-interactivo o skip, los datos ya deberían estar en el contexto
    if (!context.infrastructure) {
      return {
        success: false,
        context,
        error: 'Datos de infraestructura requeridos pero no provistos en contexto',
      };
    }

    return {
      success: true,
      context,
    };
  }
}
