import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { DnsManager } from './dns-manager.js';
import type { CloudflareDnsConfig, ManualDnsConfig } from './types.js';

describe('DnsManager', () => {
  let mockFetch: Mock;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('setup', () => {
    it('debe delegar a CloudflareProvider cuando provider es cloudflare', async () => {
      const config: CloudflareDnsConfig = {
        domain: 'example.com',
        serverIp: '192.0.2.1',
        provider: 'cloudflare',
        apiToken: 'test-token',
        zoneId: 'zone-123',
      };

      // Mock Cloudflare API
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, result: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, result: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });

      // Mock DNS resolver
      const mockDnsResolver = vi.fn().mockResolvedValue('192.0.2.1');

      const result = await DnsManager.setup(config, { dnsResolver: mockDnsResolver });

      expect(result.success).toBe(true);
      expect(result.records).toHaveLength(2);
    });

    it('debe delegar a ManualProvider cuando provider es manual', async () => {
      const config: ManualDnsConfig = {
        domain: 'example.com',
        serverIp: '192.0.2.1',
        provider: 'manual',
        pollingInterval: 100,
        pollingTimeout: 1000,
      };

      // Mock DNS resolver
      const mockDnsResolver = vi.fn().mockResolvedValue('192.0.2.1');

      const result = await DnsManager.setup(config, { dnsResolver: mockDnsResolver });

      expect(result.success).toBe(true);
      expect(result.records).toHaveLength(2);
      expect(result.steps[0]).toContain('Registros DNS a crear');
    });

    it('debe fallar con proveedor no soportado', async () => {
      const config = {
        domain: 'example.com',
        serverIp: '192.0.2.1',
        provider: 'route53' as any,
      };

      const result = await DnsManager.setup(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Proveedor DNS no soportado');
    });

    it('debe pasar opciones de polling a ManualProvider', async () => {
      const config: ManualDnsConfig = {
        domain: 'example.com',
        serverIp: '192.0.2.1',
        provider: 'manual',
        pollingInterval: 50,
        pollingTimeout: 500,
      };

      const onProgressMock = vi.fn();
      const onCheckCancelMock = vi.fn().mockReturnValue(false);

      // Mock DNS resolver
      const mockDnsResolver = vi.fn().mockResolvedValue('192.0.2.1');

      await DnsManager.setup(config, {
        onProgress: onProgressMock,
        onCheckCancel: onCheckCancelMock,
        dnsResolver: mockDnsResolver,
      });

      expect(onProgressMock).toHaveBeenCalled();
    });
  });

  describe('checkPropagation', () => {
    it('debe verificar propagación usando ManualProvider', async () => {
      const config: ManualDnsConfig = {
        domain: 'example.com',
        serverIp: '192.0.2.1',
        provider: 'manual',
      };

      // Mock DNS resolver
      const mockDnsResolver = vi.fn().mockResolvedValue('192.0.2.1');

      const result = await DnsManager.checkPropagation(config, mockDnsResolver);

      expect(result.success).toBe(true);
      expect(result.propagated).toBe(true);
      expect(result.steps[0]).toContain('propagado correctamente');
    });

    it('debe reportar propagación incompleta', async () => {
      const config: ManualDnsConfig = {
        domain: 'example.com',
        serverIp: '192.0.2.1',
        provider: 'manual',
      };

      // Mock DNS resolver a IP incorrecta
      const mockDnsResolver = vi.fn().mockResolvedValue('10.0.0.1');

      const result = await DnsManager.checkPropagation(config, mockDnsResolver);

      expect(result.success).toBe(false);
      expect(result.propagated).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('integración end-to-end', () => {
    it('debe completar flujo Cloudflare exitosamente', async () => {
      const config: CloudflareDnsConfig = {
        domain: 'test.com',
        serverIp: '203.0.113.5',
        provider: 'cloudflare',
        apiToken: 'cf-token-abc',
      };

      // Mock Cloudflare API completo
      mockFetch
        // getZoneId
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            result: [{ id: 'zone-xyz', name: 'test.com' }],
          }),
        })
        // getExistingRecords para @
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, result: [] }),
        })
        // createRecord para @
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        })
        // getExistingRecords para www
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, result: [] }),
        })
        // createRecord para www
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });

      // Mock DNS resolver
      const mockDnsResolver = vi.fn().mockResolvedValue('203.0.113.5');

      const result = await DnsManager.setup(config, { dnsResolver: mockDnsResolver });

      expect(result.success).toBe(true);
      expect(result.propagated).toBe(true);
      expect(result.records[0].value).toBe('203.0.113.5');
      expect(result.records[1].value).toBe('203.0.113.5');
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.steps.some(step => step.includes('Cloudflare'))).toBe(true);
    });

    it('debe completar flujo manual exitosamente', async () => {
      const config: ManualDnsConfig = {
        domain: 'manual-test.com',
        serverIp: '198.51.100.10',
        provider: 'manual',
        pollingInterval: 100,
        pollingTimeout: 2000,
      };

      // Mock DNS resolver
      const mockDnsResolver = vi.fn().mockResolvedValue('198.51.100.10');

      const result = await DnsManager.setup(config, { dnsResolver: mockDnsResolver });

      expect(result.success).toBe(true);
      expect(result.propagated).toBe(true);
      expect(result.records[0].value).toBe('198.51.100.10');
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.steps.some(step => step.includes('Registros DNS'))).toBe(true);
      expect(result.steps.some(step => step.includes('Propagación'))).toBe(true);
    });
  });
});
