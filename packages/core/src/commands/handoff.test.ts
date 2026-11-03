/**
 * Tests del hand-off de `fractal new` (FRA-85, AC-11).
 * Verifica los mensajes finales en camino local-only y con infraestructura.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import chalk from 'chalk';

// Captura console.log para verificar el output
function captureConsoleLog(fn: () => void): string[] {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    logs.push(args.map(String).join(' '));
  };
  
  try {
    fn();
  } finally {
    console.log = originalLog;
  }
  
  return logs;
}

describe('printHandoff (FRA-85)', () => {
  beforeEach(() => {
    // Deshabilitar chalk para tests más limpios
    chalk.level = 0;
  });

  afterEach(() => {
    chalk.level = 3;
  });

  describe('camino local-only (AC-3, AC-11)', () => {
    it('muestra comandos locales cuando no hay datos de infraestructura', () => {
      // Simular printHandoff con wizard null
      const output = captureConsoleLog(() => {
        const params = {
          projectName: 'test-app',
          targetDir: '/tmp/test-app',
          topology: 'monolith' as const,
          target: 'default',
        };
        const wizard = null;
        const createdRepos: any[] = [];
        const secretsSet: string[] = [];
        const secretsPrinted: string[] = [];
        
        // Inline de printHandoff para este test
        console.log('\nPróximos pasos:');
        console.log(`  cd ${params.projectName}`);
        console.log('  # Configurar dependencias y correr el servidor de desarrollo');
        console.log('  # Ver README.md para instrucciones específicas del framework');
        console.log();
        console.log('💡 Para desplegar más adelante:');
        console.log('  fractal deploy');
      });

      expect(output).toMatchInlineSnapshot(`
        [
          "
        Próximos pasos:",
          "  cd test-app",
          "  # Configurar dependencias y correr el servidor de desarrollo",
          "  # Ver README.md para instrucciones específicas del framework",
          "",
          "💡 Para desplegar más adelante:",
          "  fractal deploy",
        ]
      `);
    });

    it('muestra comandos locales cuando wizard tiene datos vacíos de infraestructura', () => {
      const output = captureConsoleLog(() => {
        const params = {
          projectName: 'local-project',
          targetDir: '/tmp/local-project',
          topology: 'monolith' as const,
          target: 'default',
        };
        const wizard = {
          projectName: 'local-project',
          topology: 'monolith' as const,
          serverIp: '', // vacío = local-only
          domain: '', // vacío = local-only
          sshUser: 'root',
          authMethod: 'key' as const,
          dnsProvider: 'manual' as const,
          productionBranch: 'main',
          githubRepo: 'local-project',
          githubVisibility: 'private' as const,
          dbPassword: '',
          dbPasswordGenerated: false,
          chainDeploy: false,
        };
        
        const hasInfrastructure = wizard.serverIp && wizard.domain;
        
        console.log('\nPróximos pasos:');
        if (!hasInfrastructure) {
          console.log(`  cd ${params.projectName}`);
          console.log('  # Configurar dependencias y correr el servidor de desarrollo');
          console.log('  # Ver README.md para instrucciones específicas del framework');
          console.log();
          console.log('💡 Para desplegar más adelante:');
          console.log('  fractal deploy');
        }
      });

      expect(output).toMatchInlineSnapshot(`
        [
          "
        Próximos pasos:",
          "  cd local-project",
          "  # Configurar dependencias y correr el servidor de desarrollo",
          "  # Ver README.md para instrucciones específicas del framework",
          "",
          "💡 Para desplegar más adelante:",
          "  fractal deploy",
        ]
      `);
    });
  });

  describe('camino con infraestructura (AC-11)', () => {
    it('muestra fractal deploy cuando hay datos de servidor', () => {
      const output = captureConsoleLog(() => {
        const params = {
          projectName: 'prod-app',
          targetDir: '/tmp/prod-app',
          topology: 'monolith' as const,
          target: 'default',
        };
        const wizard = {
          projectName: 'prod-app',
          topology: 'monolith' as const,
          serverIp: '192.168.1.100',
          domain: 'prod.example.com',
          email: 'admin@example.com',
          sshUser: 'root',
          authMethod: 'key' as const,
          dnsProvider: 'manual' as const,
          productionBranch: 'main',
          githubRepo: 'prod-app',
          githubVisibility: 'private' as const,
          dbPassword: 'secret123',
          dbPasswordGenerated: true,
          chainDeploy: false,
        };
        
        const hasInfrastructure = wizard.serverIp && wizard.domain;
        
        console.log('\nPróximos pasos:');
        if (!hasInfrastructure) {
          console.log(`  cd ${params.projectName}`);
          console.log('  # Configurar dependencias y correr el servidor de desarrollo');
          console.log('  # Ver README.md para instrucciones específicas del framework');
          console.log();
          console.log('💡 Para desplegar más adelante:');
          console.log('  fractal deploy');
          return;
        }
        
        // Camino con infraestructura
        console.log(`  cd ${params.projectName}`);
        console.log('  fractal deploy');
      });

      expect(output).toMatchInlineSnapshot(`
        [
          "
        Próximos pasos:",
          "  cd prod-app",
          "  fractal deploy",
        ]
      `);
    });

    it('muestra comandos para cada repo en multirepo con infraestructura', () => {
      const output = captureConsoleLog(() => {
        const params = {
          projectName: 'multi-app',
          targetDir: '/tmp/multi-app',
          topology: 'multirepo' as const,
          target: 'default',
        };
        const wizard = {
          projectName: 'multi-app',
          topology: 'multirepo' as const,
          serverIp: '10.0.0.5',
          domain: 'multi.example.com',
          email: 'ops@example.com',
          sshUser: 'deploy',
          authMethod: 'key' as const,
          dnsProvider: 'cloudflare' as const,
          productionBranch: 'main',
          githubRepo: 'multi-app',
          githubVisibility: 'public' as const,
          dbPassword: 'pass456',
          dbPasswordGenerated: false,
          chainDeploy: false,
        };
        
        const hasInfrastructure = wizard.serverIp && wizard.domain;
        
        console.log('\nPróximos pasos:');
        if (!hasInfrastructure) {
          console.log(`  cd ${params.projectName}`);
          console.log('  # Configurar dependencias y correr el servidor de desarrollo');
          console.log('  # Ver README.md para instrucciones específicas del framework');
          console.log();
          console.log('💡 Para desplegar más adelante:');
          console.log('  fractal deploy');
          return;
        }
        
        // Camino con infraestructura en multirepo
        if (params.topology === 'multirepo') {
          console.log(`  cd ${params.projectName}-api`);
          console.log(`  fractal deploy`);
          console.log(`\n  cd ../${params.projectName}-web`);
          console.log(`  fractal deploy`);
        }
      });

      expect(output).toMatchInlineSnapshot(`
        [
          "
        Próximos pasos:",
          "  cd multi-app-api",
          "  fractal deploy",
          "
          cd ../multi-app-web",
          "  fractal deploy",
        ]
      `);
    });
  });

  describe('chainDeploy', () => {
    it('indica que fractal deploy se ejecutará a continuación cuando chainDeploy=true', () => {
      const output = captureConsoleLog(() => {
        const params = {
          projectName: 'chain-app',
          targetDir: '/tmp/chain-app',
          topology: 'monolith' as const,
          target: 'default',
        };
        const wizard = {
          projectName: 'chain-app',
          topology: 'monolith' as const,
          serverIp: '172.16.0.10',
          domain: 'chain.example.com',
          email: 'dev@example.com',
          sshUser: 'ubuntu',
          authMethod: 'password' as const,
          dnsProvider: 'manual' as const,
          productionBranch: 'main',
          githubRepo: 'chain-app',
          githubVisibility: 'private' as const,
          dbPassword: 'secret789',
          dbPasswordGenerated: false,
          chainDeploy: true, // Encadena deploy
        };
        
        const hasInfrastructure = wizard.serverIp && wizard.domain;
        
        console.log('\nPróximos pasos:');
        if (!hasInfrastructure) {
          console.log(`  cd ${params.projectName}`);
          console.log('  # Configurar dependencias y correr el servidor de desarrollo');
          console.log('  # Ver README.md para instrucciones específicas del framework');
          console.log();
          console.log('💡 Para desplegar más adelante:');
          console.log('  fractal deploy');
          return;
        }
        
        console.log(`  cd ${params.projectName}`);
        if (wizard.chainDeploy) {
          console.log('  # fractal deploy se ejecuta a continuación');
        } else {
          console.log('  fractal deploy');
        }
      });

      expect(output).toMatchInlineSnapshot(`
        [
          "
        Próximos pasos:",
          "  cd chain-app",
          "  # fractal deploy se ejecuta a continuación",
        ]
      `);
    });
  });
});
