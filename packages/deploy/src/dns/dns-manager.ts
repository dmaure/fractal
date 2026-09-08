import type {
  DnsConfig,
  CloudflareDnsConfig,
  ManualDnsConfig,
  DnsSetupResult,
  PropagationPollingOptions,
  DnsResolver,
} from './types.js';
import { CloudflareProvider } from './cloudflare-provider.js';
import { ManualProvider } from './manual-provider.js';

/**
 * Opciones extendidas para setup de DNS (incluye resolver para testing).
 */
export interface DnsSetupOptions extends PropagationPollingOptions {
  dnsResolver?: DnsResolver;
}

/**
 * Manejador principal de DNS.
 * Implementa AC-5 y AC-6 del SPEC-0003.
 * Framework-agnostic: delega en proveedores específicos.
 */
export class DnsManager {
  /**
   * Configura DNS según el proveedor especificado.
   */
  static async setup(
    config: DnsConfig | CloudflareDnsConfig | ManualDnsConfig,
    options?: DnsSetupOptions
  ): Promise<DnsSetupResult> {
    switch (config.provider) {
      case 'cloudflare':
        return await DnsManager.setupCloudflare(config as CloudflareDnsConfig, options?.dnsResolver);
      
      case 'manual':
        return await DnsManager.setupManual(config as ManualDnsConfig, options);
      
      default:
        return {
          success: false,
          records: [],
          propagated: false,
          steps: [],
          error: `Proveedor DNS no soportado: ${(config as DnsConfig).provider}`,
        };
    }
  }

  /**
   * Configura DNS en Cloudflare (AC-5).
   */
  private static async setupCloudflare(
    config: CloudflareDnsConfig,
    dnsResolver?: DnsResolver
  ): Promise<DnsSetupResult> {
    const provider = new CloudflareProvider(config, dnsResolver);
    return await provider.setup();
  }

  /**
   * Configura DNS de forma manual (AC-6).
   */
  private static async setupManual(
    config: ManualDnsConfig,
    options?: DnsSetupOptions
  ): Promise<DnsSetupResult> {
    const provider = new ManualProvider(config, options?.dnsResolver);
    return await provider.setup(options);
  }

  /**
   * Verifica si un dominio ya ha propagado correctamente.
   * Útil para reanudar el proceso después de una cancelación.
   */
  static async checkPropagation(
    config: DnsConfig | ManualDnsConfig,
    dnsResolver?: DnsResolver
  ): Promise<DnsSetupResult> {
    const provider = new ManualProvider(config as ManualDnsConfig, dnsResolver);
    const result = await provider.checkPropagation();

    return {
      success: result.propagated,
      records: [],
      propagated: result.propagated,
      steps: [result.message],
      error: result.propagated ? undefined : result.message,
    };
  }
}

