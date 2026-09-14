import type {
  HealthcheckConfig,
  HealthcheckResult,
  RollbackResult,
  DeployWithRollbackResult,
  SshClientInterface,
} from './types.js';

/**
 * Gestor de rollback automático.
 * 
 * Implementa AC-10 del SPEC-0003: rollback automático a la imagen
 * versionada anterior si el healthcheck post-deploy falla.
 * 
 * El rollback revierte al tag de imagen versionado anterior, no reinicia
 * un contenedor previo que puede ya no existir (determinístico, Artículo VII).
 */
export class RollbackManager {
  constructor(
    private readonly sshClient: SshClientInterface,
    private readonly projectName: string,
    private readonly composeFilePath: string = '/var/www/html/docker-compose.yml'
  ) {}

  /**
   * Ejecuta un healthcheck HTTP.
   */
  async performHealthcheck(config: HealthcheckConfig): Promise<HealthcheckResult> {
    const { url, timeout, retries, retryInterval, acceptableStatusCodes } = config;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const startTime = Date.now();

        // Usar curl en el servidor para el healthcheck
        const curlCommand = `curl -s -o /dev/null -w '%{http_code}' --max-time ${Math.floor(timeout / 1000)} ${url}`;

        const result = await this.sshClient.executeCommand(curlCommand);

        if (!result.success) {
          if (attempt < retries) {
            await this.sleep(retryInterval);
            continue;
          }

          return {
            success: false,
            error: `Healthcheck falló después de ${retries} intentos: ${result.error}`,
          };
        }

        const statusCode = parseInt(result.output?.trim() || '0', 10);
        const responseTime = Date.now() - startTime;

        if (acceptableStatusCodes.includes(statusCode)) {
          return {
            success: true,
            statusCode,
            responseTime,
          };
        }

        if (attempt < retries) {
          await this.sleep(retryInterval);
          continue;
        }

        return {
          success: false,
          error: `Status code ${statusCode} no aceptable. Esperado: ${acceptableStatusCodes.join(', ')}`,
          statusCode,
          responseTime,
        };
      } catch (error) {
        if (attempt < retries) {
          await this.sleep(retryInterval);
          continue;
        }

        return {
          success: false,
          error: error instanceof Error ? error.message : 'Error desconocido',
        };
      }
    }

    return {
      success: false,
      error: 'Healthcheck falló: número máximo de intentos alcanzado',
    };
  }

  /**
   * Realiza rollback a la imagen versionada anterior.
   */
  async rollback(previousImageTag: string): Promise<RollbackResult> {
    try {
      // Detener los contenedores actuales
      const stopResult = await this.sshClient.executeCommand(
        `cd /var/www/html && docker compose down`
      );

      if (!stopResult.success) {
        return {
          success: false,
          error: `Error al detener contenedores: ${stopResult.error}`,
        };
      }

      // Actualizar el docker-compose.yml para usar la imagen anterior
      // Esto asume que la imagen está en formato ${REGISTRY}/${PROJECT}:${TAG}
      const updateImageCommand = `
        cd /var/www/html && \\
        sed -i.bak 's|image: \\(.*\\):.*|image: \\1:${previousImageTag}|g' docker-compose.yml
      `;

      const updateResult = await this.sshClient.executeCommand(updateImageCommand);

      if (!updateResult.success) {
        return {
          success: false,
          error: `Error al actualizar docker-compose.yml: ${updateResult.error}`,
        };
      }

      // Levantar los contenedores con la imagen anterior
      const upResult = await this.sshClient.executeCommand(
        `cd /var/www/html && docker compose up -d`
      );

      if (!upResult.success) {
        return {
          success: false,
          error: `Error al levantar contenedores con imagen anterior: ${upResult.error}`,
        };
      }

      return {
        success: true,
        rolledBackTo: previousImageTag,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * Despliega una nueva versión y ejecuta rollback automático si el healthcheck falla.
   */
  async deployWithAutoRollback(
    newImageTag: string,
    previousImageTag: string | null,
    healthcheckConfig: HealthcheckConfig
  ): Promise<DeployWithRollbackResult> {
    try {
      // Actualizar la imagen en docker-compose.yml
      const updateImageCommand = `
        cd /var/www/html && \\
        sed -i.bak 's|image: \\(.*\\):.*|image: \\1:${newImageTag}|g' docker-compose.yml
      `;

      const updateResult = await this.sshClient.executeCommand(updateImageCommand);

      if (!updateResult.success) {
        return {
          success: false,
          error: `Error al actualizar docker-compose.yml: ${updateResult.error}`,
          deployed: false,
          healthcheckPassed: false,
          rolledBack: false,
          currentImageTag: previousImageTag || 'unknown',
        };
      }

      // Deploy: docker compose up
      const deployResult = await this.sshClient.executeCommand(
        `cd /var/www/html && docker compose up -d`
      );

      if (!deployResult.success) {
        return {
          success: false,
          error: `Error al desplegar: ${deployResult.error}`,
          deployed: false,
          healthcheckPassed: false,
          rolledBack: false,
          currentImageTag: previousImageTag || 'unknown',
        };
      }

      // Esperar un poco para que los contenedores inicien
      await this.sleep(5000);

      // Ejecutar healthcheck
      const healthcheckResult = await this.performHealthcheck(healthcheckConfig);

      if (healthcheckResult.success) {
        // Deploy exitoso
        return {
          success: true,
          deployed: true,
          healthcheckPassed: true,
          rolledBack: false,
          currentImageTag: newImageTag,
        };
      }

      // Healthcheck falló - hacer rollback
      if (!previousImageTag) {
        return {
          success: false,
          error: `Healthcheck falló y no hay versión anterior para rollback: ${healthcheckResult.error}`,
          deployed: true,
          healthcheckPassed: false,
          rolledBack: false,
          currentImageTag: newImageTag,
        };
      }

      const rollbackResult = await this.rollback(previousImageTag);

      if (!rollbackResult.success) {
        return {
          success: false,
          error: `Healthcheck falló y rollback también falló: ${healthcheckResult.error} | Rollback: ${rollbackResult.error}`,
          deployed: true,
          healthcheckPassed: false,
          rolledBack: false,
          currentImageTag: newImageTag,
        };
      }

      // Rollback exitoso
      return {
        success: false,
        error: `Deploy falló (healthcheck): ${healthcheckResult.error}. Rollback exitoso a ${previousImageTag}`,
        deployed: true,
        healthcheckPassed: false,
        rolledBack: true,
        currentImageTag: previousImageTag,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
        deployed: false,
        healthcheckPassed: false,
        rolledBack: false,
        currentImageTag: previousImageTag || 'unknown',
      };
    }
  }

  /**
   * Helper para sleep.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
