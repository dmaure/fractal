/**
 * Tests de resolución segura de rutas del pack (SPEC-0007 AC-4).
 *
 * Un caso por motivo de rechazo (`..`, absoluto, escape de root) más un caso
 * válido aceptado.
 */

import { describe, it, expect } from 'vitest';
import { resolve, join } from 'node:path';
import { resolveSafePackPath, PackPathError } from './path-safety.js';

const ROOT = resolve('/tmp/fractal-pack-root');

describe('resolveSafePackPath', () => {
  it('acepta una ruta relativa simple contenida en el root', () => {
    const abs = resolveSafePackPath(ROOT, 'fractal/domain.fdl.json');
    expect(abs).toBe(join(ROOT, 'fractal', 'domain.fdl.json'));
  });

  it('rechaza una ruta con segmento ".."', () => {
    try {
      resolveSafePackPath(ROOT, '../evil.txt');
      throw new Error('no lanzó');
    } catch (error) {
      expect(error).toBeInstanceOf(PackPathError);
      const e = error as PackPathError;
      expect(e.reason).toBe('parent-traversal');
      expect(e.offendingPath).toBe('../evil.txt');
      expect(e.message).toContain('../evil.txt');
    }
  });

  it('rechaza una ruta absoluta', () => {
    try {
      resolveSafePackPath(ROOT, '/etc/passwd');
      throw new Error('no lanzó');
    } catch (error) {
      expect(error).toBeInstanceOf(PackPathError);
      const e = error as PackPathError;
      expect(e.reason).toBe('absolute');
      expect(e.offendingPath).toBe('/etc/passwd');
      expect(e.message).toContain('/etc/passwd');
    }
  });

  it('rechaza una ruta que escapa del root aunque no empiece con ".."', () => {
    // `..` embebido en el medio: nested/../../escape sale del root.
    try {
      resolveSafePackPath(ROOT, 'nested/../../escape.txt');
      throw new Error('no lanzó');
    } catch (error) {
      expect(error).toBeInstanceOf(PackPathError);
      const e = error as PackPathError;
      // El segmento `..` se detecta primero (fail-fast).
      expect(['parent-traversal', 'escapes-root']).toContain(e.reason);
      expect(e.message).toContain('nested/../../escape.txt');
    }
  });
});
