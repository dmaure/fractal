import { describe, it, expect, vi } from 'vitest';
import { uploadAndStartContainers } from './deploy.js';

/**
 * Tests del helper de arranque del runtime (FRA-70): sube el proyecto al VPS y
 * ejecuta `docker compose up -d --build`. El cliente se mockea; no se abre
 * ninguna conexión real.
 */
describe('uploadAndStartContainers (FRA-70)', () => {
  it('sube el proyecto y arranca los contenedores construyendo la imagen', async () => {
    const uploadDirectory = vi.fn().mockResolvedValue({ success: true });
    const executeCommand = vi.fn().mockResolvedValue({ success: true, stdout: '', stderr: '' });

    const result = await uploadAndStartContainers(
      { uploadDirectory, executeCommand },
      '/local/project',
      '/home/deploy'
    );

    expect(result.success).toBe(true);

    // Se sube el directorio del proyecto al directorio de deploy.
    expect(uploadDirectory).toHaveBeenCalledWith('/local/project', '/home/deploy');

    // Se construye la imagen en el servidor (--build) en el mismo directorio.
    expect(executeCommand).toHaveBeenCalledTimes(1);
    const [cmd] = executeCommand.mock.calls[0];
    expect(cmd).toBe('cd /home/deploy && docker compose up -d --build');
  });

  it('se detiene en la etapa de subida si falla el upload', async () => {
    const uploadDirectory = vi.fn().mockResolvedValue({ success: false, error: 'sin espacio' });
    const executeCommand = vi.fn();

    const result = await uploadAndStartContainers(
      { uploadDirectory, executeCommand },
      '/local/project',
      '/home/deploy'
    );

    expect(result.success).toBe(false);
    expect(result.stage).toBe('upload');
    expect(result.error).toBe('sin espacio');
    // No se intenta arrancar contenedores si la subida falló.
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it('reporta la etapa de compose si falla docker compose up', async () => {
    const uploadDirectory = vi.fn().mockResolvedValue({ success: true });
    const executeCommand = vi.fn().mockResolvedValue({
      success: false,
      stdout: '',
      stderr: 'build failed',
    });

    const result = await uploadAndStartContainers(
      { uploadDirectory, executeCommand },
      '/local/project',
      '/home/deploy'
    );

    expect(result.success).toBe(false);
    expect(result.stage).toBe('compose');
    expect(result.error).toBe('build failed');
  });
});
