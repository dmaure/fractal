import type { CrossVarConfig, CrossVarWriteResult } from './types.js';

/**
 * Gestor de variables cruzadas entre repos en multirepo.
 * 
 * Escribe las variables que necesita cada lado para comunicarse con el hermano:
 * - web → api: API_URL (URL base de la API, horneada en build time por Vite)
 * - api → web: CORS_ALLOWED_ORIGIN y SANCTUM_STATEFUL_DOMAINS
 * 
 * Cumple ADR-0012 y SPEC-0003 AC-13.
 */
export class CrossVarWriter {
  /**
   * Escribe las variables cruzadas correspondientes al rol actual.
   * 
   * IMPORTANTE: Esta implementación retorna las variables que DEBEN ser
   * escritas pero no las escribe directamente al disco. El provisioning
   * completo (AC-3 a AC-11) será responsable de escribirlas en el lugar
   * correcto (.env para api, build config para web).
   * 
   * @param config Configuración con rol actual, dominio actual y dominio del hermano
   */
  write(config: CrossVarConfig): CrossVarWriteResult {
    const { role, currentDomain, siblingDomain } = config;
    
    // Construir URLs completas (siempre HTTPS en producción)
    const currentUrl = `https://${currentDomain}`;
    const siblingUrl = `https://${siblingDomain}`;
    
    let writtenVars: Record<string, string>;
    let siblingRole: 'api' | 'web';
    let siblingVars: Record<string, string>;
    
    if (role === 'web') {
      // Este es el repo web/, necesita saber dónde está la API
      writtenVars = {
        VITE_API_URL: siblingUrl,
      };
      
      // El hermano es api/, debe saber que web/ está en currentDomain
      siblingRole = 'api';
      siblingVars = {
        CORS_ALLOWED_ORIGIN: currentUrl,
        SANCTUM_STATEFUL_DOMAINS: currentDomain,
      };
    } else {
      // Este es el repo api/, necesita saber qué origen permitir en CORS
      writtenVars = {
        CORS_ALLOWED_ORIGIN: siblingUrl,
        SANCTUM_STATEFUL_DOMAINS: siblingDomain,
      };
      
      // El hermano es web/, debe saber que api/ está en currentDomain
      siblingRole = 'web';
      siblingVars = {
        VITE_API_URL: currentUrl,
      };
    }
    
    // Generar instrucciones para el repo hermano
    const siblingInstructions = {
      siblingRole,
      varsToSet: siblingVars,
      message: this.formatSiblingInstructions(siblingRole, siblingVars),
    };
    
    return {
      success: true,
      writtenVars,
      siblingInstructions,
    };
  }
  
  /**
   * Formatea las instrucciones para configurar el repo hermano.
   */
  private formatSiblingInstructions(
    siblingRole: 'api' | 'web',
    vars: Record<string, string>
  ): string {
    const lines: string[] = [
      `\nCuando despliegues el repositorio hermano (${siblingRole}), ` +
      'deberás configurar estos secrets en tu proveedor de CI/CD:\n',
    ];
    
    for (const [key, value] of Object.entries(vars)) {
      lines.push(`  ${key}=${value}`);
    }
    
    lines.push('');
    lines.push('Estos valores permitirán que ambos repos se comuniquen correctamente.');
    
    return lines.join('\n');
  }
}
