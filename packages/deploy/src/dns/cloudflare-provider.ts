import type {
  CloudflareDnsConfig,
  DnsRecord,
  DnsSetupResult,
  DnsPropagationResult,
  DnsResolver,
} from './types.js';
import { DEFAULT_DNS_RECORDS } from './types.js';

/**
 * Proveedor DNS para Cloudflare.
 * Implementa AC-5 del SPEC-0003.
 * Framework-agnostic: usa únicamente la API de Cloudflare.
 */
export class CloudflareProvider {
  private readonly apiBaseUrl = 'https://api.cloudflare.com/client/v4';
  private readonly dnsResolver: DnsResolver;
  
  constructor(
    private config: CloudflareDnsConfig,
    dnsResolver?: DnsResolver
  ) {
    this.dnsResolver = dnsResolver || this.defaultDnsResolver;
  }

  /**
   * Configura DNS en Cloudflare: crea registros A y confirma propagación.
   */
  async setup(): Promise<DnsSetupResult> {
    const steps: string[] = [];
    const records = DEFAULT_DNS_RECORDS(this.config.domain, this.config.serverIp);

    try {
      // 1. Obtener Zone ID si no fue provisto
      let zoneId = this.config.zoneId;
      if (!zoneId) {
        const detectedZoneId = await this.getZoneId(this.config.domain);
        if (!detectedZoneId) {
          return {
            success: false,
            records,
            propagated: false,
            steps,
            error: `No se encontró la zona de Cloudflare para el dominio ${this.config.domain}`,
          };
        }
        zoneId = detectedZoneId;
        steps.push(`Zona de Cloudflare detectada: ${zoneId}`);
      }

      // 2. Crear o actualizar registros A
      for (const record of records) {
        const created = await this.createOrUpdateRecord(zoneId, record);
        if (!created) {
          return {
            success: false,
            records,
            propagated: false,
            steps,
            error: `No se pudo crear el registro ${record.name === '@' ? 'raíz' : record.name} en Cloudflare`,
          };
        }
        const recordName = record.name === '@' ? this.config.domain : `${record.name}.${this.config.domain}`;
        steps.push(`Registro A creado/actualizado: ${recordName} → ${record.value}`);
      }

      // 3. Esperar y verificar propagación
      steps.push('Esperando propagación DNS...');
      const propagationResult = await this.waitForPropagation();
      
      if (!propagationResult.propagated) {
        return {
          success: false,
          records,
          propagated: false,
          steps,
          error: `DNS no propagó correctamente: ${propagationResult.message}`,
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
      };
    }
  }

  /**
   * Obtiene el Zone ID para un dominio.
   */
  private async getZoneId(domain: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/zones?name=${domain}`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as {
        success: boolean;
        result: Array<{ id: string; name: string }>;
      };

      if (!data.success || data.result.length === 0) {
        return null;
      }

      return data.result[0].id;
    } catch {
      return null;
    }
  }

  /**
   * Crea o actualiza un registro DNS en Cloudflare.
   */
  private async createOrUpdateRecord(
    zoneId: string,
    record: DnsRecord
  ): Promise<boolean> {
    try {
      // Primero verificar si el registro ya existe
      const recordName = record.name === '@' ? this.config.domain : `${record.name}.${this.config.domain}`;
      const existingRecords = await this.getExistingRecords(zoneId, record.type, recordName);

      if (existingRecords.length > 0) {
        // Actualizar registro existente
        const existingId = existingRecords[0].id;
        return await this.updateRecord(zoneId, existingId, record);
      } else {
        // Crear nuevo registro
        return await this.createRecord(zoneId, record);
      }
    } catch {
      return false;
    }
  }

  /**
   * Obtiene registros DNS existentes.
   */
  private async getExistingRecords(
    zoneId: string,
    type: string,
    name: string
  ): Promise<Array<{ id: string }>> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/zones/${zoneId}/dns_records?type=${type}&name=${name}`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        return [];
      }

      const data = await response.json() as {
        success: boolean;
        result: Array<{ id: string }>;
      };

      return data.success ? data.result : [];
    } catch {
      return [];
    }
  }

  /**
   * Crea un nuevo registro DNS.
   */
  private async createRecord(zoneId: string, record: DnsRecord): Promise<boolean> {
    try {
      const recordName = record.name === '@' ? this.config.domain : record.name;
      
      const response = await fetch(`${this.apiBaseUrl}/zones/${zoneId}/dns_records`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: record.type,
          name: recordName,
          content: record.value,
          ttl: record.ttl || 300,
          proxied: false,
        }),
      });

      const data = await response.json() as { success: boolean };
      return response.ok && data.success;
    } catch {
      return false;
    }
  }

  /**
   * Actualiza un registro DNS existente.
   */
  private async updateRecord(
    zoneId: string,
    recordId: string,
    record: DnsRecord
  ): Promise<boolean> {
    try {
      const recordName = record.name === '@' ? this.config.domain : record.name;
      
      const response = await fetch(
        `${this.apiBaseUrl}/zones/${zoneId}/dns_records/${recordId}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${this.config.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: record.type,
            name: recordName,
            content: record.value,
            ttl: record.ttl || 300,
            proxied: false,
          }),
        }
      );

      const data = await response.json() as { success: boolean };
      return response.ok && data.success;
    } catch {
      return false;
    }
  }

  /**
   * Espera a que el DNS propague.
   * Verifica que tanto el dominio raíz como www resuelvan a la IP correcta.
   */
  private async waitForPropagation(): Promise<DnsPropagationResult> {
    const maxAttempts = 60; // 5 minutos con intervalos de 5 segundos
    const interval = 5000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await this.sleep(interval);
      }

      const result = await this.checkPropagation();
      if (result.propagated) {
        return result;
      }
    }

    return {
      propagated: false,
      message: 'Timeout esperando la propagación DNS',
    };
  }

  /**
   * Verifica si el DNS ha propagado.
   */
  private async checkPropagation(): Promise<DnsPropagationResult> {
    try {
      const rootResult = await this.dnsResolver(this.config.domain);
      const wwwResult = await this.dnsResolver(`www.${this.config.domain}`);

      const rootMatches = rootResult === this.config.serverIp;
      const wwwMatches = wwwResult === this.config.serverIp;

      if (rootMatches && wwwMatches) {
        return {
          propagated: true,
          rootIp: rootResult,
          wwwIp: wwwResult,
          message: 'DNS propagado correctamente',
        };
      }

      return {
        propagated: false,
        rootIp: rootResult || undefined,
        wwwIp: wwwResult || undefined,
        message: `Esperando propagación: root=${rootResult || 'sin resolver'}, www=${wwwResult || 'sin resolver'}`,
      };
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
