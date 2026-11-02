/**
 * Brazo Checklist: qué datos tiene el usuario.
 * Siempre se ejecuta primero (FRA-83, SPEC-0032 AC-1).
 *
 * Pregunta sí/no/algunos sobre servidor, dominio, GitHub token.
 * Las respuestas habilitan/deshabilitan otros brazos (ADR-0016 §3).
 */

import { select } from '@inquirer/prompts';
import type { WizardArm, WizardContext, WizardArmResult } from '../../types/wizard-arm.js';

export class ChecklistArm implements WizardArm {
  readonly id = 'checklist';
  readonly name = 'Checklist inicial';
  readonly responsibility = 'Determina qué datos tiene el usuario (servidor, dominio, GitHub)';
  readonly required = true;

  isEnabled(_context: WizardContext): boolean {
    // Siempre habilitado: primer paso obligatorio del wizard
    return true;
  }

  async execute(context: WizardContext): Promise<WizardArmResult> {
    const { mode = 'interactive' } = context;

    // En modo no-interactivo, derivar del contexto existente
    if (mode === 'non-interactive' || mode === 'skip') {
      return {
        success: true,
        context: {
          ...context,
          checklist: this.deriveFromContext(context),
        },
      };
    }

    // Modo interactivo: preguntar al usuario
    try {
      const hasServer = await select({
        message: '¿Tenés un servidor para desplegar?',
        choices: [
          {
            value: 'yes' as const,
            name: 'Sí, tengo un servidor listo',
            description: 'Voy a ingresar IP, SSH, dominio y DNS ahora',
          },
          {
            value: 'no' as const,
            name: 'No, solo quiero el proyecto local',
            description: 'Fractal generará el proyecto sin configurar deploy',
          },
          {
            value: 'later' as const,
            name: 'Lo agrego después',
            description: 'Genero el proyecto ahora, despliego más tarde con fractal deploy',
          },
        ],
        default: 'later',
      });

      let hasDomain: 'yes' | 'no' | 'manual' = 'no';
      if (hasServer === 'yes') {
        hasDomain = await select({
          message: '¿Tenés un dominio y querés configurar DNS automático?',
          choices: [
            {
              value: 'yes' as const,
              name: 'Sí, con DNS automático',
              description: 'Fractal configurará DNS vía API (Cloudflare o Route53)',
            },
            {
              value: 'manual' as const,
              name: 'Sí, pero lo configuro manualmente',
              description: 'Fractal mostrará qué registros DNS crear',
            },
            {
              value: 'no' as const,
              name: 'No tengo dominio todavía',
            },
          ],
          default: 'manual',
        });
      }

      const hasGitHubToken = await select({
        message: '¿Tenés un token de GitHub y querés que Fractal cree el repositorio?',
        choices: [
          {
            value: 'yes' as const,
            name: 'Sí, crear el repositorio remoto',
            description: 'Fractal creará el repo en GitHub y seteará secrets',
          },
          {
            value: 'no' as const,
            name: 'No / lo creo manualmente',
            description: 'Solo genero el proyecto local con git',
          },
        ],
        default: 'no',
      });

      return {
        success: true,
        context: {
          ...context,
          checklist: {
            hasServer,
            hasDomain,
            hasGitHubToken,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        context,
        error: `Error en checklist: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Deriva las respuestas del checklist del contexto existente
   * (modo no-interactivo).
   */
  private deriveFromContext(context: WizardContext): {
    hasServer: 'yes' | 'no' | 'later';
    hasDomain: 'yes' | 'no' | 'manual';
    hasGitHubToken: 'yes' | 'no';
  } {
    // Si hay datos de infraestructura en el contexto, asumir que tiene servidor
    const hasInfraData = Boolean(context.infrastructure);
    const hasDnsApiToken = Boolean(context.infrastructure?.dnsApiToken);
    const hasGitHubData = Boolean(context.github?.token);

    return {
      hasServer: hasInfraData ? 'yes' : 'later',
      hasDomain: hasInfraData
        ? hasDnsApiToken
          ? 'yes'
          : 'manual'
        : 'no',
      hasGitHubToken: hasGitHubData ? 'yes' : 'no',
    };
  }
}
