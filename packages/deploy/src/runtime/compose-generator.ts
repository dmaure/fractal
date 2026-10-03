import type {
  ComposeConfig,
  ComposeGenerationResult,
} from './types.js';

/**
 * Generador de docker-compose.yml.
 * Implementa AC-4 del SPEC-0003 y AC-3 del SPEC-0006.
 * Framework-agnostic: consume la declaración de runtime del adapter contract.
 */
export class ComposeGenerator {
  /**
   * Genera un docker-compose.yml según la declaración de runtime del adapter.
   * Consume DeployRuntime en lugar de constantes hardcodeadas (SPEC-0006 T2).
   */
  generate(config: ComposeConfig): ComposeGenerationResult {
    try {
      const services = config.runtime.services;
      const composeContent = this.generateComposeYml(
        config.projectName,
        config.runtime,
        services
      );

      return {
        success: true,
        filePath: config.outputPath,
        services: [...services],
        content: composeContent,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * Genera el contenido del docker-compose.yml.
   */
  private generateComposeYml(
    projectName: string,
    runtime: ComposeConfig['runtime'],
    services: readonly string[]
  ): string {
    const header = this.generateHeader(projectName);
    
    // Determinar el tipo de compose según los servicios declarados
    // Backend completo tiene más que solo nginx
    const isBackendFull = services.length > 1 || (services.length === 1 && services[0] !== 'nginx');
    
    if (isBackendFull) {
      return this.generateBackendFullCompose(projectName, header, runtime);
    } else {
      return this.generateFrontendStaticCompose(projectName, header, runtime);
    }
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
   * Los servicios se determinan desde el DeployRuntime del adapter.
   */
  private generateBackendFullCompose(projectName: string, header: string, runtime: ComposeConfig['runtime']): string {
    const services = runtime.services;
    const port = runtime.port || 80;
    const hasApp = services.includes('app');
    const hasDb = services.includes('db');
    const hasRedis = services.includes('redis');
    const hasCache = services.includes('cache');
    const hasCacheService = hasRedis || hasCache;
    const cacheServiceName = hasCache ? 'cache' : 'redis';
    const hasWorker = services.includes('worker');
    const hasScheduler = services.includes('scheduler');
    
    let compose = header + 'services:\n';
    
    // App service
    if (hasApp) {
      compose += `  app:
    image: \${DOCKER_REGISTRY:-localhost}/${projectName}:latest
    container_name: ${projectName}_app
    restart: unless-stopped
    working_dir: /var/www/html
    volumes:
      - ./:/var/www/html
    environment:`;
      
      if (hasDb) {
        compose += '\n      - DB_HOST=db';
      }
      if (hasCacheService) {
        compose += `\n      - REDIS_HOST=${cacheServiceName}`;
      }
      
      compose += `
    networks:
      - ${projectName}_network
    depends_on:`;
      
      if (hasDb) {
        compose += '\n      - db';
      }
      if (hasCacheService) {
        compose += `\n      - ${cacheServiceName}`;
      }
      compose += '\n\n';
    }
    
    // Nginx service
    if (services.includes('nginx')) {
      compose += `  nginx:
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
      - ${projectName}_network`;
      
      if (hasApp) {
        compose += `
    depends_on:
      - app`;
      }
      compose += '\n\n';
    }
    
    // DB service
    if (hasDb) {
      compose += `  db:
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

`;
    }
    
    // Redis/Cache service
    if (hasCacheService) {
      compose += `  ${cacheServiceName}:
    image: redis:7-alpine
    container_name: ${projectName}_${cacheServiceName}
    restart: unless-stopped
    volumes:
      - ${cacheServiceName}_data:/data
    networks:
      - ${projectName}_network

`;
    }
    
    // Worker service
    if (hasWorker) {
      compose += `  worker:
    image: \${DOCKER_REGISTRY:-localhost}/${projectName}:latest
    container_name: ${projectName}_worker
    restart: unless-stopped
    working_dir: /var/www/html
    volumes:
      - ./:/var/www/html
    environment:`;
      
      if (hasDb) {
        compose += '\n      - DB_HOST=db';
      }
      if (hasCacheService) {
        compose += `\n      - REDIS_HOST=${cacheServiceName}`;
      }
      
      compose += `
    command: ["sh", "-c", "while true; do echo 'Worker placeholder - configure with adapter'; sleep 60; done"]
    networks:
      - ${projectName}_network
    depends_on:`;
      
      if (hasDb) {
        compose += '\n      - db';
      }
      if (hasCacheService) {
        compose += `\n      - ${cacheServiceName}`;
      }
      compose += '\n\n';
    }
    
    // Scheduler service
    if (hasScheduler) {
      compose += `  scheduler:
    image: \${DOCKER_REGISTRY:-localhost}/${projectName}:latest
    container_name: ${projectName}_scheduler
    restart: unless-stopped
    working_dir: /var/www/html
    volumes:
      - ./:/var/www/html
    environment:`;
      
      if (hasDb) {
        compose += '\n      - DB_HOST=db';
      }
      if (hasCacheService) {
        compose += `\n      - REDIS_HOST=${cacheServiceName}`;
      }
      
      compose += `
    command: ["sh", "-c", "while true; do echo 'Scheduler placeholder - configure with adapter'; sleep 60; done"]
    networks:
      - ${projectName}_network
    depends_on:`;
      
      if (hasDb) {
        compose += '\n      - db';
      }
      if (hasCacheService) {
        compose += `\n      - ${cacheServiceName}`;
      }
      compose += '\n\n';
    }
    
    // Networks
    compose += `networks:
  ${projectName}_network:
    driver: bridge

`;
    
    // Volumes
    if (hasDb || hasCacheService) {
      compose += 'volumes:\n';
      if (hasDb) {
        compose += '  db_data:\n    driver: local\n';
      }
      if (hasCacheService) {
        compose += `  ${cacheServiceName}_data:\n    driver: local\n`;
      }
    }
    
    return compose;
  }

  /**
   * Genera docker-compose.yml para frontend estático.
   * Solo nginx sirviendo archivos de dist/.
   */
  private generateFrontendStaticCompose(projectName: string, header: string, runtime: ComposeConfig['runtime']): string {
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
    
    if (!config.runtime) {
      return {
        valid: false,
        error: 'La declaración de runtime es requerida',
      };
    }
    
    if (!config.runtime.services || config.runtime.services.length === 0) {
      return {
        valid: false,
        error: 'La declaración de runtime debe incluir al menos un servicio',
      };
    }

    return { valid: true };
  }
}
