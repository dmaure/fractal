import type { SslSshClient } from './types.js';
import type { RenewalConfig, RenewalSetupResult } from './types.js';

/**
 * Manejador de renovación automática de certificados.
 * Framework-agnostic según Artículo II.
 */
export class RenewalManager {
  constructor(private ssh: SslSshClient) {}

  /**
   * Ejecuta un comando SSH y retorna resultado simplificado.
   */
  private async exec(command: string): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    const result = await this.ssh.executeCommand(command);
    return {
      exitCode: result.exitCode ?? 1,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  /**
   * Configura renovación automática de certificados.
   * Intenta usar systemd timer (nativo de certbot), luego cron como fallback.
   */
  async setup(config?: RenewalConfig): Promise<RenewalSetupResult> {
    const steps: string[] = [];
    
    try {
      // Verificar si certbot timer ya existe
      const timerExists = await this.checkSystemdTimer();
      
      if (timerExists) {
        steps.push('Certbot timer de systemd ya está configurado');
        
        // Configurar post-renewal hook si se especificó
        if (config?.postRenewalHook) {
          const hookResult = await this.setupPostRenewalHook(config.postRenewalHook);
          steps.push(...hookResult.steps);
        }
        
        return {
          success: true,
          mechanism: 'certbot-native',
          steps,
        };
      }

      // Intentar configurar con systemd
      const systemdResult = await this.setupSystemdTimer(config);
      
      if (systemdResult.success) {
        steps.push(...systemdResult.steps);
        return {
          ...systemdResult,
          steps,
        };
      }

      // Fallback a cron
      steps.push('Systemd timer no disponible, usando cron');
      const cronResult = await this.setupCron(config);
      steps.push(...cronResult.steps);
      
      return {
        ...cronResult,
        steps,
      };
    } catch (error) {
      return {
        success: false,
        steps,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * Verifica si el timer de systemd de certbot existe.
   */
  private async checkSystemdTimer(): Promise<boolean> {
    const result = await this.exec('systemctl list-timers certbot.timer 2>/dev/null');
    return result.exitCode === 0 && result.stdout.includes('certbot.timer');
  }

  /**
   * Configura timer de systemd para renovación.
   */
  private async setupSystemdTimer(
    config?: RenewalConfig
  ): Promise<RenewalSetupResult> {
    const steps: string[] = [];
    
    try {
      // Verificar si systemd está disponible
      const systemdCheck = await this.exec('which systemctl');
      if (systemdCheck.exitCode !== 0) {
        return {
          success: false,
          steps,
          error: 'Systemd no está disponible',
        };
      }

      // Configurar post-renewal hook si se especificó
      if (config?.postRenewalHook) {
        const hookResult = await this.setupPostRenewalHook(config.postRenewalHook);
        steps.push(...hookResult.steps);
      }

      // Habilitar y arrancar timer de certbot
      const enableResult = await this.exec('sudo systemctl enable certbot.timer');
      if (enableResult.exitCode !== 0) {
        return {
          success: false,
          steps,
          error: `No se pudo habilitar timer: ${enableResult.stderr}`,
        };
      }
      steps.push('Timer de certbot habilitado');

      const startResult = await this.exec('sudo systemctl start certbot.timer');
      if (startResult.exitCode !== 0) {
        return {
          success: false,
          steps,
          error: `No se pudo arrancar timer: ${startResult.stderr}`,
        };
      }
      steps.push('Timer de certbot iniciado');

      // Verificar estado
      const statusResult = await this.exec('systemctl status certbot.timer --no-pager');
      if (statusResult.stdout.includes('active')) {
        steps.push('Timer verificado y activo');
      }

      return {
        success: true,
        mechanism: 'systemd',
        steps,
      };
    } catch (error) {
      return {
        success: false,
        steps,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * Configura cron para renovación.
   */
  private async setupCron(config?: RenewalConfig): Promise<RenewalSetupResult> {
    const steps: string[] = [];
    
    try {
      // Comando de renovación
      let renewCmd = 'certbot renew --quiet';
      
      if (config?.postRenewalHook) {
        renewCmd += ` --post-hook "${config.postRenewalHook}"`;
      }

      // Crear entrada de cron (ejecuta dos veces al día como recomienda Let's Encrypt)
      const cronEntry = `0 0,12 * * * root ${renewCmd}\n`;
      const cronFile = '/etc/cron.d/certbot-renewal';
      
      const writeCmd = `echo '${cronEntry}' | sudo tee ${cronFile} > /dev/null`;
      const writeResult = await this.exec(writeCmd);
      
      if (writeResult.exitCode !== 0) {
        return {
          success: false,
          steps,
          error: `No se pudo crear entrada de cron: ${writeResult.stderr}`,
        };
      }
      steps.push('Entrada de cron creada');

      // Configurar permisos
      await this.exec(`sudo chmod 644 ${cronFile}`);
      steps.push('Permisos de cron configurados');

      return {
        success: true,
        mechanism: 'cron',
        steps,
      };
    } catch (error) {
      return {
        success: false,
        steps,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * Configura hook para ejecutar después de renovar.
   */
  private async setupPostRenewalHook(
    hookCommand: string
  ): Promise<{ steps: string[] }> {
    const steps: string[] = [];
    
    try {
      // Crear script de hook
      const hookScript = `#!/bin/bash\n${hookCommand}\n`;
      const hookPath = '/etc/letsencrypt/renewal-hooks/post/reload-services';
      
      const writeCmd = `sudo tee ${hookPath} > /dev/null << 'EOF'\n${hookScript}EOF`;
      await this.exec(writeCmd);
      
      // Hacer ejecutable
      await this.exec(`sudo chmod +x ${hookPath}`);
      
      steps.push('Post-renewal hook configurado');
      steps.push(`Hook: ${hookCommand}`);
      
      return { steps };
    } catch (error) {
      steps.push(`Advertencia: no se pudo configurar hook: ${error}`);
      return { steps };
    }
  }

  /**
   * Prueba la renovación (dry-run).
   */
  async testRenewal(): Promise<{ success: boolean; output: string }> {
    try {
      const result = await this.exec('sudo certbot renew --dry-run');
      
      return {
        success: result.exitCode === 0,
        output: result.stdout + result.stderr,
      };
    } catch (error) {
      return {
        success: false,
        output: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }
}
