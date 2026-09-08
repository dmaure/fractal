import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ManualProvider } from './manual-provider.js';
import type { ManualDnsConfig } from './types.js';

describe('ManualProvider', () => {
  let config: ManualDnsConfig;

  beforeEach(() => {
    config = {
      domain: 'example.com',
      serverIp: '192.0.2.1',
      provider: 'manual',
      pollingInterval: 100, // Usar intervalo corto para tests
      pollingTimeout: 1000,
    };
    vi.restoreAllMocks();
  });

  describe('setup', () => {
    it('debe devolver los registros DNS a crear y confirmar propagación exitosamente', async () => {
      // Mock DNS resolver
      const mockDnsResolver = vi.fn().mockResolvedValue('192.0.2.1');
      const provider = new ManualProvider(config, mockDnsResolver);

      const result = await provider.setup();

      expect(result.success).toBe(true);
      expect(result.propagated).toBe(true);
      expect(result.records).toHaveLength(2);
      expect(result.records[0].name).toBe('@');
      expect(result.records[0].value).toBe('192.0.2.1');
      expect(result.records[1].name).toBe('www');
      expect(result.records[1].value).toBe('192.0.2.1');
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.steps[0]).toContain('Registros DNS a crear');
      expect(result.error).toBeUndefined();
    });

    it('debe devolver canContinueLater cuando falla la propagación', async () => {
      // Mock DNS resolver que nunca resuelve
      const mockDnsResolver = vi.fn().mockResolvedValue(null);
      const provider = new ManualProvider({
        ...config,
        pollingTimeout: 200, // Timeout muy corto para forzar fallo
      }, mockDnsResolver);

      const result = await provider.setup();

      expect(result.success).toBe(false);
      expect(result.propagated).toBe(false);
      expect(result.canContinueLater).toBe(true);
      expect(result.error).toContain('DNS no propagó');
    });

    it('debe respetar el callback de cancelación', async () => {
      // Mock DNS resolver que nunca resuelve
      const mockDnsResolver = vi.fn().mockResolvedValue(null);
      const provider = new ManualProvider(config, mockDnsResolver);
      let checkCount = 0;

      const result = await provider.setup({
        onCheckCancel: () => {
          checkCount++;
          return checkCount > 2; // Cancelar después de 2 intentos
        },
      });

      expect(result.success).toBe(false);
      expect(result.propagated).toBe(false);
      expect(result.canContinueLater).toBe(true);
      expect(result.steps[result.steps.length - 1]).toContain('cancelado');
    });

    it('debe llamar al callback de progreso', async () => {
      // Mock DNS resolver que resuelve después de algunos intentos
      let attempts = 0;
      const mockDnsResolver = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.resolve(null);
        }
        return Promise.resolve('192.0.2.1');
      });
      
      const provider = new ManualProvider({
        ...config,
        pollingTimeout: 500,
      }, mockDnsResolver);
      const progressCalls: Array<{ attempt: number; elapsed: number }> = [];

      await provider.setup({
        onProgress: (attempt, elapsed) => {
          progressCalls.push({ attempt, elapsed });
        },
      });

      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls[0].attempt).toBeGreaterThan(0);
    });
  });

  describe('checkPropagation', () => {
    it('debe confirmar propagación cuando ambos registros resuelven correctamente', async () => {
      // Mock DNS resolver exitoso
      const mockDnsResolver = vi.fn().mockResolvedValue('192.0.2.1');
      const provider = new ManualProvider(config, mockDnsResolver);

      const result = await provider.checkPropagation();

      expect(result.propagated).toBe(true);
      expect(result.rootIp).toBe('192.0.2.1');
      expect(result.wwwIp).toBe('192.0.2.1');
      expect(result.message).toContain('propagado correctamente');
    });

    it('debe reportar que no ha propagado cuando solo el root resuelve', async () => {
      // Mock DNS resolver: root ok, www falla
      const mockDnsResolver = vi.fn().mockImplementation((domain: string) => {
        if (domain === 'example.com') {
          return Promise.resolve('192.0.2.1');
        }
        return Promise.resolve(null);
      });
      const provider = new ManualProvider(config, mockDnsResolver);

      const result = await provider.checkPropagation();

      expect(result.propagated).toBe(false);
      expect(result.rootIp).toBe('192.0.2.1');
      expect(result.wwwIp).toBeUndefined();
      expect(result.message).toContain('Esperando propagación');
    });

    it('debe reportar que no ha propagado cuando resuelve a IP incorrecta', async () => {
      // Mock DNS resolver a IP incorrecta
      const mockDnsResolver = vi.fn().mockResolvedValue('10.0.0.1');
      const provider = new ManualProvider(config, mockDnsResolver);

      const result = await provider.checkPropagation();

      expect(result.propagated).toBe(false);
      expect(result.rootIp).toBe('10.0.0.1');
      expect(result.wwwIp).toBe('10.0.0.1');
      expect(result.message).toContain('Esperando propagación');
    });

    it('debe reportar que no ha propagado cuando ningún dominio resuelve', async () => {
      // Mock DNS resolver que falla
      const mockDnsResolver = vi.fn().mockResolvedValue(null);
      const provider = new ManualProvider(config, mockDnsResolver);

      const result = await provider.checkPropagation();

      expect(result.propagated).toBe(false);
      expect(result.rootIp).toBeUndefined();
      expect(result.wwwIp).toBeUndefined();
      expect(result.message).toContain('sin resolver');
    });

    it('debe manejar errores durante la verificación', async () => {
      // Mock DNS resolver que lanza error
      const mockDnsResolver = vi.fn().mockRejectedValue(new Error('Network error'));
      const provider = new ManualProvider(config, mockDnsResolver);

      const result = await provider.checkPropagation();

      expect(result.propagated).toBe(false);
      expect(result.message).toBeDefined();
    });
  });

  describe('pollPropagation', () => {
    it('debe hacer polling hasta detectar propagación exitosa', async () => {
      let attempts = 0;
      // Mock DNS que resuelve después de 3 intentos
      const mockDnsResolver = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.resolve(null);
        }
        return Promise.resolve('192.0.2.1');
      });
      const provider = new ManualProvider(config, mockDnsResolver);

      const result = await provider.pollPropagation();

      expect(result.propagated).toBe(true);
      expect(attempts).toBeGreaterThanOrEqual(3);
    });

    it('debe respetar el timeout', async () => {
      // Mock DNS que nunca resuelve
      const mockDnsResolver = vi.fn().mockResolvedValue(null);
      const provider = new ManualProvider({
        ...config,
        pollingTimeout: 200,
      }, mockDnsResolver);

      const result = await provider.pollPropagation();

      expect(result.propagated).toBe(false);
      expect(result.message).toContain('Timeout');
    });

    it('debe permitir continuar más tarde cuando timeout', async () => {
      // Mock DNS que nunca resuelve
      const mockDnsResolver = vi.fn().mockResolvedValue(null);
      const provider = new ManualProvider({
        ...config,
        pollingTimeout: 100,
      }, mockDnsResolver);

      const result = await provider.pollPropagation();

      expect(result.propagated).toBe(false);
      expect(result.message).toContain('continuar más tarde');
    });
  });
});
