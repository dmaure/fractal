/**
 * Generador de workflows de GitHub Actions para deploy por merge.
 * Framework-agnostic según Artículo II de CONSTITUTION.md.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { 
  DeployConfig, 
  WorkflowGenerationResult, 
  SecretConfig,
  DeployCommands,
  TargetType 
} from './types.js';

export class GitHubActionsGenerator {
  /**
   * Valida la configuración de deploy.
   */
  validateConfig(config: DeployConfig): { valid: boolean; error?: string } {
    if (!config.projectName || config.projectName.trim() === '') {
      return { valid: false, error: 'El nombre del proyecto no puede estar vacío' };
    }

    if (!config.productionBranch || config.productionBranch.trim() === '') {
      return { valid: false, error: 'La rama de producción no puede estar vacía' };
    }

    if (!config.domain || config.domain.trim() === '') {
      return { valid: false, error: 'El dominio no puede estar vacío' };
    }

    if (!config.outputPath || config.outputPath.trim() === '') {
      return { valid: false, error: 'La ruta de salida no puede estar vacía' };
    }

    if (!['backend-full', 'frontend-static'].includes(config.targetType)) {
      return { valid: false, error: 'Tipo de target inválido' };
    }

    return { valid: true };
  }

  /**
   * Genera el workflow de GitHub Actions.
   */
  async generate(config: DeployConfig): Promise<WorkflowGenerationResult> {
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      return {
        success: false,
        secrets: [],
        error: validation.error,
      };
    }

    const secrets = this.getRequiredSecrets(config);
    const crossRepoSecrets = this.getCrossRepoSecrets(config);
    const content = this.generateWorkflowContent(config);

    try {
      await mkdir(dirname(config.outputPath), { recursive: true });
      await writeFile(config.outputPath, content, 'utf-8');

      return {
        success: true,
        filePath: config.outputPath,
        content,
        secrets,
        crossRepoSecrets,
      };
    } catch (error) {
      return {
        success: false,
        secrets,
        error: `Failed to write workflow: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Genera el contenido del workflow YAML.
   * Método público para permitir tests de snapshot.
   */
  generateWorkflowContent(config: DeployConfig): string {
    const commands = this.getCommandsForTarget(config.targetType);
    return this.generateWorkflow(config, commands);
  }

  /**
   * Obtiene comandos de deploy para el target especificado.
   * TEMPORAL: Hardcodeado hasta SPEC-0006 (contrato del adapter).
   * Los workflows generados contienen comandos concretos de toolchain;
   * esto no viola el Artículo II porque son templates de salida, no lógica
   * de deploy que asume un framework en el código fuente de packages/deploy.
   */
  private getCommandsForTarget(targetType: TargetType): DeployCommands {
    if (targetType === 'backend-full') {
      return {
        build: 'composer install --no-dev --optimize-autoloader',
        migrate: 'php artisan migrate --force',
        cacheClear: [
          'php artisan config:clear',
          'php artisan route:clear',
          'php artisan view:clear',
          'php artisan cache:clear',
        ],
        healthcheckPath: '/health',
      };
    } else {
      return {
        build: 'npm run build',
        migrate: '',
        cacheClear: [],
        healthcheckPath: '/',
      };
    }
  }

  /**
   * Obtiene la lista de secrets requeridos para este repo.
   */
  private getRequiredSecrets(config: DeployConfig): SecretConfig[] {
    const secrets: SecretConfig[] = [
      {
        name: 'SSH_HOST',
        description: `Dirección IP del servidor VPS para ${config.projectName}`,
      },
      {
        name: 'SSH_USER',
        description: 'Usuario SSH (generalmente "deploy")',
      },
      {
        name: 'SSH_PRIVATE_KEY',
        description: 'Clave privada SSH para autenticación en el servidor',
      },
      {
        name: 'SSH_KNOWN_HOSTS',
        description: 'Host key del servidor (output de ssh-keyscan durante provisioning). Formato: "[host]:port ssh-ed25519 AAAA..."',
      },
      {
        name: 'DOCKER_REGISTRY_USER',
        description: 'Usuario del registry de Docker (ej: GitHub Container Registry)',
      },
      {
        name: 'DOCKER_REGISTRY_TOKEN',
        description: 'Token de autenticación del registry de Docker',
      },
    ];

    if (config.targetType === 'backend-full') {
      secrets.push(
        {
          name: 'DB_PASSWORD',
          description: 'Contraseña de la base de datos de producción',
        },
        {
          name: 'APP_KEY',
          description: 'Clave de aplicación generada durante el provisioning',
        }
      );
    }

    if (config.multiRepo?.siblingDomain) {
      if (config.multiRepo.role === 'web') {
        secrets.push({
          name: 'API_URL',
          description: `URL de la API: https://${config.multiRepo.siblingDomain}`,
        });
      } else {
        secrets.push(
          {
            name: 'CORS_ALLOWED_ORIGIN',
            description: `Origen permitido para CORS: https://${config.multiRepo.siblingDomain}`,
          },
          {
            name: 'SANCTUM_STATEFUL_DOMAINS',
            description: `Dominio de Sanctum: ${config.multiRepo.siblingDomain}`,
          }
        );
      }
    }

    return secrets;
  }

  /**
   * Obtiene secrets que deben cargarse en el repo hermano (ADR-0012).
   */
  private getCrossRepoSecrets(config: DeployConfig): SecretConfig[] | undefined {
    if (!config.multiRepo?.siblingGitUrl || !config.domain) {
      return undefined;
    }

    const crossSecrets: SecretConfig[] = [];

    if (config.multiRepo.role === 'api') {
      crossSecrets.push({
        name: 'API_URL',
        description: `URL de la API de ${config.projectName}: https://${config.domain}`,
        crossRepo: true,
        targetRepo: config.multiRepo.siblingGitUrl,
      });
    } else {
      crossSecrets.push(
        {
          name: 'CORS_ALLOWED_ORIGIN',
          description: `Origen permitido para CORS: https://${config.domain}`,
          crossRepo: true,
          targetRepo: config.multiRepo.siblingGitUrl,
        },
        {
          name: 'SANCTUM_STATEFUL_DOMAINS',
          description: `Dominio de Sanctum: ${config.domain}`,
          crossRepo: true,
          targetRepo: config.multiRepo.siblingGitUrl,
        }
      );
    }

    return crossSecrets;
  }

  /**
   * Genera el contenido del workflow YAML.
   */
  private generateWorkflow(config: DeployConfig, commands: DeployCommands): string {
    const timestamp = new Date().toISOString();
    const imageTagExpr = '\${GITHUB_SHA:0:7}';

    let workflow = `# Workflow de deploy generado por Fractal
# Generado: ${timestamp}
# Proyecto: ${config.projectName}
# Target: ${config.targetType}

name: Deploy to Production

on:
  push:
    branches:
      - ${config.productionBranch}

env:
  PROJECT_NAME: ${config.projectName}
  DOMAIN: ${config.domain}
  IMAGE_NAME: ghcr.io/\${{ github.repository }}/${config.projectName}

jobs:
  deploy:
    name: Deploy
    runs-on: ubuntu-latest
    timeout-minutes: 10
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ secrets.DOCKER_REGISTRY_USER }}
          password: \${{ secrets.DOCKER_REGISTRY_TOKEN }}

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: |
            \${{ env.IMAGE_NAME }}:${imageTagExpr}
            \${{ env.IMAGE_NAME }}:latest
          cache-from: type=registry,ref=\${{ env.IMAGE_NAME }}:latest
          cache-to: type=inline

      - name: Deploy to server
        env:
          SSH_HOST: \${{ secrets.SSH_HOST }}
          SSH_USER: \${{ secrets.SSH_USER }}
          SSH_PRIVATE_KEY: \${{ secrets.SSH_PRIVATE_KEY }}
          SSH_KNOWN_HOSTS: \${{ secrets.SSH_KNOWN_HOSTS }}
          IMAGE_TAG: ${imageTagExpr}
        run: |
          # Configurar SSH con host key verification
          echo "\$SSH_PRIVATE_KEY" > deploy_key
          chmod 600 deploy_key
          
          mkdir -p ~/.ssh
          echo "\$SSH_KNOWN_HOSTS" > ~/.ssh/known_hosts
          chmod 644 ~/.ssh/known_hosts
          
          # Deploy al servidor (IMAGE_TAG ya está en env)
          ssh -o StrictHostKeyChecking=yes -i deploy_key \$SSH_USER@\$SSH_HOST << ENDSSH
            set -e
            
            cd /var/www/${config.projectName}
            
            # Guardar imagen actual para rollback
            CURRENT_IMAGE=\$(docker compose images -q app 2>/dev/null || echo "none")
            echo "Current image: \$CURRENT_IMAGE"
            
            # Actualizar compose con nueva imagen
            export IMAGE_TAG=\$IMAGE_TAG
            docker compose pull
            docker compose up -d --no-build
            
            # Esperar que los contenedores estén listos
            sleep 10
`;

    if (config.targetType === 'backend-full') {
      workflow += `            
            # Ejecutar migraciones
            docker compose exec -T app ${commands.migrate}
            
            # Limpiar caches
`;
      commands.cacheClear.forEach((cmd) => {
        workflow += `            docker compose exec -T app ${cmd}\n`;
      });
    }

    workflow += `            
            # Healthcheck
            HEALTH_URL="https://${config.domain}${commands.healthcheckPath}"
            echo "Checking health at \$HEALTH_URL"
            
            for i in {1..30}; do
              HTTP_CODE=\$(curl -s -o /dev/null -w "%{http_code}" \$HEALTH_URL || echo "000")
              if [ "\$HTTP_CODE" = "200" ]; then
                echo "✓ Healthcheck passed"
                exit 0
              fi
              echo "Attempt \$i/30: HTTP \$HTTP_CODE, retrying..."
              sleep 2
            done
            
            echo "✗ Healthcheck failed after 30 attempts"
            
            # Rollback a la imagen anterior
            if [ "\$CURRENT_IMAGE" != "none" ]; then
              echo "Rolling back to previous image..."
              docker compose down
              # Restaurar imagen anterior (requiere tag versionado previo)
              PREVIOUS_TAG=\$(docker images ghcr.io/\${{ github.repository }}/${config.projectName} --format "{{.Tag}}" | grep -v latest | head -n 1)
              if [ -n "\$PREVIOUS_TAG" ]; then
                export IMAGE_TAG=\$PREVIOUS_TAG
                docker compose up -d
                echo "Rolled back to \$PREVIOUS_TAG"
              fi
            fi
            
            exit 1
ENDSSH
          
          rm -f deploy_key

      - name: Notify deployment status
        if: always()
        run: |
          if [ \${{ job.status }} == 'success' ]; then
            echo "✓ Deploy exitoso a https://${config.domain}"
          else
            echo "✗ Deploy falló, ver logs arriba"
          fi
`;

    return workflow;
  }
}
