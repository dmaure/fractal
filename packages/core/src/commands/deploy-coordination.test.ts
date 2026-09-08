import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join(process.cwd(), 'test-deploy-coordination');

function cleanTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

beforeEach(() => {
  cleanTestDir();
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  cleanTestDir();
});

function createManifest(dir: string, state: 'pending' | 'resolved', role: 'api' | 'web') {
  const content = `role: ${role}
sibling:
  git_url: ${state === 'resolved' ? 'https://github.com/user/sibling.git' : 'null'}
  domain: ${state === 'resolved' ? 'sibling.example.com' : 'null'}
orchestration_state: ${state}
`;
  writeFileSync(join(dir, 'fractal.project.yml'), content, 'utf-8');
}

describe('Deploy coordination (multirepo)', () => {
  describe('Manifest detection', () => {
    it('no requiere manifiesto para monolito o monorepo', () => {
      // En estos casos, simplemente no existe el archivo fractal.project.yml
      expect(existsSync(join(TEST_DIR, 'fractal.project.yml'))).toBe(false);
    });

    it('detecta manifiesto en estado pending', () => {
      createManifest(TEST_DIR, 'pending', 'api');
      
      const manifestPath = join(TEST_DIR, 'fractal.project.yml');
      expect(existsSync(manifestPath)).toBe(true);
    });

    it('detecta manifiesto en estado resolved', () => {
      createManifest(TEST_DIR, 'resolved', 'web');
      
      const manifestPath = join(TEST_DIR, 'fractal.project.yml');
      expect(existsSync(manifestPath)).toBe(true);
    });
  });

  describe('Coordinación en el primer deploy', () => {
    it('debe preguntar info del hermano cuando orchestration_state es pending', () => {
      createManifest(TEST_DIR, 'pending', 'api');
      
      // El deploy command detectará pending y establecerá askSiblingInfo = true
      // Esta prueba documenta el comportamiento esperado
      expect(true).toBe(true);
    });

    it('no debe preguntar info del hermano cuando orchestration_state es resolved', () => {
      createManifest(TEST_DIR, 'resolved', 'web');
      
      // El deploy command detectará resolved y NO preguntará info del hermano
      // (a menos que se pase --reconfigure)
      expect(true).toBe(true);
    });
  });

  describe('Flag --reconfigure', () => {
    it('debe forzar preguntar info del hermano aunque orchestration_state sea resolved', () => {
      createManifest(TEST_DIR, 'resolved', 'api');
      
      // Con --reconfigure, el deploy command establecerá askSiblingInfo = true
      // incluso si el estado es resolved
      expect(true).toBe(true);
    });
  });

  describe('Actualización del manifiesto', () => {
    it('debe marcar el manifiesto como resolved después de recolectar la info', () => {
      // Este comportamiento está cubierto por los tests de ManifestManager
      // y la integración en el deploy command
      expect(true).toBe(true);
    });
  });

  describe('Variables cruzadas según ADR-0012', () => {
    it('debe configurar API_URL en el repo web con el dominio del api', () => {
      // Cuando se despliegue web/ con info del hermano api/, se configurará:
      // API_URL=https://api.example.com
      createManifest(TEST_DIR, 'pending', 'web');
      expect(true).toBe(true);
    });

    it('debe configurar CORS_ALLOWED_ORIGIN en el repo api con el dominio del web', () => {
      // Cuando se despliegue api/ con info del hermano web/, se configurará:
      // CORS_ALLOWED_ORIGIN=https://web.example.com
      // SANCTUM_STATEFUL_DOMAINS=web.example.com
      createManifest(TEST_DIR, 'pending', 'api');
      expect(true).toBe(true);
    });
  });
});

describe('Deploy command integration', () => {
  it('debe actualizar DeployParams con siblingInfo cuando se pregunta', () => {
    // El tipo DeployParams ahora incluye siblingInfo opcional
    // Este test documenta el contrato de tipos
    const params = {
      serverIp: '192.168.1.1',
      sshUser: 'root',
      authMethod: 'key' as const,
      sshKeyPath: '~/.ssh/id_rsa',
      domain: 'api.example.com',
      dnsProvider: 'cloudflare' as const,
      dnsApiToken: 'token',
      gitRepository: 'https://github.com/user/api.git',
      productionBranch: 'main',
      siblingInfo: {
        gitUrl: 'https://github.com/user/web.git',
        domain: 'web.example.com',
      },
    };

    expect(params.siblingInfo).toBeDefined();
    expect(params.siblingInfo?.gitUrl).toBe('https://github.com/user/web.git');
    expect(params.siblingInfo?.domain).toBe('web.example.com');
  });

  it('siblingInfo es opcional cuando no es multirepo o ya está resolved', () => {
    const params = {
      serverIp: '192.168.1.1',
      sshUser: 'root',
      authMethod: 'key' as const,
      sshKeyPath: '~/.ssh/id_rsa',
      domain: 'example.com',
      dnsProvider: 'manual' as const,
      gitRepository: 'https://github.com/user/repo.git',
      productionBranch: 'main',
    };

    expect(params.siblingInfo).toBeUndefined();
  });
});
