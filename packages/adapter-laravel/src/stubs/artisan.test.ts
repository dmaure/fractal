import { describe, it, expect } from 'vitest';
import { generateArtisan } from './artisan.js';

describe('artisan', () => {
  it('genera el stub de artisan', () => {
    const result = generateArtisan();
    expect(result).toMatchSnapshot();
  });

  it('incluye el shebang PHP', () => {
    const result = generateArtisan();
    expect(result).toContain('#!/usr/bin/env php');
  });

  it('requiere bootstrap/app.php', () => {
    const result = generateArtisan();
    expect(result).toContain("require_once __DIR__.'/bootstrap/app.php'");
  });
});
