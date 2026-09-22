import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'node:path';
import { mkdir, rm, readFile, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { CicdManager } from '@fractal/deploy';

/**
 * Tests de integración para generación de CI/CD en `fractal deploy`.
 * 
 * Cumple FRA-36: verifica que el CLI genera el workflow CI/CD después
 * del provisioning con las decisiones de producto aplicadas.
 */

describe('Deploy CI/CD generation (FRA-36)', () => {
  let testDir: string;
  
  beforeEach(async () => {
    // Crear directorio temporal para tests
    testDir = resolve(tmpdir(), `fractal-test-cicd-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
  });
  
  afterEach(async () => {
    // Limpiar directorio temporal
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignorar errores de limpieza
    }
  });

  describe('GitHub Actions workflow generation', () => {
    it('debe generar workflow en .github/workflows/deploy.yml', async () => {
      const cicdManager = new CicdManager();
      const outputPath = resolve(testDir, '.github/workflows/deploy.yml');
      
      const config = {
        provider: 'github-actions' as const,
        targetType: 'backend-full' as const,
        projectName: 'myapi',
        productionBranch: 'main',
        domain: 'api.example.com',
        outputPath,
      };
      
      const result = await cicdManager.generate(config);
      
      expect(result.success).toBe(true);
      expect(result.filePath).toBe(outputPath);
      
      // Verificar que el archivo fue creado
      await expect(access(outputPath)).resolves.toBeUndefined();
      
      // Verificar contenido básico
      const content = await readFile(outputPath, 'utf-8');
      expect(content).toContain('name: Deploy to Production');
      expect(content).toContain('branches:');
      expect(content).toContain('- main');
    });
    
    it('debe listar secrets requeridos para single repo', async () => {
      const cicdManager = new CicdManager();
      const outputPath = resolve(testDir, '.github/workflows/deploy.yml');
      
      const config = {
        provider: 'github-actions' as const,
        targetType: 'backend-full' as const,
        projectName: 'myapi',
        productionBranch: 'main',
        domain: 'api.example.com',
        outputPath,
      };
      
      const result = await cicdManager.generate(config);
      
      expect(result.success).toBe(true);
      expect(result.secrets).toBeDefined();
      expect(result.secrets.length).toBeGreaterThan(0);
      
      const secretNames = result.secrets.map(s => s.name);
      expect(secretNames).toContain('SSH_HOST');
      expect(secretNames).toContain('SSH_USER');
      expect(secretNames).toContain('SSH_PRIVATE_KEY');
      expect(secretNames).toContain('SSH_KNOWN_HOSTS');
      expect(secretNames).toContain('DOCKER_REGISTRY_USER');
      expect(secretNames).toContain('DOCKER_REGISTRY_TOKEN');
      expect(secretNames).toContain('DB_PASSWORD');
      expect(secretNames).toContain('APP_KEY');
    });
    
    it('debe listar secrets incluyendo cross-repo para multirepo API', async () => {
      const cicdManager = new CicdManager();
      const outputPath = resolve(testDir, '.github/workflows/deploy.yml');
      
      const config = {
        provider: 'github-actions' as const,
        targetType: 'backend-full' as const,
        projectName: 'myapi',
        productionBranch: 'main',
        domain: 'api.example.com',
        outputPath,
        multiRepo: {
          role: 'api' as const,
          siblingGitUrl: 'https://github.com/example/web.git',
          siblingDomain: 'app.example.com',
        },
      };
      
      const result = await cicdManager.generate(config);
      
      expect(result.success).toBe(true);
      expect(result.secrets).toBeDefined();
      expect(result.crossRepoSecrets).toBeDefined();
      expect(result.crossRepoSecrets!.length).toBeGreaterThan(0);
      
      // Verificar que los secrets del repo incluyen CORS
      const secretNames = result.secrets.map(s => s.name);
      expect(secretNames).toContain('CORS_ALLOWED_ORIGIN');
      expect(secretNames).toContain('SANCTUM_STATEFUL_DOMAINS');
      
      // Verificar cross-repo secrets
      const crossSecretNames = result.crossRepoSecrets!.map(s => s.name);
      expect(crossSecretNames).toContain('API_URL');
      
      // Verificar que tienen targetRepo
      const apiUrlSecret = result.crossRepoSecrets!.find(s => s.name === 'API_URL');
      expect(apiUrlSecret).toBeDefined();
      expect(apiUrlSecret!.targetRepo).toBe('https://github.com/example/web.git');
      expect(apiUrlSecret!.crossRepo).toBe(true);
    });
    
    it('debe listar secrets incluyendo cross-repo para multirepo Web', async () => {
      const cicdManager = new CicdManager();
      const outputPath = resolve(testDir, '.github/workflows/deploy.yml');
      
      const config = {
        provider: 'github-actions' as const,
        targetType: 'frontend-static' as const,
        projectName: 'myweb',
        productionBranch: 'main',
        domain: 'app.example.com',
        outputPath,
        multiRepo: {
          role: 'web' as const,
          siblingGitUrl: 'https://github.com/example/api.git',
          siblingDomain: 'api.example.com',
        },
      };
      
      const result = await cicdManager.generate(config);
      
      expect(result.success).toBe(true);
      expect(result.secrets).toBeDefined();
      expect(result.crossRepoSecrets).toBeDefined();
      expect(result.crossRepoSecrets!.length).toBeGreaterThan(0);
      
      // Verificar que los secrets del repo incluyen API_URL
      const secretNames = result.secrets.map(s => s.name);
      expect(secretNames).toContain('API_URL');
      
      // Verificar cross-repo secrets (CORS y Sanctum van al API)
      const crossSecretNames = result.crossRepoSecrets!.map(s => s.name);
      expect(crossSecretNames).toContain('CORS_ALLOWED_ORIGIN');
      expect(crossSecretNames).toContain('SANCTUM_STATEFUL_DOMAINS');
      
      // Verificar que tienen targetRepo
      const corsSecret = result.crossRepoSecrets!.find(s => s.name === 'CORS_ALLOWED_ORIGIN');
      expect(corsSecret).toBeDefined();
      expect(corsSecret!.targetRepo).toBe('https://github.com/example/api.git');
      expect(corsSecret!.crossRepo).toBe(true);
    });
  });

  describe('GitLab CI pipeline generation', () => {
    it('debe generar pipeline en .gitlab-ci.yml', async () => {
      const cicdManager = new CicdManager();
      const outputPath = resolve(testDir, '.gitlab-ci.yml');
      
      const config = {
        provider: 'gitlab-ci' as const,
        targetType: 'backend-full' as const,
        projectName: 'myapi',
        productionBranch: 'main',
        domain: 'api.example.com',
        outputPath,
      };
      
      const result = await cicdManager.generate(config);
      
      expect(result.success).toBe(true);
      expect(result.filePath).toBe(outputPath);
      
      // Verificar que el archivo fue creado
      await expect(access(outputPath)).resolves.toBeUndefined();
      
      // Verificar contenido básico
      const content = await readFile(outputPath, 'utf-8');
      expect(content).toContain('stages:');
      expect(content).toContain('deploy:');
    });
    
    it('debe listar CI/CD variables requeridas', async () => {
      const cicdManager = new CicdManager();
      const outputPath = resolve(testDir, '.gitlab-ci.yml');
      
      const config = {
        provider: 'gitlab-ci' as const,
        targetType: 'backend-full' as const,
        projectName: 'myapi',
        productionBranch: 'main',
        domain: 'api.example.com',
        outputPath,
      };
      
      const result = await cicdManager.generate(config);
      
      expect(result.success).toBe(true);
      expect(result.secrets).toBeDefined();
      expect(result.secrets.length).toBeGreaterThan(0);
      
      // GitLab usa el mismo concepto de secrets que GitHub
      const secretNames = result.secrets.map(s => s.name);
      expect(secretNames).toContain('SSH_HOST');
      expect(secretNames).toContain('SSH_USER');
    });
  });

  describe('Validación de configuración', () => {
    it('debe validar configuración válida', () => {
      const cicdManager = new CicdManager();
      
      const config = {
        provider: 'github-actions' as const,
        targetType: 'backend-full' as const,
        projectName: 'myapi',
        productionBranch: 'main',
        domain: 'api.example.com',
        outputPath: resolve(testDir, '.github/workflows/deploy.yml'),
      };
      
      const validation = cicdManager.validateConfig(config);
      
      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();
    });
    
    it('debe rechazar configuración con projectName vacío', () => {
      const cicdManager = new CicdManager();
      
      const config = {
        provider: 'github-actions' as const,
        targetType: 'backend-full' as const,
        projectName: '',
        productionBranch: 'main',
        domain: 'api.example.com',
        outputPath: resolve(testDir, '.github/workflows/deploy.yml'),
      };
      
      const validation = cicdManager.validateConfig(config);
      
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('nombre del proyecto');
    });
    
    it('debe rechazar configuración con productionBranch vacía', () => {
      const cicdManager = new CicdManager();
      
      const config = {
        provider: 'github-actions' as const,
        targetType: 'backend-full' as const,
        projectName: 'myapi',
        productionBranch: '',
        domain: 'api.example.com',
        outputPath: resolve(testDir, '.github/workflows/deploy.yml'),
      };
      
      const validation = cicdManager.validateConfig(config);
      
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('rama de producción');
    });
    
    it('debe rechazar configuración con domain vacío', () => {
      const cicdManager = new CicdManager();
      
      const config = {
        provider: 'github-actions' as const,
        targetType: 'backend-full' as const,
        projectName: 'myapi',
        productionBranch: 'main',
        domain: '',
        outputPath: resolve(testDir, '.github/workflows/deploy.yml'),
      };
      
      const validation = cicdManager.validateConfig(config);
      
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('dominio');
    });
  });

  describe('Output path correctness', () => {
    it('debe usar .github/workflows/deploy.yml para GitHub Actions', async () => {
      const cicdManager = new CicdManager();
      const outputPath = resolve(testDir, '.github/workflows/deploy.yml');
      
      const config = {
        provider: 'github-actions' as const,
        targetType: 'backend-full' as const,
        projectName: 'myapi',
        productionBranch: 'main',
        domain: 'api.example.com',
        outputPath,
      };
      
      const result = await cicdManager.generate(config);
      
      expect(result.success).toBe(true);
      expect(result.filePath).toBe(outputPath);
      expect(result.filePath).toContain('.github/workflows/deploy.yml');
    });
    
    it('debe usar .gitlab-ci.yml para GitLab CI', async () => {
      const cicdManager = new CicdManager();
      const outputPath = resolve(testDir, '.gitlab-ci.yml');
      
      const config = {
        provider: 'gitlab-ci' as const,
        targetType: 'backend-full' as const,
        projectName: 'myapi',
        productionBranch: 'main',
        domain: 'api.example.com',
        outputPath,
      };
      
      const result = await cicdManager.generate(config);
      
      expect(result.success).toBe(true);
      expect(result.filePath).toBe(outputPath);
      expect(result.filePath).toContain('.gitlab-ci.yml');
    });
  });
});
