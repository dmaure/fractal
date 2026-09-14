/**
 * Ejemplo de uso de los generadores de CI/CD.
 * 
 * Este archivo no se ejecuta en tests, solo demuestra cómo usar el módulo.
 */

import { CicdManager } from '../src/cicd/cicd-manager.js';
import type { DeployConfig } from '../src/cicd/types.js';

// Ejemplo 1: Generar workflow de GitHub Actions para un backend completo
function exampleGitHubActionsBackend() {
  const manager = new CicdManager();
  
  const config: DeployConfig = {
    provider: 'github-actions',
    targetType: 'backend-full',
    projectName: 'myapi',
    productionBranch: 'production',
    domain: 'api.example.com',
    outputPath: '.github/workflows/deploy.yml',
  };

  const result = manager.generate(config);

  if (result.success) {
    console.log('✓ Workflow generado:', result.filePath);
    console.log('\nSecrets requeridos:');
    result.secrets.forEach((secret) => {
      console.log(`  - ${secret.name}: ${secret.description}`);
    });
  }
}

// Ejemplo 2: Generar pipeline de GitLab CI para un frontend
function exampleGitLabCiFrontend() {
  const manager = new CicdManager();
  
  const config: DeployConfig = {
    provider: 'gitlab-ci',
    targetType: 'frontend-static',
    projectName: 'myweb',
    productionBranch: 'main',
    domain: 'app.example.com',
    outputPath: '.gitlab-ci.yml',
  };

  const result = manager.generate(config);

  if (result.success) {
    console.log('✓ Pipeline generado:', result.filePath);
    console.log('\nCI/CD Variables requeridas:');
    result.secrets.forEach((secret) => {
      console.log(`  - ${secret.name}: ${secret.description}`);
    });
  }
}

// Ejemplo 3: Configuración multirepo (API)
function exampleMultiRepoApi() {
  const manager = new CicdManager();
  
  const config: DeployConfig = {
    provider: 'github-actions',
    targetType: 'backend-full',
    projectName: 'myapi',
    productionBranch: 'production',
    domain: 'api.example.com',
    outputPath: '.github/workflows/deploy.yml',
    multiRepo: {
      role: 'api',
      siblingGitUrl: 'https://github.com/example/web.git',
      siblingDomain: 'app.example.com',
    },
  };

  const result = manager.generate(config);

  if (result.success) {
    console.log('✓ Workflow generado para API');
    console.log('\nSecrets para este repo (api/):');
    result.secrets.forEach((secret) => {
      if (!secret.crossRepo) {
        console.log(`  - ${secret.name}: ${secret.description}`);
      }
    });
    
    if (result.crossRepoSecrets && result.crossRepoSecrets.length > 0) {
      console.log('\nSecrets que deben cargarse en el repo hermano (web/):');
      result.crossRepoSecrets.forEach((secret) => {
        console.log(`  - ${secret.name}: ${secret.description}`);
        console.log(`    Target: ${secret.targetRepo}`);
      });
    }
  }
}

// Ejemplo 4: Validación de configuración
function exampleValidation() {
  const manager = new CicdManager();
  
  const config: DeployConfig = {
    provider: 'github-actions',
    targetType: 'backend-full',
    projectName: '',  // Inválido
    productionBranch: 'production',
    domain: 'api.example.com',
    outputPath: '.github/workflows/deploy.yml',
  };

  const validation = manager.validateConfig(config);
  
  if (!validation.valid) {
    console.error('✗ Configuración inválida:', validation.error);
  }
}

// Ejemplo 5: Listar proveedores soportados
function exampleListProviders() {
  const manager = new CicdManager();
  const providers = manager.getSupportedProviders();
  
  console.log('Proveedores de CI/CD soportados:');
  providers.forEach((provider) => {
    console.log(`  - ${provider}`);
  });
}

// Ejecutar ejemplos
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('=== Ejemplo 1: GitHub Actions Backend ===\n');
  exampleGitHubActionsBackend();
  
  console.log('\n\n=== Ejemplo 2: GitLab CI Frontend ===\n');
  exampleGitLabCiFrontend();
  
  console.log('\n\n=== Ejemplo 3: Multirepo API ===\n');
  exampleMultiRepoApi();
  
  console.log('\n\n=== Ejemplo 4: Validación ===\n');
  exampleValidation();
  
  console.log('\n\n=== Ejemplo 5: Proveedores ===\n');
  exampleListProviders();
}
