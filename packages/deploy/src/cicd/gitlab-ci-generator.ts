/**
 * Generador de pipelines de GitLab CI para deploy por merge.
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
    const content = this.generatePipelineContent(config);

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
        error: `Failed to write pipeline: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
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
        name: 'SSH_KNOWN_HOSTS',
        description: 'Host key del servidor (output de ssh-keyscan durante provisioning). Formato: "[host]:port ssh-ed25519 AAAA..."',
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
    - docker build -t $IMAGE_NAME:$CI_COMMIT_SHORT_SHA -t $IMAGE_NAME:latest .
    - docker push $IMAGE_NAME:$CI_COMMIT_SHORT_SHA
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
    - echo "$SSH_KNOWN_HOSTS" > ~/.ssh/known_hosts
    - chmod 644 ~/.ssh/known_hosts
  script:
    - |
      ssh -o StrictHostKeyChecking=yes $SSH_USER@$SSH_HOST << ENDSSH
        set -e
        
        cd /var/www/${config.projectName}
        
        # Leer estado del servidor para obtener tag anterior para rollback
        STATE_FILE="/etc/fractal/state.json"
        PREVIOUS_TAG=""
        if [ -f "\$STATE_FILE" ]; then
          # Usar jq si está disponible, sino python con json.load (robusto contra pretty-print)
          if command -v jq &> /dev/null; then
            PREVIOUS_TAG=\$(sudo cat \$STATE_FILE | jq -r '.lastSuccessfulImageTag // ""')
          else
            PREVIOUS_TAG=\$(sudo cat \$STATE_FILE | python3 -c "import sys, json; print(json.load(sys.stdin).get('lastSuccessfulImageTag', ''))")
          fi
          echo "Previous successful tag: \$PREVIOUS_TAG"
        fi
        
        # Actualizar compose con nueva imagen (IMAGE_TAG pasa desde CI)
        export IMAGE_TAG=$CI_COMMIT_SHORT_SHA
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
        echo "Checking health at \$HEALTH_URL"
        
        HEALTHCHECK_PASSED=false
        for i in \$(seq 1 30); do
          HTTP_CODE=\$(curl -s -o /dev/null -w "%{http_code}" \$HEALTH_URL || echo "000")
          if [ "\$HTTP_CODE" = "200" ]; then
            echo "✓ Healthcheck passed"
            HEALTHCHECK_PASSED=true
            break
          fi
          echo "Attempt \$i/30: HTTP \$HTTP_CODE, retrying..."
          sleep 2
        done
        
        # Registrar el deploy en el estado del servidor
        TIMESTAMP=\$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
        if [ "\$HEALTHCHECK_PASSED" = true ]; then
          # Deploy exitoso - actualizar estado
          sudo mkdir -p \$(dirname \$STATE_FILE)
          if [ -f "\$STATE_FILE" ]; then
            # Leer estado actual
            CURRENT_STATE=\$(sudo cat \$STATE_FILE)
          else
            # Crear estado inicial
            CURRENT_STATE='{"version":"1.0.0","createdAt":"'\$TIMESTAMP'","provisioning":{},"deployHistory":[]}'
          fi
          
          # Agregar entrada al historial
          NEW_ENTRY='{"imageTag":"$CI_COMMIT_SHORT_SHA","timestamp":"'\$TIMESTAMP'","healthcheck":"passed","commitSha":"$CI_COMMIT_SHA","branch":"$CI_COMMIT_REF_NAME"}'
          UPDATED_STATE=\$(echo "\$CURRENT_STATE" | python3 -c "
import sys, json
state = json.load(sys.stdin)
state['updatedAt'] = '\$TIMESTAMP'
state['currentImageTag'] = '$CI_COMMIT_SHORT_SHA'
state['lastSuccessfulImageTag'] = '$CI_COMMIT_SHORT_SHA'
state['deployHistory'].insert(0, \$NEW_ENTRY)
state['deployHistory'] = state['deployHistory'][:10]
print(json.dumps(state, indent=2))
")
          echo "\$UPDATED_STATE" | sudo tee \$STATE_FILE > /dev/null
          echo "✓ Deploy state updated"
          exit 0
        else
          echo "✗ Healthcheck failed after 30 attempts"
          
          # Registrar deploy fallido en el estado
          if [ -f "\$STATE_FILE" ]; then
            CURRENT_STATE=\$(sudo cat \$STATE_FILE)
            NEW_ENTRY='{"imageTag":"$CI_COMMIT_SHORT_SHA","timestamp":"'\$TIMESTAMP'","healthcheck":"failed","commitSha":"$CI_COMMIT_SHA","branch":"$CI_COMMIT_REF_NAME"}'
            UPDATED_STATE=\$(echo "\$CURRENT_STATE" | python3 -c "
import sys, json
state = json.load(sys.stdin)
state['updatedAt'] = '\$TIMESTAMP'
state['deployHistory'].insert(0, \$NEW_ENTRY)
state['deployHistory'] = state['deployHistory'][:10]
print(json.dumps(state, indent=2))
")
            echo "\$UPDATED_STATE" | sudo tee \$STATE_FILE > /dev/null
          fi
          
          # Rollback a la imagen anterior (AC-10: usar tag versionado, no contenedor previo)
          if [ -n "\$PREVIOUS_TAG" ]; then
            echo "Rolling back to previous successful tag: \$PREVIOUS_TAG"
            export IMAGE_TAG=\$PREVIOUS_TAG
            
            # Asegurar que la imagen anterior esté disponible
            docker compose pull || echo "⚠ Pull failed, using local image"
            
            docker compose up -d
            echo "✓ Rolled back to \$PREVIOUS_TAG"
            
            # Post-rollback healthcheck
            echo "Verifying rollback with healthcheck..."
            sleep 5
            for i in \$(seq 1 10); do
              HTTP_CODE=\$(curl -s -o /dev/null -w "%{http_code}" \$HEALTH_URL || echo "000")
              if [ "\$HTTP_CODE" = "200" ]; then
                echo "✓ Post-rollback healthcheck passed"
                break
              fi
              echo "Post-rollback attempt \$i/10: HTTP \$HTTP_CODE, retrying..."
              sleep 2
            done
          else
            echo "⚠ No previous successful tag found for rollback"
          fi
          
          exit 1
        fi
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
