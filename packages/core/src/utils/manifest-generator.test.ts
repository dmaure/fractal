import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateManifest } from './manifest-generator.js';

const TEST_DIR = join(process.cwd(), 'test-manifest');

function cleanTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

beforeEach(() => {
  cleanTestDir();
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  cleanTestDir();
});

describe('generateManifest', () => {
  it('genera manifiesto para rol api', () => {
    const repoDir = join(TEST_DIR, 'api-repo');
    mkdirSync(repoDir, { recursive: true });
    
    generateManifest(repoDir, 'api');
    
    const manifestPath = join(repoDir, 'fractal.project.yml');
    expect(existsSync(manifestPath)).toBe(true);
    
    const content = readFileSync(manifestPath, 'utf-8');
    expect(content).toContain('role: api');
    expect(content).toContain('git_url: null');
    expect(content).toContain('domain: null');
    expect(content).toContain('orchestration_state: pending');
  });
  
  it('genera manifiesto para rol web', () => {
    const repoDir = join(TEST_DIR, 'web-repo');
    mkdirSync(repoDir, { recursive: true });
    
    generateManifest(repoDir, 'web');
    
    const manifestPath = join(repoDir, 'fractal.project.yml');
    expect(existsSync(manifestPath)).toBe(true);
    
    const content = readFileSync(manifestPath, 'utf-8');
    expect(content).toContain('role: web');
    expect(content).toContain('git_url: null');
    expect(content).toContain('domain: null');
    expect(content).toContain('orchestration_state: pending');
  });
  
  it('genera archivo con formato YAML válido', () => {
    const repoDir = join(TEST_DIR, 'yaml-test');
    mkdirSync(repoDir, { recursive: true });
    
    generateManifest(repoDir, 'api');
    
    const manifestPath = join(repoDir, 'fractal.project.yml');
    const content = readFileSync(manifestPath, 'utf-8');
    
    // Verificar estructura básica de YAML
    const lines = content.split('\n');
    expect(lines[0]).toMatch(/^role: (api|web)$/);
    expect(lines[1]).toBe('sibling:');
    expect(lines[2]).toMatch(/^\s+git_url: null$/);
    expect(lines[3]).toMatch(/^\s+domain: null$/);
    expect(lines[4]).toMatch(/^orchestration_state: pending$/);
  });
  
  it('sobrescribe manifiesto existente', () => {
    const repoDir = join(TEST_DIR, 'overwrite-test');
    mkdirSync(repoDir, { recursive: true });
    
    // Generar primer manifiesto
    generateManifest(repoDir, 'api');
    const manifestPath = join(repoDir, 'fractal.project.yml');
    let content = readFileSync(manifestPath, 'utf-8');
    expect(content).toContain('role: api');
    
    // Generar segundo manifiesto con otro rol
    generateManifest(repoDir, 'web');
    content = readFileSync(manifestPath, 'utf-8');
    expect(content).toContain('role: web');
    expect(content).not.toContain('role: api');
  });
});
