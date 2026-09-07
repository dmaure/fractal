import type {
  ComposeConfig,
  ComposeGenerationResult,
  TargetType,
} from './types.js';
import {
  BACKEND_FULL_SERVICES,
  FRONTEND_STATIC_SERVICES,
} from './types.js';

/**
 * Generador de docker-compose.yml.
 * Implementa AC-4 del SPEC-0003.
 * Framework-agnostic: el set de contenedores es parametrizado.
 */
export class ComposeGenerator {
  /**
   * Genera un docker-compose.yml según el tipo de target.
   * Set de contenedores hardcodeado hasta que SPEC-0006 esté resuelto.
   */
  generate(config: ComposeConfig): ComposeGenerationResult {
    try {
      const services = this.getServicesForTarget(config.targetType);
      const composeContent = this.generateComposeYml(
        config.projectName,
        config.targetType,
        services
      );

      return {
        success: true,
        filePath: config.outputPath,
        services: [...services],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * Obtiene la lista de servicios según el tipo de target.
   */
  private getServicesForTarget(targetType: TargetType): readonly string[] {
    switch (targetType) {
      case 'backend-full':
        return BACKEND_FULL_SERVICES;
      case 'frontend-static':
        return FRONTEND_STATIC_SERVICES;
      default:
        throw new Error(`Tipo de target desconocido: ${targetType}`);
    }
  }

  /**
   * Genera el contenido del docker-compose.yml.
   */
  private generateComposeYml(
    projectName: string,
    targetType: TargetType,
    services: readonly string[]
  ): string {
    const header = this.generateHeader(projectName);
    
    if (targetType === 'backend-full') {
      return this.generateBackendFullCompose(projectName, header);
    } else if (targetType === 'frontend-static') {
      return this.generateFrontendStaticCompose(projectName, header);
    }
    
    throw new Error(`Tipo de target no soportado: ${targetType}`);
  }

  /**
   * Genera el header del docker-compose.yml.
   */
  private generateHeader(projectName: string): string {
    return `# docker-compose.yml generado por Fractal
# Proyecto: ${projectName}
# No editar manualmente - regenerar con 'fractal deploy'

version: '3.8'

`;
  }

  /**
   * Genera docker-compose.yml para backend completo.
   * Incluye: app, nginx, db, redis, worker, scheduler.
   */
  private generateBackendFullCompose(projectName: string, header: string): string {
    return header + `services:
  app:
    image: \${DOCKER_REGISTRY:-localhost}/${projectName}:latest
    container_name: ${projectName}_app
    restart: unless-stopped
    working_dir: /var/www/html
    volumes:
      - ./:/var/www/html
    environment:
      - DB_HOST=db
      - REDIS_HOST=redis
    networks:
      - ${projectName}_network
    depends_on:
      - db
      - redis

  nginx:
    image: nginx:alpine
    container_name: ${projectName}_nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./:/var/www/html
      - ./docker/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./docker/nginx/ssl:/etc/nginx/ssl:ro
    networks:
      - ${projectName}_network
    depends_on:
      - app

  db:
    image: postgres:15-alpine
    container_name: ${projectName}_db
    restart: unless-stopped
    environment:
      - POSTGRES_DB=\${DB_DATABASE:-${projectName}}
      - POSTGRES_USER=\${DB_USERNAME:-${projectName}}
      - POSTGRES_PASSWORD=\${DB_PASSWORD}
    volumes:
      - db_data:/var/lib/postgresql/data
    networks:
      - ${projectName}_network

  redis:
    image: redis:7-alpine
    container_name: ${projectName}_redis
    restart: unless-stopped
    volumes:
      - redis_data:/data
    networks:
      - ${projectName}_network

  worker:
    image: \${DOCKER_REGISTRY:-localhost}/${projectName}:latest
    container_name: ${projectName}_worker
    restart: unless-stopped
    working_dir: /var/www/html
    volumes:
      - ./:/var/www/html
    environment:
      - DB_HOST=db
      - REDIS_HOST=redis
    command: ["sh", "-c", "while true; do echo 'Worker placeholder - configure with adapter'; sleep 60; done"]
    networks:
      - ${projectName}_network
    depends_on:
      - db
      - redis

  scheduler:
    image: \${DOCKER_REGISTRY:-localhost}/${projectName}:latest
    container_name: ${projectName}_scheduler
    restart: unless-stopped
    working_dir: /var/www/html
    volumes:
      - ./:/var/www/html
    environment:
      - DB_HOST=db
      - REDIS_HOST=redis
    command: ["sh", "-c", "while true; do echo 'Scheduler placeholder - configure with adapter'; sleep 60; done"]
    networks:
      - ${projectName}_network
    depends_on:
      - db
      - redis

networks:
  ${projectName}_network:
    driver: bridge

volumes:
  db_data:
    driver: local
  redis_data:
    driver: local
`;
  }

  /**
   * Genera docker-compose.yml para frontend estático.
   * Solo nginx sirviendo archivos de dist/.
   */
  private generateFrontendStaticCompose(projectName: string, header: string): string {
    return header + `services:
  nginx:
    image: nginx:alpine
    container_name: ${projectName}_nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./dist:/usr/share/nginx/html:ro
      - ./docker/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./docker/nginx/ssl:/etc/nginx/ssl:ro
    networks:
      - ${projectName}_network

networks:
  ${projectName}_network:
    driver: bridge
`;
  }

  /**
   * Valida la configuración antes de generar.
   */
  validateConfig(config: ComposeConfig): { valid: boolean; error?: string } {
    if (!config.projectName || config.projectName.trim() === '') {
      return {
        valid: false,
        error: 'El nombre del proyecto es requerido',
      };
    }

    if (!config.outputPath || config.outputPath.trim() === '') {
      return {
        valid: false,
        error: 'La ruta de salida es requerida',
      };
    }

    const validTargets: TargetType[] = ['backend-full', 'frontend-static'];
    if (!validTargets.includes(config.targetType)) {
      return {
        valid: false,
        error: `Tipo de target inválido: ${config.targetType}. Valores válidos: ${validTargets.join(', ')}`,
      };
    }

    return { valid: true };
  }
}
