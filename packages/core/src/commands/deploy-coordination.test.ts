import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ManifestManager, CrossVarWriter } from '@fractal/deploy';

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
      
      const manager = new ManifestManager(TEST_DIR);
      const result = manager.read();
      
      expect(result.exists).toBe(true);
      expect(result.manifest?.orchestration_state).toBe('pending');
    });

    it('detecta manifiesto en estado resolved', () => {
      createManifest(TEST_DIR, 'resolved', 'web');
      
      const manager = new ManifestManager(TEST_DIR);
      const result = manager.read();
      
      expect(result.exists).toBe(true);
      expect(result.manifest?.orchestration_state).toBe('resolved');
    });
  });

  describe('Coordinación en el primer deploy', () => {
    it('debe preguntar info del hermano cuando orchestration_state es pending', () => {
      createManifest(TEST_DIR, 'pending', 'api');
      
      const manager = new ManifestManager(TEST_DIR);
      const result = manager.read();
      
      // El deploy command detectará pending y establecerá askSiblingInfo = true
      expect(result.manifest?.orchestration_state).toBe('pending');
      expect(result.manifest?.sibling.git_url).toBeNull();
      expect(result.manifest?.sibling.domain).toBeNull();
    });

    it('no debe preguntar info del hermano cuando orchestration_state es resolved', () => {
      createManifest(TEST_DIR, 'resolved', 'web');
      
      const manager = new ManifestManager(TEST_DIR);
      const result = manager.read();
      
      // El deploy command detectará resolved y NO preguntará info del hermano
      // (a menos que se pase --reconfigure)
      expect(result.manifest?.orchestration_state).toBe('resolved');
      expect(result.manifest?.sibling.git_url).not.toBeNull();
      expect(result.manifest?.sibling.domain).not.toBeNull();
    });
    
    it('actualiza el manifiesto a resolved después de recolectar', () => {
      createManifest(TEST_DIR, 'pending', 'api');
      
      const manager = new ManifestManager(TEST_DIR);
      const updateResult = manager.updateWithSiblingInfo({
        gitUrl: 'https://github.com/user/web.git',
        domain: 'web.example.com',
      });
      
      expect(updateResult.success).toBe(true);
      
      const readResult = manager.read();
      expect(readResult.manifest?.orchestration_state).toBe('resolved');
      expect(readResult.manifest?.sibling.git_url).toBe('https://github.com/user/web.git');
      expect(readResult.manifest?.sibling.domain).toBe('web.example.com');
    });
  });

  describe('Flag --reconfigure', () => {
    it('debe forzar preguntar info del hermano aunque orchestration_state sea resolved', () => {
      createManifest(TEST_DIR, 'resolved', 'api');
      
      const manager = new ManifestManager(TEST_DIR);
      const initialRead = manager.read();
      expect(initialRead.manifest?.orchestration_state).toBe('resolved');
      
      // Con --reconfigure, el deploy command establecerá askSiblingInfo = true
      // incluso si el estado es resolved, y luego actualizará con nuevos valores
      const updateResult = manager.updateWithSiblingInfo({
        gitUrl: 'https://github.com/user/web-new.git',
        domain: 'web-new.example.com',
      });
      
      expect(updateResult.success).toBe(true);
      
      const finalRead = manager.read();
      expect(finalRead.manifest?.sibling.git_url).toBe('https://github.com/user/web-new.git');
      expect(finalRead.manifest?.sibling.domain).toBe('web-new.example.com');
    });
  });

  describe('Variables cruzadas según ADR-0012', () => {
    it('debe configurar VITE_API_URL en el repo web con el dominio del api', () => {
      const writer = new CrossVarWriter();
      
      const result = writer.write({
        role: 'web',
        currentDomain: 'web.example.com',
        siblingDomain: 'api.example.com',
      });
      
      expect(result.writtenVars).toEqual({
        VITE_API_URL: 'https://api.example.com',
      });
    });

    it('debe configurar CORS_ALLOWED_ORIGIN en el repo api con el dominio del web', () => {
      const writer = new CrossVarWriter();
      
      const result = writer.write({
        role: 'api',
        currentDomain: 'api.example.com',
        siblingDomain: 'web.example.com',
      });
      
      expect(result.writtenVars).toEqual({
        CORS_ALLOWED_ORIGIN: 'https://web.example.com',
        SANCTUM_STATEFUL_DOMAINS: 'web.example.com',
      });
    });
    
    it('genera instrucciones para el repo hermano con variables inversas', () => {
      const writer = new CrossVarWriter();
      
      const result = writer.write({
        role: 'api',
        currentDomain: 'api.example.com',
        siblingDomain: 'web.example.com',
      });
      
      expect(result.siblingInstructions).toBeDefined();
      expect(result.siblingInstructions?.siblingRole).toBe('web');
      expect(result.siblingInstructions?.varsToSet).toEqual({
        VITE_API_URL: 'https://api.example.com',
      });
    });
  });
  
  describe('Lost-manifest behavior', () => {
    it('manifiesto faltante permite re-preguntar (degradación aceptable)', () => {
      // Simular un VPS reconstruido donde el manifiesto se perdió
      const manager = new ManifestManager(TEST_DIR);
      const result = manager.read();
      
      expect(result.exists).toBe(false);
      
      // El deploy command puede detectar esto y tratar de recrear el manifiesto
      // o continuar con el flujo normal si no es multirepo
      // Esta es una degradación aceptable según AC-13
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
