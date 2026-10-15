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

    it('resuelve la zona raíz para un subdominio (FRA-71)', async () => {
      const subdomainConfig: CloudflareDnsConfig = {
        domain: 'prueba.codigofractal.dev',
        serverIp: '192.0.2.1',
        provider: 'cloudflare',
        apiToken: 'test-token-123',
      };
      const mockDnsResolver = vi.fn().mockResolvedValue('192.0.2.1');
      const provider = new CloudflareProvider(subdomainConfig, mockDnsResolver);

      // getZoneId: el subdominio completo no es una zona (result vacío)...
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, result: [] }),
      });
      // ...pero el dominio registrable sí lo es.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: [{ id: 'zone-root-123', name: 'codigofractal.dev' }],
        }),
      });
      // getExistingRecords @ (no existe)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, result: [] }),
      });
      // createRecord @
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });
      // getExistingRecords www (no existe)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, result: [] }),
      });
      // createRecord www
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await provider.setup();

      expect(result.success).toBe(true);
      // Primera consulta: subdominio completo.
      expect(mockFetch.mock.calls[0][0]).toContain('/zones?name=prueba.codigofractal.dev');
      // Segunda consulta: dominio registrable (la zona real).
      expect(mockFetch.mock.calls[1][0]).toContain('/zones?name=codigofractal.dev');
      // Los registros usan el zone id raíz detectado.
      expect(mockFetch.mock.calls[2][0]).toContain('/zones/zone-root-123/dns_records');
      // www se crea como FQDN del subdominio.
      const wwwCreateCall = mockFetch.mock.calls[5];
      const wwwBody = JSON.parse((wwwCreateCall[1] as { body: string }).body);
      expect(wwwBody.name).toBe('www.prueba.codigofractal.dev');
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
