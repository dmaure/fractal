/**
 * Generador de workflows de GitHub Actions para deploy por merge.
 * Framework-agnostic según Artículo II de CONSTITUTION.md.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DeployRuntime } from '@fractal/core';
import type {
  DeployConfig,
  WorkflowGenerationResult,
  SecretConfig,
  DeployCommands,
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
    const commands = this.deriveCommands(config.runtime);
    return this.generateWorkflow(config, commands);
  }

  /**
   * Deriva los comandos de deploy desde el DeployRuntime del contrato del
   * adapter (SPEC-0006, FRA-51). packages/deploy no conoce ningún framework:
   * los comandos concretos los declara el adapter y acá solo se trasladan al
   * template del workflow.
   */
  private deriveCommands(runtime: DeployRuntime): DeployCommands {
    return {
      build: runtime.buildCommand ?? '',
      migrate: runtime.migrateCommand ?? '',
      cacheClear: runtime.postDeployCommands ?? [],
      healthcheckPath: runtime.healthcheck.path,
    };
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
    const imageTagExpr = '${{ github.sha }}';
    // Si hay servicio `app` (y por tanto worker/scheduler que montan el mismo
    // volumen), el up se parte: primero `app` puebla el volumen vacío; después
    // el resto. Sin eso, Docker copia la imagen en paralelo y falla con
    // `mkdir … file exists`. Un runtime sin `app` (p.ej. frontend estático)
    // sigue con un solo `up`.
    const hasApp = config.runtime.services.includes('app');
    const composeUpNoBuild = hasApp
      ? 'docker compose up -d --no-build app\n            docker compose up -d --no-build'
      : 'docker compose up -d --no-build';
    const composeUpRollback = hasApp
      ? 'docker compose up -d app\n                docker compose up -d'
      : 'docker compose up -d';

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
        run: |
          # Configurar SSH con host key verification
          echo "\$SSH_PRIVATE_KEY" > deploy_key
          chmod 600 deploy_key

          mkdir -p ~/.ssh
          echo "\$SSH_KNOWN_HOSTS" > ~/.ssh/known_hosts
          chmod 644 ~/.ssh/known_hosts

          # Deploy al servidor. Los valores calculados en el runner (registry,
          # tag de imagen, rama y credenciales de ghcr.io) se inyectan como
          # entorno del shell remoto; el heredoc va entre comillas ('ENDSSH')
          # para que el resto de variables se expandan en el servidor y no en el
          # runner. GHCR_USERNAME/GHCR_TOKEN usan las mismas credenciales del
          # login del runner (github.actor + GITHUB_TOKEN): GITHUB_TOKEN puede
          # hacer pull del paquete ghcr.io del propio repo, sin un secret humano
          # nuevo. El token nunca queda en el historial del shell: entra por
          # --password-stdin dentro del heredoc.
          ssh -o StrictHostKeyChecking=yes -i deploy_key "\$SSH_USER@\$SSH_HOST" \\
            "DOCKER_REGISTRY='ghcr.io/\${{ github.repository }}' IMAGE_TAG='${imageTagExpr}' GIT_BRANCH='\${{ github.ref_name }}' GHCR_USERNAME='\${{ github.actor }}' GHCR_TOKEN='\${{ secrets.GITHUB_TOKEN }}' bash -s" << 'ENDSSH'
            set -e

            cd /home/deploy

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
            
            # Actualizar compose con la nueva imagen: DOCKER_REGISTRY e IMAGE_TAG
            # vienen inyectados y docker compose los sustituye en el image: del
            # servicio de aplicación.
            # FRA-76: autenticarse en ghcr.io EN EL SERVIDOR antes del pull. La
            # imagen se publica en el registry privado del repo y sin login el
            # pull falla con "denied". El token entra por stdin, no por argv.
            echo "\$GHCR_TOKEN" | docker login ghcr.io -u "\$GHCR_USERNAME" --password-stdin
            docker compose pull
            # FRA-73: refrescar el volumen app_code para que el código de la
            # imagen nueva llegue a producción. Docker solo puebla el volumen al
            # crearlo, así que sin el drop el redeploy serviría el código viejo.
            # El up de app primero serializa esa copia si hay worker/scheduler.
            # db_data NO se toca: los datos de la base persisten.
            docker compose down --remove-orphans 2>/dev/null || true
            docker volume rm -f ${config.projectName}_app_code 2>/dev/null || true
            ${composeUpNoBuild}

            # Esperar que los contenedores estén listos
            sleep 10
`;

    if (commands.migrate) {
      workflow += `
            # Ejecutar migraciones
            docker compose exec -T app ${commands.migrate}
`;
    }

    if (commands.cacheClear.length > 0) {
      workflow += `
            # Comandos post-deploy
`;
      commands.cacheClear.forEach((cmd) => {
        workflow += `            docker compose exec -T app ${cmd}\n`;
      });
    }

    workflow += `            
            # Healthcheck
            HEALTH_URL="https://${config.domain}${commands.healthcheckPath}"
            echo "Checking health at \$HEALTH_URL"
            
            HEALTHCHECK_PASSED=false
            for i in {1..30}; do
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
              NEW_ENTRY='{"imageTag":"'\$IMAGE_TAG'","timestamp":"'\$TIMESTAMP'","healthcheck":"passed","commitSha":"'\$IMAGE_TAG'","branch":"'\$GIT_BRANCH'"}'
              UPDATED_STATE=\$(echo "\$CURRENT_STATE" | python3 -c "
import sys, json
state = json.load(sys.stdin)
state['updatedAt'] = '\$TIMESTAMP'
state['currentImageTag'] = '\$IMAGE_TAG'
state['lastSuccessfulImageTag'] = '\$IMAGE_TAG'
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
                NEW_ENTRY='{"imageTag":"'\$IMAGE_TAG'","timestamp":"'\$TIMESTAMP'","healthcheck":"failed","commitSha":"'\$IMAGE_TAG'","branch":"'\$GIT_BRANCH'"}'
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

                # Asegurar que la imagen anterior esté disponible. Login en
                # ghcr.io antes del pull (FRA-76), igual que en el deploy normal.
                echo "\$GHCR_TOKEN" | docker login ghcr.io -u "\$GHCR_USERNAME" --password-stdin
                docker compose pull || echo "⚠ Pull failed, using local image"

                # FRA-73: refrescar el volumen app_code también en el rollback,
                # para que se sirva el código de la imagen anterior y no el del
                # volumen viejo. El up de app primero evita la carrera de
                # populate. db_data no se toca.
                docker compose down --remove-orphans 2>/dev/null || true
                docker volume rm -f ${config.projectName}_app_code 2>/dev/null || true
                ${composeUpRollback}
                echo "✓ Rolled back to \$PREVIOUS_TAG"
                
                # Post-rollback healthcheck
                echo "Verifying rollback with healthcheck..."
                sleep 5
                for i in {1..10}; do
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
