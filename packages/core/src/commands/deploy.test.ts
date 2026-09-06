import { describe, it, expect } from 'vitest';
import type { DeployParams } from '../types/deploy-command.js';

describe('Deploy command', () => {
  describe('types', () => {
    it('debe definir DeployParams con todas las propiedades requeridas', () => {
      const params: DeployParams = {
        serverIp: '192.168.1.1',
        sshUser: 'root',
        authMethod: 'key',
        sshKeyPath: '~/.ssh/id_rsa',
        domain: 'example.com',
        dnsProvider: 'cloudflare',
        dnsApiToken: 'test-token',
        gitRepository: 'https://github.com/user/repo.git',
        productionBranch: 'main',
      };

      expect(params.serverIp).toBe('192.168.1.1');
      expect(params.sshUser).toBe('root');
      expect(params.authMethod).toBe('key');
      expect(params.domain).toBe('example.com');
      expect(params.dnsProvider).toBe('cloudflare');
    });

    it('debe soportar autenticación por contraseña', () => {
      const params: DeployParams = {
        serverIp: '192.168.1.1',
        sshUser: 'root',
        authMethod: 'password',
        sshPassword: 'test123',
        domain: 'example.com',
        dnsProvider: 'manual',
        gitRepository: 'https://github.com/user/repo.git',
        productionBranch: 'main',
      };

      expect(params.authMethod).toBe('password');
      expect(params.sshPassword).toBe('test123');
      expect(params.sshKeyPath).toBeUndefined();
    });

    it('debe soportar configuración DNS manual', () => {
      const params: DeployParams = {
        serverIp: '192.168.1.1',
        sshUser: 'root',
        authMethod: 'key',
        sshKeyPath: '~/.ssh/id_rsa',
        domain: 'example.com',
        dnsProvider: 'manual',
        gitRepository: 'https://github.com/user/repo.git',
        productionBranch: 'main',
      };

      expect(params.dnsProvider).toBe('manual');
      expect(params.dnsApiToken).toBeUndefined();
    });
  });

  // Nota: Los tests de integración end-to-end del comando deploy
  // se ejecutan contra un VPS efímero en CI, según SPEC-0003.
  // Este test solo verifica los tipos y estructura básica.
});
