import { describe, it, expect, beforeEach } from 'vitest';
import { StateManager } from './state-manager.js';
import type { SshClientInterface, VpsState } from './types.js';

/**
 * Mock de SshClient para tests.
 */
class MockSshClient implements SshClientInterface {
  private files = new Map<string, string>();
  private directories = new Set<string>();

  async executeCommand(command: string): Promise<{ success: boolean; output?: string; error?: string }> {
    // Simular creación de directorio
    if (command.includes('mkdir -p /etc/fractal')) {
      this.directories.add('/etc/fractal');
      return { success: true, output: '' };
    }

    // Simular verificación de directorio
    if (command.includes('test -d /etc/fractal')) {
      const exists = this.directories.has('/etc/fractal');
      return { success: true, output: exists ? 'exists' : 'not_exists' };
    }

    // Simular mv
    if (command.includes('mv /etc/fractal/state.json.tmp /etc/fractal/state.json')) {
      const content = this.files.get('/etc/fractal/state.json.tmp');
      if (content) {
        this.files.set('/etc/fractal/state.json', content);
        this.files.delete('/etc/fractal/state.json.tmp');
        return { success: true, output: '' };
      }
      return { success: false, error: 'Archivo temporal no existe' };
    }

    return { success: true, output: '' };
  }

  async readFile(remotePath: string): Promise<{ success: boolean; content?: string; error?: string }> {
    if (!this.files.has(remotePath)) {
      return {
        success: false,
        error: `No such file or directory: ${remotePath}`,
      };
    }

    return {
      success: true,
      content: this.files.get(remotePath),
    };
  }

  async writeFile(remotePath: string, content: string): Promise<{ success: boolean; error?: string }> {
    this.files.set(remotePath, content);
    return { success: true };
  }

  // Helper para resetear el mock
  reset(): void {
    this.files.clear();
    this.directories.clear();
  }
}

