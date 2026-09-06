import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServerValidator } from './server-validator.js';
import type { SshClient } from '../ssh/client.js';
import type { SshCommandResult } from '../ssh/types.js';

// Mock del SshClient
const createMockSshClient = (): SshClient => {
  return {
    testConnection: vi.fn(),
    executeCommand: vi.fn(),
  } as any;
};

describe('ServerValidator', () => {
  let mockClient: SshClient;
  let validator: ServerValidator;

  beforeEach(() => {
    mockClient = createMockSshClient();
    validator = new ServerValidator(mockClient);
  });

  describe('validate', () => {
    it('debe aprobar un servidor Ubuntu 22.04 con recursos suficientes', async () => {
      // Mock de comandos que retornan información válida
      vi.spyOn(mockClient, 'executeCommand')
        .mockResolvedValueOnce({
          success: true,
          stdout: 'Ubuntu\n22.04',
          stderr: '',
          exitCode: 0,
        } as SshCommandResult)
        .mockResolvedValueOnce({
          success: true,
          stdout: '2',
          stderr: '',
          exitCode: 0,
        } as SshCommandResult)
        .mockResolvedValueOnce({
          success: true,
          stdout: '4194304', // 4 GB en KB
          stderr: '',
          exitCode: 0,
        } as SshCommandResult)
        .mockResolvedValueOnce({
          success: true,
          stdout: '80 50', // 80 GB total, 50 GB disponibles
          stderr: '',
          exitCode: 0,
        } as SshCommandResult);

      const result = await validator.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.serverInfo).toMatchObject({
        os: 'Ubuntu',
        osVersion: '22.04',
        cpuCount: 2,
        ramGb: 4,
      });
    });

    it('debe aprobar un servidor Ubuntu 24.04 con recursos suficientes', async () => {
      vi.spyOn(mockClient, 'executeCommand')
        .mockResolvedValueOnce({
          success: true,
          stdout: 'Ubuntu\n24.04',
          stderr: '',
          exitCode: 0,
        } as SshCommandResult)
        .mockResolvedValueOnce({
          success: true,
          stdout: '1',
          stderr: '',
          exitCode: 0,
        } as SshCommandResult)
        .mockResolvedValueOnce({
          success: true,
          stdout: '2097152', // 2 GB en KB
          stderr: '',
          exitCode: 0,
        } as SshCommandResult)
        .mockResolvedValueOnce({
          success: true,
          stdout: '40 25', // 40 GB total, 25 GB disponibles
          stderr: '',
          exitCode: 0,
        } as SshCommandResult);

      const result = await validator.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('debe rechazar una distribución no soportada', async () => {
      vi.spyOn(mockClient, 'executeCommand')
        .mockResolvedValueOnce({
          success: true,
          stdout: 'Debian\n11',
          stderr: '',
          exitCode: 0,
        } as SshCommandResult)
        .mockResolvedValueOnce({
          success: true,
          stdout: '2',
          stderr: '',
          exitCode: 0,
        } as SshCommandResult)
        .mockResolvedValueOnce({
          success: true,
          stdout: '4194304',
          stderr: '',
          exitCode: 0,
        } as SshCommandResult)
        .mockResolvedValueOnce({
          success: true,
          stdout: '80 50',
          stderr: '',
          exitCode: 0,
        } as SshCommandResult);

      const result = await validator.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Distribución no soportada'))).toBe(true);
    });

    it('debe rechazar un servidor con RAM insuficiente', async () => {
      vi.spyOn(mockClient, 'executeCommand')
        .mockResolvedValueOnce({
          success: true,
          stdout: 'Ubuntu\n22.04',
          stderr: '',
          exitCode: 0,
        } as SshCommandResult)
        .mockResolvedValueOnce({
          success: true,
          stdout: '2',
          stderr: '',
          exitCode: 0,
        } as SshCommandResult)
        .mockResolvedValueOnce({
          success: true,
          stdout: '1048576', // 1 GB en KB
          stderr: '',
          exitCode: 0,
        } as SshCommandResult)
        .mockResolvedValueOnce({
          success: true,
          stdout: '80 50',
          stderr: '',
          exitCode: 0,
        } as SshCommandResult);

      const result = await validator.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('RAM insuficiente'))).toBe(true);
    });

    it('debe rechazar un servidor con disco insuficiente', async () => {
      vi.spyOn(mockClient, 'executeCommand')
        .mockResolvedValueOnce({
          success: true,
          stdout: 'Ubuntu\n22.04',
          stderr: '',
          exitCode: 0,
        } as SshCommandResult)
        .mockResolvedValueOnce({
          success: true,
          stdout: '2',
          stderr: '',
          exitCode: 0,
        } as SshCommandResult)
        .mockResolvedValueOnce({
          success: true,
          stdout: '4194304',
          stderr: '',
          exitCode: 0,
        } as SshCommandResult)
        .mockResolvedValueOnce({
          success: true,
          stdout: '30 15', // 30 GB total, 15 GB disponibles (< 20 GB requeridos)
          stderr: '',
          exitCode: 0,
        } as SshCommandResult);

      const result = await validator.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Espacio en disco insuficiente'))).toBe(true);
    });

    it('debe generar advertencias para recursos limitados', async () => {
      vi.spyOn(mockClient, 'executeCommand')
        .mockResolvedValueOnce({
          success: true,
          stdout: 'Ubuntu\n22.04',
          stderr: '',
          exitCode: 0,
        } as SshCommandResult)
        .mockResolvedValueOnce({
          success: true,
          stdout: '1',
          stderr: '',
          exitCode: 0,
        } as SshCommandResult)
        .mockResolvedValueOnce({
          success: true,
          stdout: '2097152', // 2 GB (justo en el mínimo)
          stderr: '',
          exitCode: 0,
        } as SshCommandResult)
        .mockResolvedValueOnce({
          success: true,
          stdout: '30 25', // 30 GB total, 25 GB disponibles
          stderr: '',
          exitCode: 0,
        } as SshCommandResult);

      const result = await validator.validate();

      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('RAM limitada'))).toBe(true);
      expect(result.warnings.some(w => w.includes('Espacio en disco limitado'))).toBe(true);
    });

    it('debe rechazar si no se puede detectar información del servidor', async () => {
      vi.spyOn(mockClient, 'executeCommand')
        .mockResolvedValue({
          success: false,
          stdout: '',
          stderr: 'Command not found',
          exitCode: 127,
        } as SshCommandResult);

      const result = await validator.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'No se pudo detectar la información del servidor'
      );
    });
  });

});
