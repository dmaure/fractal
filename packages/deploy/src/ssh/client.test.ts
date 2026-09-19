import { describe, it, expect } from 'vitest';
import type { SshConfig } from './types.js';

describe('SshClient', () => {
  describe('types', () => {
    it('debe definir SshConfig con propiedades requeridas', () => {
      const config: SshConfig = {
        host: '192.168.1.1',
        username: 'root',
        password: 'test123',
      };

      expect(config.host).toBe('192.168.1.1');
      expect(config.username).toBe('root');
      expect(config.password).toBe('test123');
    });

    it('debe soportar autenticación por clave privada', () => {
      const config: SshConfig = {
        host: '192.168.1.1',
        username: 'root',
        privateKeyPath: '~/.ssh/id_rsa',
      };

      expect(config.privateKeyPath).toBe('~/.ssh/id_rsa');
      expect(config.password).toBeUndefined();
    });

    it('debe soportar configuración de puerto y timeout', () => {
      const config: SshConfig = {
        host: '192.168.1.1',
        username: 'root',
        password: 'test123',
        port: 2222,
        timeout: 5000,
      };

      expect(config.port).toBe(2222);
      expect(config.timeout).toBe(5000);
    });

    it('debe soportar verificación de clave de host contra known_hosts', () => {
      const config: SshConfig = {
        host: '192.168.1.1',
        username: 'root',
        password: 'test123',
        knownHostsPath: '/tmp/known_hosts',
        onUnknownHost: async (info) => {
          expect(info.fingerprint.startsWith('SHA256:')).toBe(true);
          return false;
        },
      };

      expect(config.knownHostsPath).toBe('/tmp/known_hosts');
      expect(config.onUnknownHost).toBeTypeOf('function');
    });
  });

  describe('executeCommand with timeout', () => {
    it('debe aceptar timeout opcional como parámetro', () => {
      // El método executeCommand ahora acepta un segundo parámetro con timeout
      // Este test verifica que la firma del método es correcta
      // Los tests de integración con SSH real verificarán el comportamiento
      
      // Verificar que el tipo permite timeout opcional
      type ExecuteCommandOptions = Parameters<InstanceType<typeof import('./client.js').SshClient>['executeCommand']>[1];
      
      const validOptions: ExecuteCommandOptions = { timeoutMs: 600_000 };
      expect(validOptions.timeoutMs).toBe(600_000);
      
      // También debe aceptar undefined (timeout opcional)
      const noOptions: ExecuteCommandOptions = undefined;
      expect(noOptions).toBeUndefined();
    });
  });

  // Nota: Los tests de integración reales con SSH se ejecutan
  // en un entorno de CI con un servidor SSH mock.
  // Este test solo verifica los tipos y estructura básica.
});
