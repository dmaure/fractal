/**
 * Brazo Código: framework, topología, DB, frontend.
 * Obligatorio (siempre se ejecuta).
 *
 * SPEC-0032 (Wizard v2 — code-first y brazos modulares, M1.5), FRA-84.
 * Implementa el principio code-first de ADR-0016: el código se pregunta
 * antes que infraestructura.
 */

import { input, select } from '@inquirer/prompts';
import type { WizardArm, WizardContext, WizardArmResult } from '../../types/wizard-arm.js';
import { promptTopology } from '../../utils/prompts.js';

/**
 * Opciones de framework disponibles.
 * El valor es opaco para el core (Art. II): no se interpreta aquí.
 */
export interface FrameworkOption {
  value: string;
  name: string;
  description: string;
}

/**
 * Frameworks soportados.
 * En v0 solo Laravel; Rails llegará en M4.
 * El selector se muestra aunque haya una sola opción (ADR-0016 §4, AC-2).
 */
export const FRAMEWORK_OPTIONS: FrameworkOption[] = [
  {
    value: 'laravel',
    name: 'Laravel',
    description: 'Framework PHP para aplicaciones web modernas',
  },
];

export const DEFAULT_FRAMEWORK = 'laravel';

/**
 * Opciones de base de datos disponibles.
 */
export interface DatabaseOption {
  value: string;
  name: string;
  description: string;
}

/**
 * Bases de datos soportadas.
 * En v0 solo PostgreSQL; otras opciones pueden llegar en el futuro.
 */
export const DATABASE_OPTIONS: DatabaseOption[] = [
  {
    value: 'postgresql',
    name: 'PostgreSQL',
    description: 'Base de datos relacional de producción',
  },
];

export const DEFAULT_DATABASE = 'postgresql';

/**
 * Opciones de frontend disponibles.
 */
export interface FrontendOption {
  value: string;
  name: string;
  description: string;
}

/**
 * Frameworks de frontend soportados.
 * En v0 solo React+Vite; otras opciones pueden llegar en el futuro.
 */
export const FRONTEND_OPTIONS: FrontendOption[] = [
  {
    value: 'react-vite',
    name: 'React + Vite',
    description: 'SPA con React y Vite para desarrollo rápido',
  },
];

export const DEFAULT_FRONTEND = 'react-vite';

/**
 * Prompt para el nombre del proyecto.
 * Reutilizable: si el contexto ya tiene projectName, lo devuelve sin preguntar.
 */
export async function promptProjectName(current?: string): Promise<string> {
  if (current) {
    return current;
  }
  return input({
    message: 'Nombre del proyecto:',
    validate: (value) => {
      if (!value.trim()) return 'El nombre del proyecto es requerido';
      if (/\s/.test(value.trim())) return 'El nombre no puede contener espacios';
      return true;
    },
  }).then((value) => value.trim());
}

/**
 * Prompt para seleccionar el framework.
 * Visible aunque haya una sola opción (ADR-0016 §4, AC-2).
 */
export async function promptFramework(): Promise<string> {
  return select({
    message: 'Framework del backend:',
    choices: FRAMEWORK_OPTIONS.map((opt) => ({
      value: opt.value,
      name: opt.name,
      description: opt.description,
    })),
    default: DEFAULT_FRAMEWORK,
  });
}

/**
 * Prompt para seleccionar la base de datos.
 * Visible aunque haya una sola opción (ADR-0016 §4, AC-2).
 */
export async function promptDatabase(): Promise<string> {
  return select({
    message: 'Base de datos:',
    choices: DATABASE_OPTIONS.map((opt) => ({
      value: opt.value,
      name: opt.name,
      description: opt.description,
    })),
    default: DEFAULT_DATABASE,
  });
}

/**
 * Prompt para seleccionar el frontend.
 * Visible aunque haya una sola opción (ADR-0016 §4, AC-2).
 */
export async function promptFrontend(): Promise<string> {
  return select({
    message: 'Framework del frontend:',
    choices: FRONTEND_OPTIONS.map((opt) => ({
      value: opt.value,
      name: opt.name,
      description: opt.description,
    })),
    default: DEFAULT_FRONTEND,
  });
}

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
    // En modo no-interactivo o skip, no se ejecutan prompts.
    // Los valores vienen por flags/env (FRA-88/T7).
    if (context.mode === 'non-interactive' || context.mode === 'skip') {
      return {
        success: true,
        context,
      };
    }

    // Modo interactivo: preguntar valores en orden code-first.
    console.log('\n🎨 Código del proyecto\n');

    try {
      const projectName = await promptProjectName(context.projectName);
      const framework = await promptFramework();
      const topology = context.topology ?? (await promptTopology());
      const database = await promptDatabase();
      const frontend = await promptFrontend();

      return {
        success: true,
        context: {
          ...context,
          projectName,
          framework,
          topology,
          database,
          frontend,
        },
      };
    } catch (error) {
      return {
        success: false,
        context,
        error: `Error al recolectar datos de código: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
