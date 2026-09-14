import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RollbackManager } from './rollback-manager.js';
import type { SshClientInterface, HealthcheckConfig } from './types.js';

/**
 * Mock de SshClient para tests.
 */
class MockSshClient implements SshClientInterface {
  private commandResponses = new Map<string, { success: boolean; output?: string; error?: string }>();
  private commandHistory: string[] = [];

  setCommandResponse(
    command: string,
    response: { success: boolean; output?: string; error?: string }
  ): void {
    this.commandResponses.set(command, response);
  }

  async executeCommand(command: string): Promise<{ success: boolean; output?: string; error?: string }> {
    this.commandHistory.push(command);

    // Buscar respuesta exacta
    if (this.commandResponses.has(command)) {
      return this.commandResponses.get(command)!;
    }

    // Buscar respuesta por patrón
    for (const [pattern, response] of this.commandResponses.entries()) {
      if (command.includes(pattern)) {
        return response;
      }
    }

    // Respuesta por defecto
    return { success: true, output: '' };
  }

  getCommandHistory(): string[] {
    return [...this.commandHistory];
  }

  reset(): void {
    this.commandResponses.clear();
    this.commandHistory = [];
  }
}

describe('RollbackManager', () => {
  let mockSshClient: MockSshClient;
  let rollbackManager: RollbackManager;

  beforeEach(() => {
    mockSshClient = new MockSshClient();
    rollbackManager = new RollbackManager(
      mockSshClient,
      'test-project',
      '/var/www/html/docker-compose.yml'
    );
  });

  describe('performHealthcheck', () => {
    const healthcheckConfig: HealthcheckConfig = {
      url: 'http://localhost/health',
      timeout: 5000,
      retries: 3,
      retryInterval: 1000,
      acceptableStatusCodes: [200, 204],
    };

    it('retorna success cuando el healthcheck pasa', async () => {
      mockSshClient.setCommandResponse('curl', {
        success: true,
        output: '200',
      });

      const result = await rollbackManager.performHealthcheck(healthcheckConfig);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.responseTime).toBeDefined();
    });

    it('acepta múltiples códigos de estado', async () => {
      mockSshClient.setCommandResponse('curl', {
        success: true,
        output: '204',
      });

      const result = await rollbackManager.performHealthcheck(healthcheckConfig);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(204);
    });

    it('reintenta cuando falla y luego tiene éxito', async () => {
      let callCount = 0;
      const originalExecute = mockSshClient.executeCommand.bind(mockSshClient);
      
      mockSshClient.executeCommand = vi.fn(async (command: string) => {
        if (command.includes('curl')) {
          callCount++;
          if (callCount < 2) {
            return { success: true, output: '500' };
          }
          return { success: true, output: '200' };
        }
        return originalExecute(command);
      });

      const result = await rollbackManager.performHealthcheck({
        ...healthcheckConfig,
        retryInterval: 100, // Reducir para test más rápido
      });

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(callCount).toBeGreaterThanOrEqual(2);
    });

    it('falla después de agotar reintentos', async () => {
      mockSshClient.setCommandResponse('curl', {
        success: true,
        output: '500',
      });

      const result = await rollbackManager.performHealthcheck({
        ...healthcheckConfig,
        retries: 2,
        retryInterval: 100,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('no aceptable');
    });

    it('maneja errores de conexión', async () => {
      mockSshClient.setCommandResponse('curl', {
        success: false,
        error: 'Connection refused',
      });

      const result = await rollbackManager.performHealthcheck({
        ...healthcheckConfig,
        retries: 1,
        retryInterval: 100,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection refused');
    });
  });

  describe('rollback', () => {
    it('ejecuta rollback exitosamente', async () => {
      mockSshClient.setCommandResponse('docker compose down', { success: true });
      mockSshClient.setCommandResponse('sed -i.bak', { success: true });
      mockSshClient.setCommandResponse('docker compose up -d', { success: true });

      const result = await rollbackManager.rollback('v1.0.0');

      expect(result.success).toBe(true);
      expect(result.rolledBackTo).toBe('v1.0.0');

      const history = mockSshClient.getCommandHistory();
      expect(history.some(cmd => cmd.includes('docker compose down'))).toBe(true);
      expect(history.some(cmd => cmd.includes('sed'))).toBe(true);
      expect(history.some(cmd => cmd.includes('docker compose up -d'))).toBe(true);
    });

    it('falla si no puede detener contenedores', async () => {
      mockSshClient.setCommandResponse('docker compose down', {
        success: false,
        error: 'Cannot connect to docker daemon',
      });

      const result = await rollbackManager.rollback('v1.0.0');

      expect(result.success).toBe(false);
      expect(result.error).toContain('detener contenedores');
    });

    it('falla si no puede actualizar docker-compose.yml', async () => {
      mockSshClient.setCommandResponse('docker compose down', { success: true });
      mockSshClient.setCommandResponse('sed -i.bak', {
        success: false,
        error: 'Permission denied',
      });

      const result = await rollbackManager.rollback('v1.0.0');

      expect(result.success).toBe(false);
      expect(result.error).toContain('actualizar docker-compose.yml');
    });

    it('falla si no puede levantar contenedores', async () => {
      mockSshClient.setCommandResponse('docker compose down', { success: true });
      mockSshClient.setCommandResponse('sed -i.bak', { success: true });
      mockSshClient.setCommandResponse('docker compose up -d', {
        success: false,
        error: 'Image not found',
      });

      const result = await rollbackManager.rollback('v1.0.0');

      expect(result.success).toBe(false);
      expect(result.error).toContain('levantar contenedores');
    });
  });

  describe('deployWithAutoRollback', () => {
    const healthcheckConfig: HealthcheckConfig = {
      url: 'http://localhost/health',
      timeout: 5000,
      retries: 2,
      retryInterval: 100,
      acceptableStatusCodes: [200],
    };

    it('despliega exitosamente cuando el healthcheck pasa', async () => {
      mockSshClient.setCommandResponse('sed -i.bak', { success: true });
      mockSshClient.setCommandResponse('docker compose up -d', { success: true });
      mockSshClient.setCommandResponse('curl', { success: true, output: '200' });

      const result = await rollbackManager.deployWithAutoRollback(
        'v2.0.0',
        'v1.0.0',
        healthcheckConfig
      );

      expect(result.success).toBe(true);
      expect(result.deployed).toBe(true);
      expect(result.healthcheckPassed).toBe(true);
      expect(result.rolledBack).toBe(false);
      expect(result.currentImageTag).toBe('v2.0.0');
    }, 10000);

    it('hace rollback automático cuando el healthcheck falla (AC-10)', async () => {
      // Deploy inicial exitoso
      mockSshClient.setCommandResponse('sed -i.bak', { success: true });
      mockSshClient.setCommandResponse('docker compose up -d', { success: true });
      
      // Healthcheck falla
      mockSshClient.setCommandResponse('curl', { success: true, output: '500' });
      
      // Rollback exitoso
      mockSshClient.setCommandResponse('docker compose down', { success: true });

      const result = await rollbackManager.deployWithAutoRollback(
        'v2.0.0',
        'v1.0.0',
        healthcheckConfig
      );

      expect(result.success).toBe(false);
      expect(result.deployed).toBe(true);
      expect(result.healthcheckPassed).toBe(false);
      expect(result.rolledBack).toBe(true);
      expect(result.currentImageTag).toBe('v1.0.0');
      expect(result.error).toContain('Rollback exitoso a v1.0.0');

      const history = mockSshClient.getCommandHistory();
      expect(history.some(cmd => cmd.includes('docker compose down'))).toBe(true);
    }, 10000);

    it('reporta error si no hay versión anterior para rollback', async () => {
      mockSshClient.setCommandResponse('sed -i.bak', { success: true });
      mockSshClient.setCommandResponse('docker compose up -d', { success: true });
      mockSshClient.setCommandResponse('curl', { success: true, output: '500' });

      const result = await rollbackManager.deployWithAutoRollback(
        'v1.0.0',
        null,
        healthcheckConfig
      );

      expect(result.success).toBe(false);
      expect(result.deployed).toBe(true);
      expect(result.healthcheckPassed).toBe(false);
      expect(result.rolledBack).toBe(false);
      expect(result.error).toContain('no hay versión anterior');
    }, 10000);

    it('reporta error si el deploy falla antes del healthcheck', async () => {
      mockSshClient.setCommandResponse('sed -i.bak', { success: true });
      mockSshClient.setCommandResponse('docker compose up -d', {
        success: false,
        error: 'Container failed to start',
      });

      const result = await rollbackManager.deployWithAutoRollback(
        'v2.0.0',
        'v1.0.0',
        healthcheckConfig
      );

      expect(result.success).toBe(false);
      expect(result.deployed).toBe(false);
      expect(result.healthcheckPassed).toBe(false);
      expect(result.rolledBack).toBe(false);
    });

    it('reporta error si el rollback falla después de healthcheck fallido', async () => {
      mockSshClient.setCommandResponse('sed -i.bak', { success: true });
      mockSshClient.setCommandResponse('docker compose up -d', { success: true });
      mockSshClient.setCommandResponse('curl', { success: true, output: '500' });
      mockSshClient.setCommandResponse('docker compose down', {
        success: false,
        error: 'Cannot stop containers',
      });

      const result = await rollbackManager.deployWithAutoRollback(
        'v2.0.0',
        'v1.0.0',
        healthcheckConfig
      );

      expect(result.success).toBe(false);
      expect(result.deployed).toBe(true);
      expect(result.healthcheckPassed).toBe(false);
      expect(result.rolledBack).toBe(false);
      expect(result.error).toContain('rollback también falló');
    }, 10000);
  });

  describe('integración con Artículo VII (determinismo)', () => {
    it('revierte al tag versionado, no reinicia contenedor previo', async () => {
      mockSshClient.setCommandResponse('docker compose down', { success: true });
      mockSshClient.setCommandResponse('sed -i.bak', { success: true });
      mockSshClient.setCommandResponse('docker compose up -d', { success: true });

      await rollbackManager.rollback('v1.5.2');

      const history = mockSshClient.getCommandHistory();
      
      // Verifica que se usa sed para cambiar el tag de imagen
      const sedCommand = history.find(cmd => cmd.includes('sed'));
      expect(sedCommand).toBeDefined();
      expect(sedCommand).toContain('v1.5.2');
      
      // Verifica que se bajan los contenedores actuales
      expect(history.some(cmd => cmd.includes('docker compose down'))).toBe(true);
      
      // Verifica que se levantan con la nueva configuración
      expect(history.some(cmd => cmd.includes('docker compose up -d'))).toBe(true);
    });
  });
});
