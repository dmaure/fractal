import { describe, it, expect } from 'vitest';
import { generateArtisan } from './artisan.js';

describe('artisan', () => {
  // El contenido completo del stub se cubre en el snapshot del árbol
  // (create-project.tree.test.ts); aquí solo aserciones de comportamiento.
  it('incluye el shebang PHP', () => {
    const result = generateArtisan();
    expect(result).toContain('#!/usr/bin/env php');
  });

  it('requiere bootstrap/app.php', () => {
    const result = generateArtisan();
    expect(result).toContain("require_once __DIR__.'/bootstrap/app.php'");
  });
});
