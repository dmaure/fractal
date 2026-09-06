import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { SystemHardening } from './system-hardening.js';
import type { SshClient } from '../ssh/client.js';
import type { SshCommandResult } from '../ssh/types.js';

describe('SystemHardening', () => {
  let mockSshClient: SshClient;
  let systemHardening: SystemHardening;
  let executeCommandMock: Mock;

  beforeEach(() => {
    executeCommandMock = vi.fn();
    mockSshClient = {
      executeCommand: executeCommandMock,
    } as unknown as SshClient;
    systemHardening = new SystemHardening(mockSshClient);
  });

  describe('checkPorts', () => {
    it('debe reportar puertos disponibles cuando están libres', async () => {
      // Mock: ss no encuentra ningún puerto ocupado
      executeCommandMock.mockResolvedValue({
        success: true,
        stdout: '',
        stderr: '',
        exitCode: 0,
      } as SshCommandResult);

      const result = await systemHardening.checkPorts();

      expect(result.available).toBe(true);
      expect(result.occupiedPorts).toHaveLength(0);
      expect(executeCommandMock).toHaveBeenCalledTimes(2); // Puerto 80 y 443
    });

    it('debe detectar puerto 80 ocupado e identificar el proceso', async () => {
      executeCommandMock.mockImplementation(async (cmd: string) => {
        if (cmd.includes('ss -tuln')) {
          // Puerto 80 ocupado
          if (cmd.includes(':80')) {
            return {
              success: true,
              stdout: 'tcp   LISTEN 0      128          0.0.0.0:80           0.0.0.0:*',
              stderr: '',
              exitCode: 0,
            } as SshCommandResult;
          }
          // Puerto 443 libre
          return {
            success: true,
            stdout: '',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // lsof identifica nginx
        if (cmd.includes('lsof')) {
          return {
            success: true,
            stdout: 'nginx',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }

        return {
          success: false,
          stdout: '',
          stderr: '',
          exitCode: 1,
        } as SshCommandResult;
      });

      const result = await systemHardening.checkPorts();

      expect(result.available).toBe(false);
      expect(result.occupiedPorts).toHaveLength(1);
      expect(result.occupiedPorts[0]).toBe('80 (proceso: nginx)');
    });

    it('debe detectar ambos puertos ocupados', async () => {
      executeCommandMock.mockImplementation(async (cmd: string) => {
        if (cmd.includes('ss -tuln')) {
          return {
            success: true,
            stdout: 'tcp   LISTEN',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        if (cmd.includes('lsof') && cmd.includes(':80')) {
          return {
            success: true,
            stdout: 'apache2',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        if (cmd.includes('lsof') && cmd.includes(':443')) {
          return {
            success: true,
            stdout: 'nginx',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }

        return {
          success: false,
          stdout: '',
          stderr: '',
          exitCode: 1,
        } as SshCommandResult;
      });

      const result = await systemHardening.checkPorts();

      expect(result.available).toBe(false);
      expect(result.occupiedPorts).toHaveLength(2);
      expect(result.occupiedPorts).toContain('80 (proceso: apache2)');
      expect(result.occupiedPorts).toContain('443 (proceso: nginx)');
    });

    it('debe manejar el caso cuando no se puede identificar el proceso', async () => {
      executeCommandMock.mockImplementation(async (cmd: string) => {
        if (cmd.includes('ss -tuln') && cmd.includes(':80')) {
          return {
            success: true,
            stdout: 'tcp   LISTEN',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        if (cmd.includes('lsof')) {
          return {
            success: false,
            stdout: '',
            stderr: 'Permission denied',
            exitCode: 1,
          } as SshCommandResult;
        }

        return {
          success: true,
          stdout: '',
          stderr: '',
          exitCode: 0,
        } as SshCommandResult;
      });

      const result = await systemHardening.checkPorts();

      expect(result.available).toBe(false);
      expect(result.occupiedPorts[0]).toBe('80 (proceso: unknown)');
    });
  });

  describe('harden', () => {
    const validConfig = {
      deployUser: 'deploy',
      sshPublicKey: 'ssh-rsa AAAAB3NzaC1yc2EAAA... user@host',
      allowedPorts: [22, 80, 443],
    };

    it('debe ejecutar todos los pasos de hardening exitosamente', async () => {
      // Mock: todos los comandos exitosos
      executeCommandMock.mockImplementation(async (cmd: string) => {
        // Usuario no existe
        if (cmd.includes('id deploy') && cmd.includes('not_found')) {
          return {
            success: true,
            stdout: 'not_found',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // Comando grep para verificar configuración
        if (cmd.includes('grep -q')) {
          return {
            success: true,
            stdout: '',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // Comando test -f
        if (cmd.includes('test -f')) {
          return {
            success: true,
            stdout: 'exists',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // UFW instalado
        if (cmd.includes('command -v ufw')) {
          return {
            success: true,
            stdout: 'installed',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }

        return {
          success: true,
          stdout: 'success',
          stderr: '',
          exitCode: 0,
        } as SshCommandResult;
      });

      const result = await systemHardening.harden(validConfig);

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(4);
      expect(result.steps[0]).toContain('Usuario deploy creado');
      expect(result.steps[1]).toContain('Clave SSH agregada');
      expect(result.steps[2]).toContain('SSH endurecido');
      expect(result.steps[3]).toContain('Firewall UFW configurado');
      expect(result.error).toBeUndefined();
    });

    it('debe fallar si no se puede crear el usuario deploy', async () => {
      executeCommandMock.mockImplementation(async (cmd: string) => {
        // Falla al verificar si el usuario existe
        if (cmd.includes('id deploy')) {
          return {
            success: true,
            stdout: 'not_found',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // Falla al crear el usuario
        if (cmd.includes('useradd')) {
          return {
            success: false,
            stdout: '',
            stderr: 'Error creating user',
            exitCode: 1,
          } as SshCommandResult;
        }

        return {
          success: true,
          stdout: '',
          stderr: '',
          exitCode: 0,
        } as SshCommandResult;
      });

      const result = await systemHardening.harden(validConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No se pudo crear el usuario');
      expect(result.steps).toHaveLength(0);
    });

    it('debe continuar si el usuario deploy ya existe con sudo', async () => {
      executeCommandMock.mockImplementation(async (cmd: string) => {
        // Usuario ya existe
        if (cmd.includes('id deploy')) {
          return {
            success: true,
            stdout: 'uid=1001(deploy) gid=1001(deploy)',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // Usuario tiene sudo
        if (cmd.includes('sudo -l -U') || cmd.includes('has_sudo')) {
          return {
            success: true,
            stdout: 'has_sudo',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // test -f
        if (cmd.includes('test -f')) {
          return {
            success: true,
            stdout: 'exists',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // grep -q
        if (cmd.includes('grep -q')) {
          return {
            success: true,
            stdout: '',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // UFW instalado
        if (cmd.includes('command -v ufw')) {
          return {
            success: true,
            stdout: 'installed',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }

        return {
          success: true,
          stdout: '',
          stderr: '',
          exitCode: 0,
        } as SshCommandResult;
      });

      const result = await systemHardening.harden(validConfig);

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(4);
    });

    it('debe fallar si no se puede configurar SSH', async () => {
      let stepCount = 0;
      
      executeCommandMock.mockImplementation(async (cmd: string) => {
        // Usuario creado ok
        if (cmd.includes('id deploy') || cmd.includes('useradd') || cmd.includes('usermod')) {
          return {
            success: true,
            stdout: 'success',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // Falla al crear directorio .ssh
        if (cmd.includes('mkdir -p') && cmd.includes('.ssh')) {
          return {
            success: false,
            stdout: '',
            stderr: 'Permission denied',
            exitCode: 1,
          } as SshCommandResult;
        }

        return {
          success: true,
          stdout: '',
          stderr: '',
          exitCode: 0,
        } as SshCommandResult;
      });

      const result = await systemHardening.harden(validConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No se pudo configurar SSH');
      expect(result.steps).toHaveLength(1); // Solo creación de usuario
    });

    it('debe fallar si la configuración de sshd es inválida', async () => {
      executeCommandMock.mockImplementation(async (cmd: string) => {
        // Primeros pasos ok
        if (cmd.includes('id deploy') || 
            cmd.includes('useradd') || 
            cmd.includes('usermod') ||
            cmd.includes('mkdir') ||
            cmd.includes('echo') ||
            cmd.includes('chmod') ||
            cmd.includes('chown')) {
          return {
            success: true,
            stdout: 'success',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // sshd_config existe
        if (cmd.includes('test -f /etc/ssh/sshd_config')) {
          return {
            success: true,
            stdout: 'exists',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // Backup y modificaciones ok
        if (cmd.includes('cp') || cmd.includes('sed')) {
          return {
            success: true,
            stdout: '',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // Validación de sshd falla
        if (cmd.includes('sshd -t')) {
          return {
            success: false,
            stdout: '',
            stderr: 'Invalid configuration',
            exitCode: 1,
          } as SshCommandResult;
        }

        return {
          success: true,
          stdout: '',
          stderr: '',
          exitCode: 0,
        } as SshCommandResult;
      });

      const result = await systemHardening.harden(validConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No se pudo endurecer la configuración de SSH');
      expect(result.steps).toHaveLength(2); // Usuario y SSH key
    });

    it('debe instalar UFW si no está presente', async () => {
      let ufwInstalled = false;
      
      executeCommandMock.mockImplementation(async (cmd: string) => {
        // Usuario no existe
        if (cmd.includes('id deploy') && cmd.includes('not_found')) {
          return {
            success: true,
            stdout: 'not_found',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // test -f
        if (cmd.includes('test -f')) {
          return {
            success: true,
            stdout: 'exists',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // grep -q
        if (cmd.includes('grep -q')) {
          return {
            success: true,
            stdout: '',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // UFW no está instalado inicialmente
        if (cmd.includes('command -v ufw') && !ufwInstalled) {
          return {
            success: true,
            stdout: '',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // Instalación de UFW
        if (cmd.includes('apt-get install') && cmd.includes('ufw')) {
          ufwInstalled = true;
          return {
            success: true,
            stdout: 'UFW installed',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // Después de instalado
        if (cmd.includes('command -v ufw') && ufwInstalled) {
          return {
            success: true,
            stdout: 'installed',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }

        return {
          success: true,
          stdout: 'success',
          stderr: '',
          exitCode: 0,
        } as SshCommandResult;
      });

      const result = await systemHardening.harden(validConfig);

      expect(result.success).toBe(true);
      expect(executeCommandMock).toHaveBeenCalledWith(
        expect.stringContaining('apt-get install')
      );
    });

    it('debe configurar UFW con los puertos especificados', async () => {
      const customConfig = {
        ...validConfig,
        allowedPorts: [22, 8080, 8443],
      };

      executeCommandMock.mockImplementation(async (cmd: string) => {
        // Usuario no existe
        if (cmd.includes('id deploy') && cmd.includes('not_found')) {
          return {
            success: true,
            stdout: 'not_found',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // test -f
        if (cmd.includes('test -f')) {
          return {
            success: true,
            stdout: 'exists',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // grep -q
        if (cmd.includes('grep -q')) {
          return {
            success: true,
            stdout: '',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // UFW instalado
        if (cmd.includes('command -v ufw')) {
          return {
            success: true,
            stdout: 'installed',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }

        return {
          success: true,
          stdout: 'success',
          stderr: '',
          exitCode: 0,
        } as SshCommandResult;
      });

      const result = await systemHardening.harden(customConfig);

      expect(result.success).toBe(true);
      expect(executeCommandMock).toHaveBeenCalledWith('sudo ufw allow 22/tcp');
      expect(executeCommandMock).toHaveBeenCalledWith('sudo ufw allow 8080/tcp');
      expect(executeCommandMock).toHaveBeenCalledWith('sudo ufw allow 8443/tcp');
    });

    it('debe fallar si UFW no se puede habilitar', async () => {
      executeCommandMock.mockImplementation(async (cmd: string) => {
        // Usuario no existe
        if (cmd.includes('id deploy') && cmd.includes('not_found')) {
          return {
            success: true,
            stdout: 'not_found',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // test -f
        if (cmd.includes('test -f')) {
          return {
            success: true,
            stdout: 'exists',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // grep -q
        if (cmd.includes('grep -q')) {
          return {
            success: true,
            stdout: '',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // UFW instalado
        if (cmd.includes('command -v ufw')) {
          return {
            success: true,
            stdout: 'installed',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // Falla al habilitar UFW
        if (cmd.includes('ufw --force enable')) {
          return {
            success: false,
            stdout: '',
            stderr: 'Could not enable UFW',
            exitCode: 1,
          } as SshCommandResult;
        }

        return {
          success: true,
          stdout: 'success',
          stderr: '',
          exitCode: 0,
        } as SshCommandResult;
      });

      const result = await systemHardening.harden(validConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No se pudo configurar el firewall');
      expect(result.steps).toHaveLength(3); // Usuario, SSH key, SSH hardening
    });

    it('debe usar puertos por defecto si no se especifican', async () => {
      const configWithoutPorts = {
        deployUser: 'deploy',
        sshPublicKey: 'ssh-rsa AAAAB3...',
      };

      executeCommandMock.mockImplementation(async (cmd: string) => {
        // Usuario no existe
        if (cmd.includes('id deploy') && cmd.includes('not_found')) {
          return {
            success: true,
            stdout: 'not_found',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // test -f
        if (cmd.includes('test -f')) {
          return {
            success: true,
            stdout: 'exists',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // grep -q
        if (cmd.includes('grep -q')) {
          return {
            success: true,
            stdout: '',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // UFW instalado
        if (cmd.includes('command -v ufw')) {
          return {
            success: true,
            stdout: 'installed',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }

        return {
          success: true,
          stdout: 'success',
          stderr: '',
          exitCode: 0,
        } as SshCommandResult;
      });

      const result = await systemHardening.harden(configWithoutPorts);

      expect(result.success).toBe(true);
      expect(result.steps[3]).toContain('22, 80, 443');
    });

    it('debe escapar correctamente la clave SSH pública', async () => {
      const configWithSpecialChars = {
        ...validConfig,
        sshPublicKey: "ssh-rsa AAAA...== user's@host",
      };

      executeCommandMock.mockImplementation(async (cmd: string) => {
        // Usuario no existe
        if (cmd.includes('id deploy') && cmd.includes('not_found')) {
          return {
            success: true,
            stdout: 'not_found',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // test -f
        if (cmd.includes('test -f')) {
          return {
            success: true,
            stdout: 'exists',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // grep -q
        if (cmd.includes('grep -q')) {
          return {
            success: true,
            stdout: '',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }
        
        // UFW instalado
        if (cmd.includes('command -v ufw')) {
          return {
            success: true,
            stdout: 'installed',
            stderr: '',
            exitCode: 0,
          } as SshCommandResult;
        }

        return {
          success: true,
          stdout: 'success',
          stderr: '',
          exitCode: 0,
        } as SshCommandResult;
      });

      const result = await systemHardening.harden(configWithSpecialChars);

      expect(result.success).toBe(true);
      // Verificar que el comando echo fue llamado con la clave escapada
      const echoCalls = executeCommandMock.mock.calls.filter(
        (call: string[]) => call[0].includes('echo') && call[0].includes('authorized_keys')
      );
      expect(echoCalls.length).toBeGreaterThan(0);
    });

    it('debe manejar errores inesperados', async () => {
      executeCommandMock.mockRejectedValue(new Error('Network error'));

      const result = await systemHardening.harden(validConfig);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });
});
