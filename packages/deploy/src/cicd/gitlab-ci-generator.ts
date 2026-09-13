/**
 * Generador de pipelines de GitLab CI para deploy por merge.
 * Framework-agnostic según Artículo II de CONSTITUTION.md.
 */

import type { 
  DeployConfig, 
  WorkflowGenerationResult, 
  SecretConfig,
  DeployCommands 
} from './types.js';

export class GitLabCiGenerator {
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
   * Genera el pipeline de GitLab CI.
   */
  generate(config: DeployConfig): WorkflowGenerationResult {
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

    return {
      success: true,
      filePath: config.outputPath,
      secrets,
      crossRepoSecrets,
    };
  }

  /**
   * Genera el contenido del pipeline YAML.
   * Método público para permitir tests de snapshot.
   */
  generatePipelineContent(config: DeployConfig): string {
    const commands = this.getCommandsForTarget(config.targetType);
    return this.generatePipeline(config, commands);
  }

  /**
   * Obtiene comandos de deploy para el target especificado.
   * TEMPORAL: Hardcodeado hasta SPEC-0006 (contrato del adapter).
   * Los pipelines generados contienen comandos concretos de toolchain;
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
   * En GitLab se llaman "CI/CD Variables".
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
        name: 'DOCKER_REGISTRY_USER',
        description: 'Usuario del registry de Docker (ej: GitLab Container Registry)',
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
   * Genera el contenido del pipeline YAML.
   */
  private generatePipeline(config: DeployConfig, commands: DeployCommands): string {
    const timestamp = new Date().toISOString();
    const imageTag = '$CI_COMMIT_SHORT_SHA';

    let pipeline = `# Pipeline de deploy generado por Fractal
# Generado: ${timestamp}
# Proyecto: ${config.projectName}
# Target: ${config.targetType}

variables:
  PROJECT_NAME: ${config.projectName}
  DOMAIN: ${config.domain}
  IMAGE_NAME: $CI_REGISTRY_IMAGE/${config.projectName}
  DOCKER_DRIVER: overlay2

stages:
  - build
  - deploy

build:
  stage: build
  image: docker:24
  services:
    - docker:24-dind
  only:
    - ${config.productionBranch}
  before_script:
    - docker login -u $DOCKER_REGISTRY_USER -p $DOCKER_REGISTRY_TOKEN $CI_REGISTRY
  script:
    - docker build -t $IMAGE_NAME:${imageTag} -t $IMAGE_NAME:latest .
    - docker push $IMAGE_NAME:${imageTag}
    - docker push $IMAGE_NAME:latest

deploy:
  stage: deploy
  image: alpine:latest
  only:
    - ${config.productionBranch}
  timeout: 10 minutes
  before_script:
    - apk add --no-cache openssh-client curl
    - eval \$(ssh-agent -s)
    - echo "$SSH_PRIVATE_KEY" | tr -d '\\r' | ssh-add -
    - mkdir -p ~/.ssh
    - chmod 700 ~/.ssh
    - ssh-keyscan $SSH_HOST >> ~/.ssh/known_hosts
  script:
    - |
      ssh $SSH_USER@$SSH_HOST << 'ENDSSH'
        set -e
        
        cd /var/www/${config.projectName}
        
        # Guardar imagen actual para rollback
        CURRENT_IMAGE=$(docker compose images -q app 2>/dev/null || echo "none")
        echo "Current image: $CURRENT_IMAGE"
        
        # Actualizar compose con nueva imagen
        export IMAGE_TAG=${imageTag}
        docker compose pull
        docker compose up -d --no-build
        
        # Esperar que los contenedores estén listos
        sleep 10
`;

    if (config.targetType === 'backend-full') {
      pipeline += `        
        # Ejecutar migraciones
        docker compose exec -T app ${commands.migrate}
        
        # Limpiar caches
`;
      commands.cacheClear.forEach((cmd) => {
        pipeline += `        docker compose exec -T app ${cmd}\n`;
      });
    }

    pipeline += `        
        # Healthcheck
        HEALTH_URL="https://${config.domain}${commands.healthcheckPath}"
        echo "Checking health at $HEALTH_URL"
        
        for i in $(seq 1 30); do
          HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL || echo "000")
          if [ "$HTTP_CODE" = "200" ]; then
            echo "✓ Healthcheck passed"
            exit 0
          fi
          echo "Attempt $i/30: HTTP $HTTP_CODE, retrying..."
          sleep 2
        done
        
        echo "✗ Healthcheck failed after 30 attempts"
        
        # Rollback a la imagen anterior
        if [ "$CURRENT_IMAGE" != "none" ]; then
          echo "Rolling back to previous image..."
          docker compose down
          # Restaurar imagen anterior (requiere tag versionado previo)
          PREVIOUS_TAG=$(docker images $IMAGE_NAME --format "{{.Tag}}" | grep -v latest | head -n 1)
          if [ -n "$PREVIOUS_TAG" ]; then
            export IMAGE_TAG=$PREVIOUS_TAG
            docker compose up -d
            echo "Rolled back to $PREVIOUS_TAG"
          fi
        fi
        
        exit 1
      ENDSSH
  after_script:
    - |
      if [ $CI_JOB_STATUS == 'success' ]; then
        echo "✓ Deploy exitoso a https://${config.domain}"
      else
        echo "✗ Deploy falló, ver logs arriba"
      fi
`;

    return pipeline;
  }
}
