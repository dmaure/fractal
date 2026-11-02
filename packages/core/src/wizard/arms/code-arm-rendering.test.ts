/**
 * Tests de renderizado de selectores del CodeArm (FRA-84 AC-2, AC-6).
 * 
 * Verifica que los selectores se muestran aunque haya una sola opción
 * (ADR-0016 §4).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { select } from '@inquirer/prompts';
import {
  CodeArm,
  promptFramework,
  promptDatabase,
  promptFrontend,
  DATABASE_OPTIONS,
  FRONTEND_OPTIONS,
} from './code-arm.js';

vi.mock('@inquirer/prompts');

describe('CodeArm - renderizado de selectores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('promptFramework renderiza el selector con una opción (AC-2)', async () => {
    const frameworkOptions = [
      { value: 'test-fw', name: 'Test FW', description: 'Test framework' },
    ];

    vi.mocked(select).mockResolvedValue('test-fw');

    const result = await promptFramework(frameworkOptions, 'test-fw');

    expect(result).toBe('test-fw');
    expect(select).toHaveBeenCalledWith({
      message: 'Framework del backend:',
      choices: [
        {
          value: 'test-fw',
          name: 'Test FW',
          description: 'Test framework',
        },
      ],
      default: 'test-fw',
    });
  });

  it('promptFramework renderiza con framework del adapter (AC-6)', async () => {
    const frameworkOptions = [
      { value: 'laravel', name: 'Laravel', description: 'Framework PHP' },
    ];

    vi.mocked(select).mockResolvedValue('laravel');

    const result = await promptFramework(frameworkOptions, 'laravel');

    expect(result).toBe('laravel');
    expect(select).toHaveBeenCalledTimes(1);
    const call = vi.mocked(select).mock.calls[0][0];
    expect(call.message).toBe('Framework del backend:');
    expect(call.choices).toHaveLength(1);
    expect(call.choices[0].value).toBe('laravel');
  });

  it('promptDatabase renderiza el selector con una opción (AC-2)', async () => {
    vi.mocked(select).mockResolvedValue('postgresql');

    const result = await promptDatabase();

    expect(result).toBe('postgresql');
    expect(select).toHaveBeenCalledWith({
      message: 'Base de datos:',
      choices: [
        {
          value: 'postgresql',
          name: 'PostgreSQL',
          description: 'Base de datos relacional de producción',
        },
      ],
      default: 'postgresql',
    });
  });

  it('promptFrontend renderiza el selector con una opción (AC-2)', async () => {
    vi.mocked(select).mockResolvedValue('react-vite');

    const result = await promptFrontend();

    expect(result).toBe('react-vite');
    expect(select).toHaveBeenCalledWith({
      message: 'Framework del frontend:',
      choices: [
        {
          value: 'react-vite',
          name: 'React + Vite',
          description: 'SPA con React y Vite para desarrollo rápido',
        },
      ],
      default: 'react-vite',
    });
  });

  it('los selectores tienen exactamente 1 opción cada uno (AC-2)', () => {
    // Esto es parte del cumplimiento de AC-2: mostrar aunque haya UNA opción
    expect(DATABASE_OPTIONS).toHaveLength(1);
    expect(FRONTEND_OPTIONS).toHaveLength(1);
  });

  it('CodeArm en modo interactivo llama a los prompts de framework/DB/frontend', async () => {
    const frameworkOptions = [
      { value: 'test-fw', name: 'Test FW', description: 'Test' },
    ];

    vi.mocked(select).mockImplementation((config: any) => {
      let result: string;
      if (config.message.includes('Framework del backend')) result = 'test-fw';
      else if (config.message.includes('topología')) result = 'monolith';
      else if (config.message.includes('Base de datos')) result = 'postgresql';
      else if (config.message.includes('Framework del frontend')) result = 'react-vite';
      else result = 'default';
      
      return Promise.resolve(result) as any;
    });

    const arm = new CodeArm(frameworkOptions, 'test-fw');
    const context = { mode: 'interactive' as const, projectName: 'test' };

    const result = await arm.execute(context);

    expect(result.success).toBe(true);
    expect(result.context.framework).toBe('test-fw');
    expect(result.context.database).toBe('postgresql');
    expect(result.context.frontend).toBe('react-vite');
    
    // Verificar que se llamó select para framework, topología, DB y frontend
    expect(select).toHaveBeenCalledTimes(4);
  });
});
