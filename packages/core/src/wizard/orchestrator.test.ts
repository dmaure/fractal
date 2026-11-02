/**
 * Tests del orquestador del wizard v2 (SPEC-0032, AC-1..4).
 */

import { describe, it, expect, vi } from 'vitest';
import { orchestrateWizard } from './orchestrator.js';
import type { WizardArm, WizardContext, WizardArmResult } from '../types/wizard-arm.js';

/**
 * Brazo de prueba que siempre se ejecuta.
 */
class TestArm implements WizardArm {
  id: string;
  name: string;
  responsibility: string;
  required: boolean;
  private executeImpl: (context: WizardContext) => Promise<WizardArmResult>;

  constructor(
    id: string,
    executeImpl: (context: WizardContext) => Promise<WizardArmResult>,
    required = false
  ) {
    this.id = id;
    this.name = `Test arm ${id}`;
    this.responsibility = `Test ${id}`;
    this.required = required;
    this.executeImpl = executeImpl;
  }

  isEnabled(_context: WizardContext): boolean {
    return true;
  }

  execute(context: WizardContext): Promise<WizardArmResult> {
    return this.executeImpl(context);
  }
}

/**
 * Brazo de prueba con habilitación condicional.
 */
class ConditionalArm extends TestArm {
  private enabledImpl: (context: WizardContext) => boolean;

  constructor(
    id: string,
    enabledImpl: (context: WizardContext) => boolean,
    executeImpl: (context: WizardContext) => Promise<WizardArmResult>
  ) {
    super(id, executeImpl);
    this.enabledImpl = enabledImpl;
  }

  isEnabled(context: WizardContext): boolean {
    return this.enabledImpl(context);
  }
}

describe('orchestrateWizard', () => {
  it('ejecuta brazos habilitados en orden', async () => {
    const executionOrder: string[] = [];

    const arm1 = new TestArm('arm1', async (ctx) => {
      executionOrder.push('arm1');
      return {
        success: true,
        context: { ...ctx, step1: 'done' },
      };
    });

    const arm2 = new TestArm('arm2', async (ctx) => {
      executionOrder.push('arm2');
      return {
        success: true,
        context: { ...ctx, step2: 'done' },
      };
    });

    const arm3 = new TestArm('arm3', async (ctx) => {
      executionOrder.push('arm3');
      return {
        success: true,
        context: { ...ctx, step3: 'done' },
      };
    });

    const result = await orchestrateWizard({
      arms: [arm1, arm2, arm3],
      initialContext: {},
    });

    expect(result.success).toBe(true);
    expect(executionOrder).toEqual(['arm1', 'arm2', 'arm3']);
    expect(result.executedArms).toEqual(['arm1', 'arm2', 'arm3']);
    expect(result.skippedArms).toEqual([]);
  });

  it('acumula salidas de brazos', async () => {
    const arm1 = new TestArm('arm1', async (ctx) => ({
      success: true,
      context: { ...ctx, projectName: 'test-project' },
    }));

    const arm2 = new TestArm('arm2', async (ctx) => ({
      success: true,
      context: { ...ctx, topology: 'monolith' as const },
    }));

    const arm3 = new TestArm('arm3', async (ctx) => ({
      success: true,
      context: { ...ctx, mode: 'interactive' as const },
    }));

    const result = await orchestrateWizard({
      arms: [arm1, arm2, arm3],
      initialContext: {},
    });

    expect(result.success).toBe(true);
    expect(result.context).toEqual({
      projectName: 'test-project',
      topology: 'monolith',
      mode: 'interactive',
    });
  });

  it('saltea brazos deshabilitados sin ejecutarlos', async () => {
    const executionOrder: string[] = [];

    const arm1 = new TestArm('arm1', async (ctx) => {
      executionOrder.push('arm1');
      return { success: true, context: ctx };
    });

    const arm2 = new ConditionalArm(
      'arm2',
      () => false, // deshabilitado
      async (ctx) => {
        executionOrder.push('arm2');
        return { success: true, context: ctx };
      }
    );

    const arm3 = new TestArm('arm3', async (ctx) => {
      executionOrder.push('arm3');
      return { success: true, context: ctx };
    });

    const result = await orchestrateWizard({
      arms: [arm1, arm2, arm3],
      initialContext: {},
    });

    expect(result.success).toBe(true);
    expect(executionOrder).toEqual(['arm1', 'arm3']); // arm2 no se ejecutó
    expect(result.executedArms).toEqual(['arm1', 'arm3']);
    expect(result.skippedArms).toEqual(['arm2']);
  });

  it('detiene la ejecución si un brazo falla', async () => {
    const executionOrder: string[] = [];

    const arm1 = new TestArm('arm1', async (ctx) => {
      executionOrder.push('arm1');
      return { success: true, context: ctx };
    });

    const arm2 = new TestArm('arm2', async () => {
      executionOrder.push('arm2');
      return { success: false, context: {}, error: 'Falló arm2' };
    });

    const arm3 = new TestArm('arm3', async (ctx) => {
      executionOrder.push('arm3');
      return { success: true, context: ctx };
    });

    const result = await orchestrateWizard({
      arms: [arm1, arm2, arm3],
      initialContext: {},
    });

    expect(result.success).toBe(false);
    expect(executionOrder).toEqual(['arm1', 'arm2']); // arm3 no se ejecutó
    expect(result.executedArms).toEqual(['arm1']);
    expect(result.error).toEqual({
      armId: 'arm2',
      message: 'Falló arm2',
    });
  });

  it('habilitación condicional basada en contexto previo', async () => {
    const arm1 = new TestArm('arm1', async (ctx) => ({
      success: true,
      context: { ...ctx, hasInfrastructure: true },
    }));

    // arm2 solo se habilita si arm1 seteó hasInfrastructure
    const arm2 = new ConditionalArm(
      'arm2',
      (ctx) => Boolean(ctx.hasInfrastructure),
      async (ctx) => ({
        success: true,
        context: { ...ctx, database: { password: 'secret', passwordGenerated: false } },
      })
    );

    const result = await orchestrateWizard({
      arms: [arm1, arm2],
      initialContext: {},
    });

    expect(result.success).toBe(true);
    expect(result.executedArms).toEqual(['arm1', 'arm2']);
    expect(result.context.database).toEqual({ password: 'secret', passwordGenerated: false });
  });

  it('contexto inicial se preserva y extiende', async () => {
    const arm1 = new TestArm('arm1', async (ctx) => ({
      success: true,
      context: { ...ctx, added: 'value' },
    }));

    const result = await orchestrateWizard({
      arms: [arm1],
      initialContext: { existing: 'data' },
    });

    expect(result.success).toBe(true);
    expect(result.context).toEqual({
      existing: 'data',
      added: 'value',
    });
  });

  it('con lista vacía de brazos devuelve contexto inicial', async () => {
    const result = await orchestrateWizard({
      arms: [],
      initialContext: { test: 'data' },
    });

    expect(result.success).toBe(true);
    expect(result.context).toEqual({ test: 'data' });
    expect(result.executedArms).toEqual([]);
    expect(result.skippedArms).toEqual([]);
  });
});
