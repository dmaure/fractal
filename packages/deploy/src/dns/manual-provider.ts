import type {
  ManualDnsConfig,
  DnsRecord,
  DnsSetupResult,
  DnsPropagationResult,
  PropagationPollingOptions,
  DnsResolver,
} from './types.js';
import { DEFAULT_DNS_RECORDS, evaluateDnsPropagation, isRootDomain } from './types.js';

/**
 * Proveedor DNS manual.
 * Implementa AC-6 del SPEC-0003.
 * Framework-agnostic: solo verifica resolución DNS, no interactúa con ningún proveedor.
 */
export class ManualProvider {
  private readonly dnsResolver: DnsResolver;
  
  constructor(
    private config: ManualDnsConfig,
    dnsResolver?: DnsResolver
  ) {
    this.dnsResolver = dnsResolver || this.defaultDnsResolver;
  }

  /**
   * Configura DNS de forma manual: muestra los registros a crear y hace polling.
   */
  async setup(options?: PropagationPollingOptions): Promise<DnsSetupResult> {
    const steps: string[] = [];
    const records = DEFAULT_DNS_RECORDS(this.config.domain, this.config.serverIp);

    try {
      // 1. Los registros a crear se devuelven para que el CLI los muestre
      steps.push('Registros DNS a crear en tu proveedor:');
      for (const record of records) {
        const recordName = record.name === '@' ? this.config.domain : `${record.name}.${this.config.domain}`;
        steps.push(`  ${record.type} ${recordName} → ${record.value} (TTL: ${record.ttl || 300})`);
      }

      // 2. Hacer polling hasta detectar la propagación
      steps.push('Iniciando polling de propagación DNS...');
      const propagationResult = await this.pollPropagation(options);

      if (!propagationResult.propagated) {
        return {
          success: false,
          records,
          propagated: false,
          steps: [...steps, propagationResult.message],
          error: 'DNS no propagó dentro del tiempo esperado',
          canContinueLater: true,
        };
      }

      steps.push('Propagación DNS confirmada');

      return {
        success: true,
        records,
        propagated: true,
        steps,
      };
    } catch (error) {
      return {
        success: false,
        records,
        propagated: false,
        steps,
        error: error instanceof Error ? error.message : 'Error desconocido',
        canContinueLater: true,
      };
    }
  }

  /**
   * Hace polling hasta detectar que el DNS ha propagado.
   * Permite cancelación a través del callback onCheckCancel.
   */
  async pollPropagation(options?: PropagationPollingOptions): Promise<DnsPropagationResult> {
    const interval = options?.interval || this.config.pollingInterval || 5000;
    const timeout = options?.timeout || this.config.pollingTimeout || 300000;
    const startTime = Date.now();

    let attempt = 0;

    while (true) {
      attempt++;
      const elapsed = Date.now() - startTime;

      // Verificar timeout
      if (elapsed >= timeout) {
        return {
          propagated: false,
          message: `Timeout después de ${Math.round(elapsed / 1000)}s. Puedes continuar más tarde.`,
        };
      }

      // Verificar cancelación
      if (options?.onCheckCancel) {
        const shouldCancel = await options.onCheckCancel();
        if (shouldCancel) {
          return {
            propagated: false,
            message: 'Polling cancelado. Puedes continuar más tarde.',
          };
        }
      }

      // Reportar progreso
      if (options?.onProgress) {
        options.onProgress(attempt, elapsed);
      }

      // Verificar propagación
      const result = await this.checkPropagation();
      if (result.propagated) {
        return result;
      }

      // Esperar antes del siguiente intento
      await this.sleep(interval);
    }
  }

  /**
   * Verifica si el DNS ha propagado a los registros que realmente se piden.
   * `www` solo se consulta en dominio raíz (FRA-71).
   */
  async checkPropagation(): Promise<DnsPropagationResult> {
    try {
      const rootResult = await this.dnsResolver(this.config.domain);
      const wwwResult = isRootDomain(this.config.domain)
        ? await this.dnsResolver(`www.${this.config.domain}`)
        : null;
      return evaluateDnsPropagation(
        this.config.domain,
        this.config.serverIp,
        rootResult,
        wwwResult
      );
    } catch (error) {
      return {
        propagated: false,
        message: error instanceof Error ? error.message : 'Error verificando propagación',
      };
    }
  }

  /**
   * Resolver DNS por defecto usando el módulo dns/promises de Node.js.
   */
  private async defaultDnsResolver(domain: string): Promise<string | null> {
    try {
      const { resolve4 } = await import('dns/promises');
      const addresses = await resolve4(domain);
      return addresses.length > 0 ? addresses[0] : null;
    } catch {
      return null;
    }
  }

  /**
   * Utility para esperar un tiempo determinado.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
