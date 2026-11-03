/**
 * Tests del hand-off de `fractal new` (FRA-85, AC-11).
 * Verifica los mensajes finales en camino local-only y con infraestructura.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import chalk from 'chalk';
import { printHandoff } from './new.js';
import type { ValidatedNewParams } from '../types/new-command.js';
import type { NewWizardParams } from '../types/new-command.js';

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
      const output = captureConsoleLog(() => {
        const params: ValidatedNewParams = {
          projectName: 'test-app',
          targetDir: '/tmp/test-app',
          topology: 'monolith',
          target: 'default',
        };
        const wizard = null;
        const createdRepos: any[] = [];
        const secretsSet: string[] = [];
        const secretsPrinted: string[] = [];
        
        printHandoff(params, wizard, createdRepos, secretsSet, secretsPrinted);
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
        const params: ValidatedNewParams = {
          projectName: 'local-project',
          targetDir: '/tmp/local-project',
          topology: 'monolith',
          target: 'default',
        };
        const wizard: NewWizardParams = {
          projectName: 'local-project',
          topology: 'monolith',
          serverIp: '', // vacío = local-only
          domain: '', // vacío = local-only
          email: '',
          sshUser: 'root',
          authMethod: 'key',
          dnsProvider: 'manual',
          productionBranch: 'main',
          githubRepo: 'local-project',
          githubVisibility: 'private',
          dbPassword: '',
          dbPasswordGenerated: false,
          chainDeploy: false,
        };
        
        const createdRepos: any[] = [];
        const secretsSet: string[] = [];
        const secretsPrinted: string[] = [];
        
        printHandoff(params, wizard, createdRepos, secretsSet, secretsPrinted);
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
        const params: ValidatedNewParams = {
          projectName: 'prod-app',
          targetDir: '/tmp/prod-app',
          topology: 'monolith',
          target: 'default',
        };
        const wizard: NewWizardParams = {
          projectName: 'prod-app',
          topology: 'monolith',
          serverIp: '192.168.1.100',
          domain: 'prod.example.com',
          email: 'admin@example.com',
          sshUser: 'root',
          authMethod: 'key',
          dnsProvider: 'manual',
          productionBranch: 'main',
          githubRepo: 'prod-app',
          githubVisibility: 'private',
          dbPassword: 'secret123',
          dbPasswordGenerated: true,
          chainDeploy: false,
        };
        
        const createdRepos: any[] = [];
        const secretsSet: string[] = [];
        const secretsPrinted: string[] = [];
        
        printHandoff(params, wizard, createdRepos, secretsSet, secretsPrinted);
      });

      expect(output).toMatchInlineSnapshot(`
        [
          "
        Próximos pasos:",
          "  cd prod-app",
          "  fractal deploy",
          "
          El .env local NO se sube al VPS (FRA-76): DB_PASSWORD vive en /home/deploy/.env.",
          "  Se generó una DB_PASSWORD; quedó como secret de GitHub (no se commitea).",
          "  SSH_KNOWN_HOSTS: ssh-keyscan -t ed25519,rsa,ecdsa 192.168.1.100",
          "
          Para reusar estos valores en fractal deploy --non-interactive:",
          "    export FRACTAL_DEPLOY_SERVER_IP=192.168.1.100",
          "    export FRACTAL_DEPLOY_SSH_USER=root",
          "    export FRACTAL_DEPLOY_AUTH_METHOD=key",
          "    export FRACTAL_DEPLOY_DOMAIN=prod.example.com",
          "    export FRACTAL_DEPLOY_EMAIL=admin@example.com",
          "    export FRACTAL_DEPLOY_DNS_PROVIDER=manual",
          "    export FRACTAL_DEPLOY_PRODUCTION_BRANCH=main",
          "    # DNS token, SSH password y GitHub token no se reimprimen.",
        ]
      `);
    });

    it('muestra comandos para cada repo en multirepo con infraestructura', () => {
      const output = captureConsoleLog(() => {
        const params: ValidatedNewParams = {
          projectName: 'multi-app',
          targetDir: '/tmp/multi-app',
          topology: 'multirepo',
          target: 'default',
        };
        const wizard: NewWizardParams = {
          projectName: 'multi-app',
          topology: 'multirepo',
          serverIp: '10.0.0.5',
          domain: 'multi.example.com',
          email: 'ops@example.com',
          sshUser: 'deploy',
          authMethod: 'key',
          dnsProvider: 'cloudflare',
          productionBranch: 'main',
          githubRepo: 'multi-app',
          githubVisibility: 'public',
          dbPassword: 'pass456',
          dbPasswordGenerated: false,
          chainDeploy: false,
        };
        
        const createdRepos: any[] = [];
        const secretsSet: string[] = [];
        const secretsPrinted: string[] = [];
        
        printHandoff(params, wizard, createdRepos, secretsSet, secretsPrinted);
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
          "
          El .env local NO se sube al VPS (FRA-76): DB_PASSWORD vive en /home/deploy/.env.",
          "  SSH_KNOWN_HOSTS: ssh-keyscan -t ed25519,rsa,ecdsa 10.0.0.5",
          "
          Para reusar estos valores en fractal deploy --non-interactive:",
          "    export FRACTAL_DEPLOY_SERVER_IP=10.0.0.5",
          "    export FRACTAL_DEPLOY_SSH_USER=deploy",
          "    export FRACTAL_DEPLOY_AUTH_METHOD=key",
          "    export FRACTAL_DEPLOY_DOMAIN=multi.example.com",
          "    export FRACTAL_DEPLOY_EMAIL=ops@example.com",
          "    export FRACTAL_DEPLOY_DNS_PROVIDER=cloudflare",
          "    export FRACTAL_DEPLOY_PRODUCTION_BRANCH=main",
          "    # DNS token, SSH password y GitHub token no se reimprimen.",
        ]
      `);
    });
  });

  describe('chainDeploy', () => {
    it('indica que fractal deploy se ejecutará a continuación cuando chainDeploy=true', () => {
      const output = captureConsoleLog(() => {
        const params: ValidatedNewParams = {
          projectName: 'chain-app',
          targetDir: '/tmp/chain-app',
          topology: 'monolith',
          target: 'default',
        };
        const wizard: NewWizardParams = {
          projectName: 'chain-app',
          topology: 'monolith',
          serverIp: '172.16.0.10',
          domain: 'chain.example.com',
          email: 'dev@example.com',
          sshUser: 'ubuntu',
          authMethod: 'password',
          dnsProvider: 'manual',
          productionBranch: 'main',
          githubRepo: 'chain-app',
          githubVisibility: 'private',
          dbPassword: 'secret789',
          dbPasswordGenerated: false,
          chainDeploy: true, // Encadena deploy
        };
        
        const createdRepos: any[] = [];
        const secretsSet: string[] = [];
        const secretsPrinted: string[] = [];
        
        printHandoff(params, wizard, createdRepos, secretsSet, secretsPrinted);
      });

      expect(output).toMatchInlineSnapshot(`
        [
          "
        Próximos pasos:",
          "  cd chain-app",
          "  # fractal deploy se ejecuta a continuación",
          "
          El .env local NO se sube al VPS (FRA-76): DB_PASSWORD vive en /home/deploy/.env.",
          "  SSH_KNOWN_HOSTS: ssh-keyscan -t ed25519,rsa,ecdsa 172.16.0.10",
        ]
      `);
    });
  });

  describe('multirepo local-only (FRA-85, bloqueante 1)', () => {
    it('muestra directorios correctos (-api/-web) en multirepo sin infraestructura', () => {
      const output = captureConsoleLog(() => {
        const params: ValidatedNewParams = {
          projectName: 'local-multi',
          targetDir: '/tmp/local-multi',
          topology: 'multirepo',
          target: 'default',
        };
        const wizard: NewWizardParams = {
          projectName: 'local-multi',
          topology: 'multirepo',
          serverIp: '', // local-only
          domain: '', // local-only
          email: '',
          sshUser: 'root',
          authMethod: 'key',
          dnsProvider: 'manual',
          productionBranch: 'main',
          githubRepo: 'local-multi',
          githubVisibility: 'private',
          dbPassword: '',
          dbPasswordGenerated: false,
          chainDeploy: false,
        };
        
        const createdRepos: any[] = [];
        const secretsSet: string[] = [];
        const secretsPrinted: string[] = [];
        
        printHandoff(params, wizard, createdRepos, secretsSet, secretsPrinted);
      });

      expect(output).toMatchInlineSnapshot(`
        [
          "
        Próximos pasos:",
          "  cd local-multi-api",
          "  # Configurar dependencias y correr el servidor de desarrollo",
          "  # Ver README.md para instrucciones específicas del framework",
          "",
          "  cd ../local-multi-web",
          "  # Configurar dependencias y correr el servidor de desarrollo",
          "  # Ver README.md para instrucciones específicas del framework",
          "",
          "💡 Para desplegar más adelante:",
          "  fractal deploy",
        ]
      `);
    });
  });
});
