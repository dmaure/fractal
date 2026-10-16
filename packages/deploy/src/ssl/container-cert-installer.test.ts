import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContainerCertInstaller } from './container-cert-installer.js';
import type { SslSshClient } from './types.js';

describe('ContainerCertInstaller', () => {
  let mockSsh: SslSshClient;
  let installer: ContainerCertInstaller;

  beforeEach(() => {
    mockSsh = {
      executeCommand: vi.fn(),
    } as unknown as SslSshClient;
    installer = new ContainerCertInstaller(mockSsh);
  });

  const config = {
    domain: 'example.com',
    deployDir: '/home/deploy',
    containerName: 'myapp_nginx',
  };

  it('copia el certificado al montaje, ajusta permisos y recarga nginx del contenedor', async () => {
    vi.mocked(mockSsh.executeCommand).mockResolvedValue({
      success: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
    });

    const result = await installer.install(config);

    expect(result.success).toBe(true);
    expect(result.configPath).toBe('/home/deploy/docker/nginx/ssl');

    const commands = vi.mocked(mockSsh.executeCommand).mock.calls.map((c) => c[0]);

    expect(commands).toContainEqual(
      'sudo cp -L /etc/letsencrypt/live/example.com/fullchain.pem /home/deploy/docker/nginx/ssl/fullchain.pem'
    );
    expect(commands).toContainEqual(
      'sudo cp -L /etc/letsencrypt/live/example.com/privkey.pem /home/deploy/docker/nginx/ssl/privkey.pem'
    );
    expect(commands).toContainEqual(
      'sudo chmod 644 /home/deploy/docker/nginx/ssl/fullchain.pem'
    );
    expect(commands).toContainEqual(
      'sudo chmod 600 /home/deploy/docker/nginx/ssl/privkey.pem'
    );
    expect(commands).toContainEqual('docker exec myapp_nginx nginx -t');
    expect(commands).toContainEqual('docker exec myapp_nginx nginx -s reload');
  });

  it('falla si containerName está vacío sin emitir ningún docker exec', async () => {
    vi.mocked(mockSsh.executeCommand).mockResolvedValue({
      success: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
    });

    const result = await installer.install({ ...config, containerName: '' });

    expect(result.success).toBe(false);
    expect(result.steps).toEqual([]);
    expect(result.error).toBe(
      'containerName y deployDir son requeridos para instalar el certificado en el contenedor'
    );
    // No se debe ejecutar ningún comando (ni docker exec) sin containerName.
    expect(mockSsh.executeCommand).not.toHaveBeenCalled();
  });

  it('falla si deployDir está vacío sin emitir ningún comando', async () => {
    vi.mocked(mockSsh.executeCommand).mockResolvedValue({
      success: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
    });

    const result = await installer.install({ ...config, deployDir: '' });

    expect(result.success).toBe(false);
    expect(result.steps).toEqual([]);
    expect(result.error).toBe(
      'containerName y deployDir son requeridos para instalar el certificado en el contenedor'
    );
    expect(mockSsh.executeCommand).not.toHaveBeenCalled();
  });

  it('falla si no se puede copiar fullchain.pem', async () => {
    vi.mocked(mockSsh.executeCommand).mockResolvedValueOnce({
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: 'No such file',
    });

    const result = await installer.install(config);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No se pudo copiar fullchain.pem');
  });

  it('falla si la validación de nginx en el contenedor falla', async () => {
    vi.mocked(mockSsh.executeCommand)
      // cp fullchain, cp privkey, chmod 644, chmod 600
      .mockResolvedValueOnce({ success: true, exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ success: true, exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ success: true, exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ success: true, exitCode: 0, stdout: '', stderr: '' })
      // docker exec nginx -t falla
      .mockResolvedValueOnce({
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: 'invalid configuration',
      });

    const result = await installer.install(config);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Validación de nginx en el contenedor falló');
  });

  it('falla si la recarga de nginx en el contenedor falla', async () => {
    vi.mocked(mockSsh.executeCommand)
      // cp fullchain, cp privkey, chmod 644, chmod 600, nginx -t
      .mockResolvedValueOnce({ success: true, exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ success: true, exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ success: true, exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ success: true, exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ success: true, exitCode: 0, stdout: '', stderr: '' })
      // docker exec nginx -s reload falla
      .mockResolvedValueOnce({
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: 'reload failed',
      });

    const result = await installer.install(config);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Recarga de nginx en el contenedor falló');
  });

  it('maneja excepciones del cliente SSH', async () => {
    vi.mocked(mockSsh.executeCommand).mockRejectedValue(new Error('SSH down'));

    const result = await installer.install(config);

    expect(result.success).toBe(false);
    expect(result.error).toBe('SSH down');
  });
});
