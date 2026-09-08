import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { CloudflareProvider } from './cloudflare-provider.js';
import type { CloudflareDnsConfig } from './types.js';

describe('CloudflareProvider', () => {
  let mockFetch: Mock;
  let originalFetch: typeof globalThis.fetch;
  let config: CloudflareDnsConfig;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    config = {
      domain: 'example.com',
      serverIp: '192.0.2.1',
      provider: 'cloudflare',
      apiToken: 'test-token-123',
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('setup', () => {
    it('debe crear registros DNS y confirmar propagación exitosamente', async () => {
      // Mock DNS resolver
      const mockDnsResolver = vi.fn().mockResolvedValue('192.0.2.1');
      const provider = new CloudflareProvider(config, mockDnsResolver);

      // Mock getZoneId
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: [{ id: 'zone-123', name: 'example.com' }],
        }),
      });

      // Mock getExistingRecords para @ (no existe)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: [],
        }),
      });

      // Mock createRecord para @
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      // Mock getExistingRecords para www (no existe)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: [],
        }),
      });

      // Mock createRecord para www
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await provider.setup();

      expect(result.success).toBe(true);
      expect(result.propagated).toBe(true);
      expect(result.records).toHaveLength(2);
      expect(result.records[0].name).toBe('@');
      expect(result.records[1].name).toBe('www');
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
    });

    it('debe fallar si no encuentra la zona de Cloudflare', async () => {
      const provider = new CloudflareProvider(config);

      // Mock getZoneId falla
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: [],
        }),
      });

      const result = await provider.setup();

      expect(result.success).toBe(false);
      expect(result.propagated).toBe(false);
      expect(result.error).toContain('No se encontró la zona');
    });

    it('debe actualizar registro existente en lugar de crear uno nuevo', async () => {
      // Mock DNS resolver
      const mockDnsResolver = vi.fn().mockResolvedValue('192.0.2.1');
      const provider = new CloudflareProvider({
        ...config,
        zoneId: 'zone-123',
      }, mockDnsResolver);

      // Mock getExistingRecords para @ (ya existe)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: [{ id: 'record-456' }],
        }),
      });

      // Mock updateRecord para @
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      // Mock getExistingRecords para www (ya existe)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: [{ id: 'record-789' }],
        }),
      });

      // Mock updateRecord para www
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await provider.setup();

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/dns_records/record-456'),
        expect.objectContaining({ method: 'PUT' })
      );
    });

    it('debe fallar si no puede crear un registro', async () => {
      const provider = new CloudflareProvider({
        ...config,
        zoneId: 'zone-123',
      });

      // Mock getExistingRecords para @ (no existe)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: [],
        }),
      });

      // Mock createRecord falla
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ success: false }),
      });

      const result = await provider.setup();

      expect(result.success).toBe(false);
      expect(result.propagated).toBe(false);
      expect(result.error).toContain('No se pudo crear el registro');
    });

    it('debe usar zoneId provisto si está en la config', async () => {
      // Mock DNS resolver
      const mockDnsResolver = vi.fn().mockResolvedValue('192.0.2.1');
      const provider = new CloudflareProvider({
        ...config,
        zoneId: 'zone-provided-123',
      }, mockDnsResolver);

      // Mock getExistingRecords para @
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: [],
        }),
      });

      // Mock createRecord para @
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      // Mock getExistingRecords para www
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: [],
        }),
      });

      // Mock createRecord para www
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await provider.setup();

      // No debe llamar a getZoneId (primera llamada es getExistingRecords)
      expect(mockFetch.mock.calls[0][0]).toContain('/dns_records');
      expect(result.success).toBe(true);
    });
  });

  describe('manejo de errores', () => {
    it('debe manejar errores de red en getZoneId', async () => {
      const provider = new CloudflareProvider(config);

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await provider.setup();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('debe manejar token inválido', async () => {
      const provider = new CloudflareProvider(config);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ success: false }),
      });

      const result = await provider.setup();

      expect(result.success).toBe(false);
    });
  });
});
