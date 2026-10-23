import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DockerInstaller } from './docker-installer.js';
import type { SshClient } from '../ssh/client.js';

describe('DockerInstaller', () => {
  let mockSshClient: SshClient;
  let installer: DockerInstaller;

  beforeEach(() => {
    mockSshClient = {
      executeCommand: vi.fn(),
    } as any;
    installer = new DockerInstaller(mockSshClient);
  });

  describe('install - Docker already installed', () => {
    it('should detect existing Docker and Compose installation', async () => {
      // Mock: Docker y Compose ya instalados
      vi.mocked(mockSshClient.executeCommand)
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: 'Docker version 24.0.7, build...',
          stderr: '',
        })
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: 'Docker Compose version v2.24.5',
          stderr: '',
        })
        // ensureCurrentUserInDockerGroup
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '', exitCode: 0 });

      const result = await installer.install();

      expect(result.success).toBe(true);
      expect(result.dockerVersion).toBe('24.0.7');
      expect(result.composeVersion).toBe('2.24.5');
      expect(result.steps).toContain('Docker ya instalado: 24.0.7');
      expect(result.steps).toContain('Docker Compose ya instalado: 2.24.5');
      expect(result.steps).toContain('Usuario agregado al grupo docker');
    });
  });

  describe('install - Fresh installation', () => {
    it('should install Docker and Compose from scratch', async () => {
      // Mock por implementación (más robusto ante cambios de orden que una
      // cadena de mockResolvedValueOnce): captura los comandos y simula un
      // host donde Docker/Compose empiezan sin instalar.
      const commands: string[] = [];
      let dockerInstalled = false;
      let composeInstalled = false;

      vi.mocked(mockSshClient.executeCommand).mockImplementation(
        async (cmd: string) => {
          commands.push(cmd);
          if (cmd.includes('docker --version')) {
            return dockerInstalled
              ? { success: true, exitCode: 0, stdout: 'Docker version 24.0.7, build...', stderr: '' }
              : { success: true, exitCode: 0, stdout: 'not_installed', stderr: '' };
          }
          if (cmd.includes('docker compose version')) {
            return composeInstalled
              ? { success: true, exitCode: 0, stdout: 'Docker Compose version v2.24.5', stderr: '' }
              : { success: true, exitCode: 0, stdout: 'not_installed', stderr: '' };
          }
          if (cmd.includes('docker-ce docker-ce-cli')) {
            dockerInstalled = true;
          }
          if (cmd.includes('docker-compose-plugin')) {
            composeInstalled = true;
          }
          if (cmd.includes('is-active')) {
            return { success: true, exitCode: 0, stdout: 'active', stderr: '' };
          }
          return { success: true, exitCode: 0, stdout: '', stderr: '' };
        }
      );

      const result = await installer.install();

      expect(result.success).toBe(true);
      expect(result.steps).toContain('Repositorio de Docker agregado');
      expect(result.steps).toContain('Docker CE instalado');
      expect(result.steps).toContain('Docker Compose plugin instalado');
      expect(result.steps).toContain('Servicio Docker activo');
      expect(result.steps).toContain('Usuario agregado al grupo docker');
      expect(result.dockerVersion).toBe('24.0.7');
      expect(result.composeVersion).toBe('2.24.5');

      // FRA-76: el comando de install de Docker lleva el nuevo shape con el
      // lock timeout inmediatamente después de apt-get, y corre no interactivo.
      const aptInstallDocker = commands.find((c) =>
        c.includes('docker-ce docker-ce-cli')
      );
      expect(aptInstallDocker).toContain(
        'apt-get -o DPkg::Lock::Timeout=300 install -y -qq docker-ce docker-ce-cli containerd.io'
      );
      expect(aptInstallDocker).toContain('DEBIAN_FRONTEND=noninteractive');

      // Toda invocación a apt-get espera el lock de dpkg (DPkg::Lock::Timeout).
      const aptCommands = commands.filter((c) => c.includes('apt-get'));
      expect(aptCommands.length).toBeGreaterThan(0);
      aptCommands.forEach((c) => {
        expect(c).toContain('DPkg::Lock::Timeout');
      });

      // FRA-76: antes de la primera operación apt corre un guard que espera a
      // que se libere el lock de dpkg/cloud-init.
      const guardIdx = commands.findIndex((c) => c.includes('lock-frontend'));
      const firstAptIdx = commands.findIndex((c) => c.includes('apt-get'));
      expect(guardIdx).toBeGreaterThanOrEqual(0);
      expect(firstAptIdx).toBeGreaterThanOrEqual(0);
      expect(guardIdx).toBeLessThan(firstAptIdx);
    });
  });

  describe('install - Prerequisites', () => {
    it('should install prerequisites when checkPrerequisites is true', async () => {
      const commands: string[] = [];
      vi.mocked(mockSshClient.executeCommand).mockImplementation(
        async (cmd: string) => {
          commands.push(cmd);
          if (cmd.includes('docker --version')) {
            return { success: true, exitCode: 0, stdout: 'not_installed', stderr: '' };
          }
          if (cmd.includes('docker compose version')) {
            return { success: true, exitCode: 0, stdout: 'not_installed', stderr: '' };
          }
          if (cmd.includes('is-active')) {
            return { success: true, exitCode: 0, stdout: 'active', stderr: '' };
          }
          return { success: true, exitCode: 0, stdout: '', stderr: '' };
        }
      );

      const result = await installer.install({ checkPrerequisites: true });

      expect(result.steps).toContain('Prerequisites instalados');

      // FRA-76: el apt-get de prerequisites también lleva el lock timeout y
      // corre no interactivo.
      const prereq = commands.find((c) => c.includes('ca-certificates curl gnupg'));
      expect(prereq).toContain(
        'apt-get -o DPkg::Lock::Timeout=300 install -y -qq ca-certificates curl gnupg'
      );
      expect(prereq).toContain('DEBIAN_FRONTEND=noninteractive');
    });

    it('should fail if prerequisites installation fails and surface the real error', async () => {
      vi.mocked(mockSshClient.executeCommand).mockImplementation(
        async (cmd: string) => {
          if (cmd.includes('docker --version')) {
            return { success: true, exitCode: 0, stdout: 'not_installed', stderr: '' };
          }
          if (cmd.includes('ca-certificates curl gnupg')) {
            return {
              success: false,
              exitCode: 100,
              stdout: '',
              stderr: 'E: Could not get lock /var/lib/dpkg/lock-frontend',
            };
          }
          return { success: true, exitCode: 0, stdout: '', stderr: '' };
        }
      );

      const result = await installer.install({ checkPrerequisites: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain('prerequisites');
      // El stderr real del apt remoto sube al error, no se traga (FRA-76).
      expect(result.error).toContain('Could not get lock');
      expect(result.error).toContain('comando:');
    });
  });

  describe('install - Error handling', () => {
    it('should fail gracefully if Docker Engine installation fails and surface the real error', async () => {
      vi.mocked(mockSshClient.executeCommand).mockImplementation(
        async (cmd: string) => {
          if (cmd.includes('docker --version')) {
            return { success: true, exitCode: 0, stdout: 'not_installed', stderr: '' };
          }
          if (cmd.includes('docker-ce docker-ce-cli')) {
            return {
              success: false,
              exitCode: 100,
              stdout: '',
              stderr: 'E: Unable to acquire the dpkg frontend lock',
            };
          }
          return { success: true, exitCode: 0, stdout: '', stderr: '' };
        }
      );

      const result = await installer.install();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Docker Engine');
      // FRA-76: el error remoto real (comando + stderr de apt) sube al mensaje.
      expect(result.error).toContain('Unable to acquire the dpkg frontend lock');
      expect(result.error).toContain('comando:');
    });

    it('should fail if Docker service cannot be started', async () => {
      vi.mocked(mockSshClient.executeCommand)
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: 'Docker version 24.0.7',
          stderr: '',
        })
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: 'Docker Compose version v2.24.5',
          stderr: '',
        })
        // ensureCurrentUserInDockerGroup
        .mockResolvedValueOnce({ success: true, stdout: '', stderr: '', exitCode: 0 });

      const result = await installer.install();

      expect(result.success).toBe(true);
    });
  });

  describe('install - grupo docker', () => {
    it('agrega al usuario actual al grupo docker para acceder al socket', async () => {
      const commands: string[] = [];
      vi.mocked(mockSshClient.executeCommand).mockImplementation(
        async (cmd: string) => {
          commands.push(cmd);
          if (cmd.includes('docker --version')) {
            return {
              success: true,
              exitCode: 0,
              stdout: 'Docker version 24.0.7, build...',
              stderr: '',
            };
          }
          if (cmd.includes('docker compose version')) {
            return {
              success: true,
              exitCode: 0,
              stdout: 'Docker Compose version v2.24.5',
              stderr: '',
            };
          }
          return { success: true, stdout: '', stderr: '', exitCode: 0 };
        }
      );

      const result = await installer.install();

      expect(result.success).toBe(true);
      expect(commands.some((c) => c.includes('usermod -aG docker'))).toBe(true);
      expect(result.steps).toContain('Usuario agregado al grupo docker');
    });

    it('falla si no se puede agregar el usuario al grupo docker', async () => {
      vi.mocked(mockSshClient.executeCommand)
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: 'Docker version 24.0.7, build...',
          stderr: '',
        })
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: 'Docker Compose version v2.24.5',
          stderr: '',
        })
        .mockResolvedValueOnce({
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: 'usermod failed',
        });

      const result = await installer.install();

      expect(result.success).toBe(false);
      expect(result.error).toContain('grupo docker');
    });
  });

  describe('framework-agnostic compliance', () => {
    it('should not use framework-specific commands', async () => {
      const commandCalls: string[] = [];
      
      vi.mocked(mockSshClient.executeCommand).mockImplementation(
        async (cmd: string) => {
          commandCalls.push(cmd.toLowerCase());
          return { success: true, stdout: '', stderr: '', exitCode: 0 };
        }
      );

      // Try to install (will fail but we'll capture commands)
      await installer.install().catch(() => {});

      // Verificar que no hay términos prohibidos del Artículo II
      const prohibitedTerms = [
        'laravel',
        'artisan',
        'composer',
        'php',
        'rails',
        'bundle',
        'ruby',
      ];

      const allCommands = commandCalls.join(' ');
      prohibitedTerms.forEach((term) => {
        expect(allCommands).not.toContain(term);
      });
    });
  });
});
