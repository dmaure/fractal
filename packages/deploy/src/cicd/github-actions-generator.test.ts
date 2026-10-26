import { describe, it, expect } from 'vitest';
import { GitHubActionsGenerator } from './github-actions-generator.js';
import { buildDeploySudoers } from '../hardening/sudoers.js';
import type { DeployConfig } from './types.js';
import type { DeployRuntime } from '@fractal/core';

/**
 * Runtimes equivalentes a los que declara el adapter Laravel (FRA-51).
 * Los comandos del workflow se derivan de estos runtimes, no se hardcodean.
 */
const BACKEND_RUNTIME: DeployRuntime = {
  services: ['app', 'nginx', 'db', 'redis', 'worker', 'scheduler'],
  buildCommand: 'composer install --no-dev --optimize-autoloader',
  migrateCommand: 'php artisan migrate --force',
  postDeployCommands: [
    'php artisan config:clear',
    'php artisan route:clear',
    'php artisan view:clear',
    'php artisan cache:clear',
  ],
  port: 8000,
  healthcheck: { path: '/api/health' },
};

const FRONTEND_RUNTIME: DeployRuntime = {
  services: ['nginx'],
  buildCommand: 'npm run build',
  port: 80,
  healthcheck: { path: '/health.txt' },
};

describe('GitHubActionsGenerator', () => {
  const generator = new GitHubActionsGenerator();

  describe('validateConfig', () => {
    it('should validate a correct backend-full config', () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        runtime: BACKEND_RUNTIME,
        projectName: 'test-api',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/.github/workflows/deploy.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate a correct frontend-static config', () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'frontend-static',
        runtime: FRONTEND_RUNTIME,
        projectName: 'test-web',
        productionBranch: 'main',
        domain: 'app.example.com',
        outputPath: '/tmp/.github/workflows/deploy.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject empty project name', () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        runtime: BACKEND_RUNTIME,
        projectName: '',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/.github/workflows/deploy.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('nombre del proyecto');
    });

    it('should reject empty production branch', () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        runtime: BACKEND_RUNTIME,
        projectName: 'test-api',
        productionBranch: '',
        domain: 'api.example.com',
        outputPath: '/tmp/.github/workflows/deploy.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('rama de producción');
    });

    it('should reject empty domain', () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        runtime: BACKEND_RUNTIME,
        projectName: 'test-api',
        productionBranch: 'production',
        domain: '',
        outputPath: '/tmp/.github/workflows/deploy.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('dominio');
    });

    it('should reject invalid target type', () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'invalid' as any,
        runtime: BACKEND_RUNTIME,
        projectName: 'test-api',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/.github/workflows/deploy.yml',
      };

      const result = generator.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Tipo de target inválido');
    });
  });

  describe('commands derived from runtime (FRA-51)', () => {
    it('should emit migrate and post-deploy commands from the backend runtime', () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        runtime: BACKEND_RUNTIME,
        projectName: 'myapi',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-github-derived-backend.yml',
      };

      const content = generator.generateWorkflowContent(config);

      // migrateCommand del runtime
      expect(content).toContain('docker compose exec -T app php artisan migrate --force');
      // postDeployCommands del runtime
      expect(content).toContain('docker compose exec -T app php artisan config:clear');
      expect(content).toContain('docker compose exec -T app php artisan cache:clear');
      // healthcheck.path del runtime
      expect(content).toContain('https://api.example.com/api/health');
    });

    it('should omit migrate and post-deploy commands for a runtime without them', () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'frontend-static',
        runtime: FRONTEND_RUNTIME,
        projectName: 'myweb',
        productionBranch: 'main',
        domain: 'app.example.com',
        outputPath: '/tmp/test-github-derived-frontend.yml',
      };

      const content = generator.generateWorkflowContent(config);

      expect(content).not.toContain('migrate');
      expect(content).not.toContain('Comandos post-deploy');
      // healthcheck.path del runtime frontend
      expect(content).toContain('https://app.example.com/health.txt');
    });

    it('should honor a custom runtime (agnostic, non-Laravel)', () => {
      const customRuntime: DeployRuntime = {
        services: ['app', 'nginx'],
        buildCommand: 'make build',
        migrateCommand: 'bin/migrate',
        postDeployCommands: ['bin/warm-cache'],
        port: 3000,
        healthcheck: { path: '/status' },
      };
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        runtime: customRuntime,
        projectName: 'custom',
        productionBranch: 'production',
        domain: 'custom.example.com',
        outputPath: '/tmp/test-github-derived-custom.yml',
      };

      const content = generator.generateWorkflowContent(config);

      expect(content).toContain('docker compose exec -T app bin/migrate');
      expect(content).toContain('docker compose exec -T app bin/warm-cache');
      expect(content).toContain('https://custom.example.com/status');
    });
  });

  describe('generate - backend-full', () => {
    it('should generate workflow for backend-full', async () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        runtime: BACKEND_RUNTIME,
        projectName: 'myapi',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-github-actions-backend.yml',
      };

      const result = await generator.generate(config);

      expect(result.success).toBe(true);
      expect(result.filePath).toBe('/tmp/test-github-actions-backend.yml');
      expect(result.content).toBeDefined();
      expect(result.content).toContain('Deploy to Production');
      expect(result.secrets).toBeDefined();
      expect(result.secrets.length).toBeGreaterThan(0);
    });

    it('should include required secrets for backend-full', async () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        runtime: BACKEND_RUNTIME,
        projectName: 'myapi',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-github-actions-secrets.yml',
      };

      const result = await generator.generate(config);

      const secretNames = result.secrets.map((s) => s.name);
      expect(secretNames).toContain('SSH_HOST');
      expect(secretNames).toContain('SSH_USER');
      expect(secretNames).toContain('SSH_PRIVATE_KEY');
      expect(secretNames).toContain('SSH_KNOWN_HOSTS');
      expect(secretNames).toContain('DOCKER_REGISTRY_USER');
      expect(secretNames).toContain('DOCKER_REGISTRY_TOKEN');
      expect(secretNames).toContain('DB_PASSWORD');
      expect(secretNames).toContain('APP_KEY');
    });

    it('should not include DB secrets for frontend-static', async () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'frontend-static',
        runtime: FRONTEND_RUNTIME,
        projectName: 'myweb',
        productionBranch: 'main',
        domain: 'app.example.com',
        outputPath: '/tmp/test-github-actions-frontend.yml',
      };

      const result = await generator.generate(config);

      const secretNames = result.secrets.map((s) => s.name);
      expect(secretNames).not.toContain('DB_PASSWORD');
      expect(secretNames).not.toContain('APP_KEY');
      expect(secretNames).toContain('SSH_KNOWN_HOSTS');
    });
  });

  describe('multirepo support (ADR-0012)', () => {
    it('should include API_URL secret for web role', async () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'frontend-static',
        runtime: FRONTEND_RUNTIME,
        projectName: 'myweb',
        productionBranch: 'main',
        domain: 'app.example.com',
        outputPath: '/tmp/test-github-actions-multirepo-web.yml',
        multiRepo: {
          role: 'web',
          siblingGitUrl: 'https://github.com/example/api.git',
          siblingDomain: 'api.example.com',
        },
      };

      const result = await generator.generate(config);

      const secretNames = result.secrets.map((s) => s.name);
      expect(secretNames).toContain('API_URL');
    });

    it('should include CORS secrets for api role', async () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        runtime: BACKEND_RUNTIME,
        projectName: 'myapi',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-github-actions-multirepo-api.yml',
        multiRepo: {
          role: 'api',
          siblingGitUrl: 'https://github.com/example/web.git',
          siblingDomain: 'app.example.com',
        },
      };

      const result = await generator.generate(config);

      const secretNames = result.secrets.map((s) => s.name);
      expect(secretNames).toContain('CORS_ALLOWED_ORIGIN');
      expect(secretNames).toContain('SANCTUM_STATEFUL_DOMAINS');
    });

    it('should generate cross-repo secrets for api role', async () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'backend-full',
        runtime: BACKEND_RUNTIME,
        projectName: 'myapi',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-github-actions-cross-api.yml',
        multiRepo: {
          role: 'api',
          siblingGitUrl: 'https://github.com/example/web.git',
          siblingDomain: 'app.example.com',
        },
      };

      const result = await generator.generate(config);

      expect(result.crossRepoSecrets).toBeDefined();
      expect(result.crossRepoSecrets!.length).toBeGreaterThan(0);

      const crossSecret = result.crossRepoSecrets!.find((s) => s.name === 'API_URL');
      expect(crossSecret).toBeDefined();
      expect(crossSecret!.crossRepo).toBe(true);
      expect(crossSecret!.targetRepo).toBe('https://github.com/example/web.git');
      expect(crossSecret!.description).toContain('api.example.com');
    });

    it('should generate cross-repo secrets for web role', async () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'frontend-static',
        runtime: FRONTEND_RUNTIME,
        projectName: 'myweb',
        productionBranch: 'main',
        domain: 'app.example.com',
        outputPath: '/tmp/test-github-actions-cross-web.yml',
        multiRepo: {
          role: 'web',
          siblingGitUrl: 'https://github.com/example/api.git',
          siblingDomain: 'api.example.com',
        },
      };

      const result = await generator.generate(config);

      expect(result.crossRepoSecrets).toBeDefined();

      const crossSecretNames = result.crossRepoSecrets!.map((s) => s.name);
      expect(crossSecretNames).toContain('CORS_ALLOWED_ORIGIN');
      expect(crossSecretNames).toContain('SANCTUM_STATEFUL_DOMAINS');
    });
  });

  describe('framework-agnostic compliance', () => {
    it('should not contain Laravel-specific terms in result', async () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'frontend-static',
        runtime: FRONTEND_RUNTIME,
        projectName: 'test',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-github-actions-compliance-1.yml',
      };

      const result = await generator.generate(config);

      const prohibitedTerms = [
        'laravel',
        'eloquent',
        'blade',
      ];

      // Check secrets and content, not filePath (which is just a test artifact)
      const checkContent = JSON.stringify({ secrets: result.secrets, content: result.content }).toLowerCase();

      prohibitedTerms.forEach((term) => {
        expect(checkContent).not.toContain(term);
      });
    });

    it('should not contain Rails-specific terms in result', async () => {
      const config: DeployConfig = {
        provider: 'github-actions',
        targetType: 'frontend-static',
        runtime: FRONTEND_RUNTIME,
        projectName: 'test',
        productionBranch: 'production',
        domain: 'api.example.com',
        outputPath: '/tmp/test-github-actions-compliance-2.yml',
      };

      const result = await generator.generate(config);

      const prohibitedTerms = [
        'rails',
        'activerecord',
        'gemfile',
        'bundler',
        'erb',
      ];

      // Check secrets and content, not filePath (which is just a test artifact)
      const checkContent = JSON.stringify({ secrets: result.secrets, content: result.content }).toLowerCase();

      prohibitedTerms.forEach((term) => {
        expect(checkContent).not.toContain(term);
      });
    });
  });

  describe('redeploy workflow (FRA-72)', () => {
    const backendConfig: DeployConfig = {
      provider: 'github-actions',
      targetType: 'backend-full',
      runtime: BACKEND_RUNTIME,
      projectName: 'myapi',
      productionBranch: 'production',
      domain: 'api.example.com',
      outputPath: '/tmp/test-github-fra72.yml',
    };

    it('deploys into the provisioning directory /home/deploy, not /var/www', () => {
      const content = generator.generateWorkflowContent(backendConfig);
      expect(content).toContain('cd /home/deploy');
      expect(content).not.toContain('cd /var/www/');
    });

    it('injects the registry and image tag so the server pulls the published image', () => {
      const content = generator.generateWorkflowContent(backendConfig);
      expect(content).toContain("DOCKER_REGISTRY='ghcr.io/${{ github.repository }}'");
      expect(content).toContain("IMAGE_TAG='${{ github.sha }}'");
      expect(content).toContain('docker compose pull');
    });

    it('uses a quoted heredoc so server-side variables are not expanded on the runner', () => {
      const content = generator.generateWorkflowContent(backendConfig);
      expect(content).toContain("bash -s\" << 'ENDSSH'");
    });
  });

  describe('ghcr.io login on the server before pull (FRA-76)', () => {
    const backendConfig: DeployConfig = {
      provider: 'github-actions',
      targetType: 'backend-full',
      runtime: BACKEND_RUNTIME,
      projectName: 'myapi',
      productionBranch: 'production',
      domain: 'api.example.com',
      outputPath: '/tmp/test-github-fra76.yml',
    };

    it('sets the registry credentials (DOCKER_REGISTRY_USER/TOKEN, not GITHUB_TOKEN) inside the heredoc body', () => {
      const content = generator.generateWorkflowContent(backendConfig);
      // Reutiliza las credenciales que publican la imagen: tienen pull
      // garantizado del paquete privado, a diferencia de GITHUB_TOKEN.
      expect(content).toContain("GHCR_USERNAME='${{ secrets.DOCKER_REGISTRY_USER }}'");
      expect(content).toContain("GHCR_TOKEN='${{ secrets.DOCKER_REGISTRY_TOKEN }}'");
      expect(content).not.toContain("GHCR_USERNAME='${{ github.actor }}'");
      expect(content).not.toContain("GHCR_TOKEN='${{ secrets.GITHUB_TOKEN }}'");

      // Las asignaciones viven DENTRO del cuerpo del heredoc (después de
      // "bash -s"), no en el argv del comando SSH remoto.
      const bashS = content.indexOf('bash -s');
      expect(bashS).toBeGreaterThanOrEqual(0);
      expect(content.indexOf("GHCR_USERNAME='${{ secrets.DOCKER_REGISTRY_USER }}'")).toBeGreaterThan(
        bashS
      );
      expect(content.indexOf("GHCR_TOKEN='${{ secrets.DOCKER_REGISTRY_TOKEN }}'")).toBeGreaterThan(
        bashS
      );
    });

    it('never puts the registry token in the SSH remote-command argv (not before bash -s)', () => {
      const content = generator.generateWorkflowContent(backendConfig);
      // El argv del comando SSH remoto es todo lo que precede a "bash -s".
      // El token expandido (y su nombre de variable) no debe aparecer ahí:
      // quedaría visible en ps/proc y en los logs de sshd del runner y del VPS.
      const argv = content.slice(0, content.indexOf('bash -s'));
      expect(argv).not.toContain('GHCR_TOKEN');
      expect(argv).not.toContain('GHCR_USERNAME');
    });

    it('runs docker login ghcr.io BEFORE docker compose pull in the server block', () => {
      const content = generator.generateWorkflowContent(backendConfig);

      const loginCmd =
        'echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin';
      expect(content).toContain(loginCmd);

      // El primer login ghcr.io ocurre antes del primer docker compose pull.
      const firstLogin = content.indexOf('docker login ghcr.io');
      const firstPull = content.indexOf('docker compose pull');
      expect(firstLogin).toBeGreaterThanOrEqual(0);
      expect(firstPull).toBeGreaterThanOrEqual(0);
      expect(firstLogin).toBeLessThan(firstPull);
    });

    it('logs in again before the rollback pull', () => {
      const content = generator.generateWorkflowContent(backendConfig);
      // Dos logins: deploy normal + rollback.
      const logins = content.split('docker login ghcr.io').length - 1;
      expect(logins).toBe(2);
    });

    it('passes the token via --password-stdin, not on the command line', () => {
      const content = generator.generateWorkflowContent(backendConfig);
      expect(content).toContain('--password-stdin');
      // El token no se pasa como argumento -p que quedaría en el historial.
      expect(content).not.toContain('docker login ghcr.io -u "$GHCR_USERNAME" -p');
    });

    it('removes the token on every exit path via a trap EXIT set before login', () => {
      const content = generator.generateWorkflowContent(backendConfig);
      // El logout ya no es un paso lineal: un trap EXIT garantiza el logout
      // incluso si el pull/up/healthcheck falla con set -e, para no dejar el
      // token en ~/.docker/config.json.
      const trap = "trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT";
      expect(content).toContain(trap);

      // El trap se setea ANTES del login (de la sesión SSH), para cubrir todo
      // camino de salida desde el momento en que existe la credencial.
      const trapIdx = content.indexOf(trap);
      const firstLogin = content.indexOf('docker login ghcr.io');
      expect(trapIdx).toBeGreaterThanOrEqual(0);
      expect(firstLogin).toBeGreaterThanOrEqual(0);
      expect(trapIdx).toBeLessThan(firstLogin);
    });
  });

  /**
   * Regresión de acoplamiento (FRA-75): el drop-in de sudoers es una allowlist
   * por coincidencia EXACTA de comando. Si el workflow de redeploy FRA-72
   * empieza a usar un `sudo` que la allowlist no cubre, el deploy fallaría en
   * producción pidiendo contraseña. Este test extrae cada invocación `sudo` del
   * workflow generado y afirma que está cubierta por el alias FRACTAL_STATE del
   * drop-in. Falla tanto si el workflow agrega un `sudo` nuevo fuera de la
   * allowlist como si el alias deja de cubrir uno existente.
   */
  describe('redeploy sudo stays within the sudoers allowlist (FRA-75)', () => {
    const backendConfig: DeployConfig = {
      provider: 'github-actions',
      targetType: 'backend-full',
      runtime: BACKEND_RUNTIME,
      projectName: 'myapi',
      productionBranch: 'production',
      domain: 'api.example.com',
      outputPath: '/tmp/test-github-fra75-sudo.yml',
    };

    /**
     * Comandos que el alias FRACTAL_STATE autoriza, derivados del propio
     * generador del drop-in (no hardcodeados), sin el prefijo `/usr/bin/`:
     * sudo resuelve el binario a su ruta absoluta, así que el `sudo cat ...`
     * del workflow matchea la entrada `/usr/bin/cat ...` del alias.
     */
    function allowedStateCommands(): string[] {
      const sudoers = buildDeploySudoers('deploy');
      // El bloque del alias va desde `FRACTAL_STATE =` hasta la línea en blanco.
      const block = sudoers.match(/Cmnd_Alias FRACTAL_STATE =([\s\S]*?)\n\n/);
      if (!block) {
        throw new Error('No se encontró el alias FRACTAL_STATE en el drop-in de sudoers');
      }
      return block[1]
        .split(',')
        .map((entry) => entry.replace(/\\/g, '').trim())
        .filter(Boolean)
        .map((cmd) => cmd.replace(/^\/usr\/bin\//, ''));
    }

    /**
     * Extrae cada invocación `sudo <cmd>` del workflow, resolviendo las
     * expansiones de shell conocidas ($STATE_FILE y $(dirname $STATE_FILE)) a
     * sus rutas literales. El comando termina en pipe, redirección, cierre de
     * subshell, `;`, `&` o fin de línea. Robusto a espacios en blanco.
     */
    function extractSudoCommands(content: string): string[] {
      const resolved = content
        .replace(/\$\(dirname \$STATE_FILE\)/g, '/etc/fractal')
        .replace(/\$STATE_FILE/g, '/etc/fractal/state.json');
      const commands: string[] = [];
      const re = /\bsudo\s+([^\n|>);&]+)/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(resolved)) !== null) {
        commands.push(match[1].trim());
      }
      return commands;
    }

    it('every sudo invocation in the generated workflow is covered by FRACTAL_STATE', () => {
      const content = generator.generateWorkflowContent(backendConfig);
      const sudoCommands = extractSudoCommands(content);
      const allowed = allowedStateCommands();

      // Sanity: el workflow realmente usa sudo (si no, el test no protege nada).
      expect(sudoCommands.length).toBeGreaterThan(0);

      for (const cmd of sudoCommands) {
        expect(
          allowed,
          `El workflow de redeploy usa "sudo ${cmd}", que NO está en la allowlist ` +
            `de sudoers (alias FRACTAL_STATE: ${allowed.join(', ')}). ` +
            `Agregá el comando al drop-in en packages/deploy/src/hardening/sudoers.ts.`
        ).toContain(cmd);
      }
    });
  });
});