describe('StateManager', () => {
  let mockSshClient: MockSshClient;
  let stateManager: StateManager;

  beforeEach(() => {
    mockSshClient = new MockSshClient();
    stateManager = new StateManager(mockSshClient);
  });

  describe('read', () => {
    it('devuelve exists: false cuando no existe el directorio', async () => {
      const result = await stateManager.read();

      expect(result.success).toBe(true);
      expect(result.exists).toBe(false);
      expect(result.state).toBeUndefined();
    });

    it('devuelve exists: false cuando el directorio existe pero no hay archivo', async () => {
      await mockSshClient.executeCommand('mkdir -p /etc/fractal');

      const result = await stateManager.read();

      expect(result.success).toBe(true);
      expect(result.exists).toBe(false);
      expect(result.state).toBeUndefined();
    });

    it('lee correctamente un estado existente', async () => {
      await mockSshClient.executeCommand('mkdir -p /etc/fractal');
      
      const testState: VpsState = {
        version: '1.0.0',
        provisioningSteps: {
          hardening: true,
          runtime: false,
          dns: false,
          ssl: false,
          initialDeploy: false,
        },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      await mockSshClient.writeFile('/etc/fractal/state.json', JSON.stringify(testState));

      const result = await stateManager.read();

      expect(result.success).toBe(true);
      expect(result.exists).toBe(true);
      expect(result.state).toEqual(testState);
    });

    it('maneja JSON corrupto', async () => {
      await mockSshClient.executeCommand('mkdir -p /etc/fractal');
      await mockSshClient.writeFile('/etc/fractal/state.json', 'invalid json');

      const result = await stateManager.read();

      expect(result.success).toBe(false);
      expect(result.exists).toBe(true);
      expect(result.error).toContain('JSON inválido');
    });
  });

  describe('initialize', () => {
    it('crea el estado inicial cuando no existe', async () => {
      const initResult = await stateManager.initialize();

      expect(initResult.success).toBe(true);

      const readResult = await stateManager.read();

      expect(readResult.success).toBe(true);
      expect(readResult.exists).toBe(true);
      expect(readResult.state?.version).toBe('1.0.0');
      expect(readResult.state?.provisioningSteps).toEqual({
        hardening: false,
        runtime: false,
        dns: false,
        ssl: false,
        initialDeploy: false,
      });
    });

    it('es idempotente - no falla si el estado ya existe', async () => {
      const firstInit = await stateManager.initialize();
      expect(firstInit.success).toBe(true);

      const secondInit = await stateManager.initialize();
      expect(secondInit.success).toBe(true);

      const readResult = await stateManager.read();
      expect(readResult.exists).toBe(true);
    });
  });

  describe('isStepCompleted', () => {
    it('devuelve false cuando el estado no existe', async () => {
      const result = await stateManager.isStepCompleted('hardening');

      expect(result).toBe(false);
    });

    it('devuelve false cuando el paso no está completado', async () => {
      await stateManager.initialize();

      const result = await stateManager.isStepCompleted('hardening');

      expect(result).toBe(false);
    });

    it('devuelve true cuando el paso está completado', async () => {
      await stateManager.initialize();
      await stateManager.markStepCompleted('hardening');

      const result = await stateManager.isStepCompleted('hardening');

      expect(result).toBe(true);
    });
  });

  describe('markStepCompleted', () => {
    it('marca un paso como completado', async () => {
      await stateManager.initialize();

      const markResult = await stateManager.markStepCompleted('runtime');

      expect(markResult.success).toBe(true);

      const isCompleted = await stateManager.isStepCompleted('runtime');
      expect(isCompleted).toBe(true);
    });

    it('inicializa automáticamente si el estado no existe', async () => {
      const markResult = await stateManager.markStepCompleted('dns');

      expect(markResult.success).toBe(true);

      const readResult = await stateManager.read();
      expect(readResult.exists).toBe(true);
      expect(readResult.state?.provisioningSteps.dns).toBe(true);
    });

    it('no afecta otros pasos', async () => {
      await stateManager.initialize();
      await stateManager.markStepCompleted('hardening');
      await stateManager.markStepCompleted('runtime');

      const readResult = await stateManager.read();

      expect(readResult.state?.provisioningSteps.hardening).toBe(true);
      expect(readResult.state?.provisioningSteps.runtime).toBe(true);
      expect(readResult.state?.provisioningSteps.dns).toBe(false);
      expect(readResult.state?.provisioningSteps.ssl).toBe(false);
    });
  });

  describe('updateLastDeploy', () => {
    it('actualiza la información del último deploy', async () => {
      await stateManager.initialize();

      const updateResult = await stateManager.updateLastDeploy('v1.2.3', 'abc123');

      expect(updateResult.success).toBe(true);

      const readResult = await stateManager.read();
      expect(readResult.state?.lastSuccessfulDeploy?.imageTag).toBe('v1.2.3');
      expect(readResult.state?.lastSuccessfulDeploy?.commitSha).toBe('abc123');
      expect(readResult.state?.lastSuccessfulDeploy?.timestamp).toBeDefined();
    });

    it('permite actualizar sin commitSha', async () => {
      await stateManager.initialize();

      const updateResult = await stateManager.updateLastDeploy('v1.0.0');

      expect(updateResult.success).toBe(true);

      const readResult = await stateManager.read();
      expect(readResult.state?.lastSuccessfulDeploy?.imageTag).toBe('v1.0.0');
      expect(readResult.state?.lastSuccessfulDeploy?.commitSha).toBeUndefined();
    });

    it('falla si el estado no existe', async () => {
      const updateResult = await stateManager.updateLastDeploy('v1.0.0');

      expect(updateResult.success).toBe(false);
    });
  });

  describe('getLastDeploy', () => {
    it('devuelve null cuando no hay deploy previo', async () => {
      await stateManager.initialize();

      const lastDeploy = await stateManager.getLastDeploy();

      expect(lastDeploy).toBeNull();
    });

    it('devuelve la información del último deploy', async () => {
      await stateManager.initialize();
      await stateManager.updateLastDeploy('v2.0.0', 'def456');

      const lastDeploy = await stateManager.getLastDeploy();

      expect(lastDeploy).toBeDefined();
      expect(lastDeploy?.imageTag).toBe('v2.0.0');
      expect(lastDeploy?.commitSha).toBe('def456');
    });
  });

  describe('idempotencia (AC-11)', () => {
    it('ejecutar provisioning dos veces con mismo estado no duplica configuración', async () => {
      // Primer provisioning
      await stateManager.initialize();
      await stateManager.markStepCompleted('hardening');
      await stateManager.markStepCompleted('runtime');

      const firstRead = await stateManager.read();
      const firstUpdatedAt = firstRead.state?.updatedAt;

      // Simular segundo provisioning verificando estado primero
      const isHardeningDone = await stateManager.isStepCompleted('hardening');
      const isRuntimeDone = await stateManager.isStepCompleted('runtime');

      expect(isHardeningDone).toBe(true);
      expect(isRuntimeDone).toBe(true);

      // Si el paso ya está completado, no se vuelve a ejecutar
      // (esto es responsabilidad del código que usa StateManager,
      // pero el test verifica que el estado permite detectarlo)

      const secondRead = await stateManager.read();

      // El estado no cambió porque no se marcaron pasos nuevos
      expect(secondRead.state?.provisioningSteps).toEqual(firstRead.state?.provisioningSteps);
      expect(secondRead.state?.updatedAt).toBe(firstUpdatedAt);
    });
  });
});
