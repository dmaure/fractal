import { describe, it, expect } from 'vitest';
import type { DeployParams } from '../types/deploy-command.js';
import { formatKnownHostsSecretHelp } from './deploy.js';

describe('Deploy command', () => {
  describe('types', () => {
    it('debe definir DeployParams con todas las propiedades requeridas', () => {
      const params: DeployParams = {
        serverIp: '192.168.1.1',
        sshUser: 'root',
        authMethod: 'key',
        sshKeyPath: '~/.ssh/id_rsa',
        domain: 'example.com',
        email: 'admin@example.com',
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
        email: 'admin@example.com',
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
        email: 'admin@example.com',
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

  describe('SSH_KNOWN_HOSTS surfacing (FRA-76)', () => {
    it('imprime el VALOR real (línea known_hosts) cuando se capturó', () => {
      const line = '203.0.113.10 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIexample';
      const help = formatKnownHostsSecretHelp('203.0.113.10', line);

      // El valor real se surte tal cual para copiar al secret.
      expect(help).toContain(line);
      expect(help.join('\n')).toContain('copiá esta línea tal cual');
      // No cae al fallback de ssh-keyscan cuando hay valor.
      expect(help.join('\n')).not.toContain('ssh-keyscan');
    });

    it('cae al comando exacto de ssh-keyscan cuando no se capturó el valor', () => {
      const help = formatKnownHostsSecretHelp('203.0.113.10', undefined);

      const joined = help.join('\n');
      // Comando exacto con la IP del servidor y los tipos de clave.
      expect(joined).toContain('ssh-keyscan -t ed25519,rsa,ecdsa 203.0.113.10');
      // Aclara que hay que cargar la salida completa.
      expect(joined).toContain('COMPLETA');
    });
  });
});
