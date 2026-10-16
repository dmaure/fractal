import { describe, it, expect, vi } from 'vitest';
import { uploadAndStartContainers } from './deploy.js';

/**
 * Tests del helper de arranque del runtime (FRA-70, FRA-71): sube el proyecto al
 * VPS, genera un cert temporal autofirmado para el arranque (FRA-71) y ejecuta
 * `docker compose up -d --build`. El cliente se mockea; no se abre ninguna
 * conexión real.
 */
describe('uploadAndStartContainers (FRA-70, FRA-71)', () => {
  it('sube el proyecto, genera el cert de arranque y arranca los contenedores', async () => {
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

    // Dos comandos: primero el cert temporal (FRA-71), luego el compose up.
    expect(executeCommand).toHaveBeenCalledTimes(2);

    const [bootstrapCmd] = executeCommand.mock.calls[0];
    expect(bootstrapCmd).toContain('test -f /home/deploy/docker/nginx/ssl/fullchain.pem');
    expect(bootstrapCmd).toContain('openssl req -x509 -nodes -newkey rsa:2048 -days 365');
    expect(bootstrapCmd).toContain('/home/deploy/docker/nginx/ssl/privkey.pem');

    // Se construye la imagen en el servidor (--build) en el mismo directorio.
    const [composeCmd] = executeCommand.mock.calls[1];
    expect(composeCmd).toBe('cd /home/deploy && docker compose up -d --build');
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

  it('reporta la etapa de compose si falla la generación del cert de arranque', async () => {
    const uploadDirectory = vi.fn().mockResolvedValue({ success: true });
    const executeCommand = vi.fn().mockResolvedValue({
      success: false,
      stdout: '',
      stderr: 'openssl failed',
    });

    const result = await uploadAndStartContainers(
      { uploadDirectory, executeCommand },
      '/local/project',
      '/home/deploy'
    );

    expect(result.success).toBe(false);
    expect(result.stage).toBe('compose');
    expect(result.error).toBe('openssl failed');
    // Falla en el cert de arranque: no se intenta el compose up.
    expect(executeCommand).toHaveBeenCalledTimes(1);
  });

  it('reporta la etapa de compose si falla docker compose up', async () => {
    const uploadDirectory = vi.fn().mockResolvedValue({ success: true });
    const executeCommand = vi
      .fn()
      // Cert de arranque OK...
      .mockResolvedValueOnce({ success: true, stdout: '', stderr: '' })
      // ...pero el compose up falla.
      .mockResolvedValueOnce({ success: false, stdout: '', stderr: 'build failed' });

    const result = await uploadAndStartContainers(
      { uploadDirectory, executeCommand },
      '/local/project',
      '/home/deploy'
    );

    expect(result.success).toBe(false);
    expect(result.stage).toBe('compose');
    expect(result.error).toBe('build failed');
    expect(executeCommand).toHaveBeenCalledTimes(2);
  });
});
