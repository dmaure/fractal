import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { validateTargetDirectory } from './directory-validator.js';

const TEST_DIR = join(process.cwd(), 'test-temp');

function cleanTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

beforeEach(() => {
  cleanTestDir();
});

afterEach(() => {
  cleanTestDir();
});

describe('validateTargetDirectory', () => {
  it('permite crear proyecto en directorio inexistente', () => {
    const targetDir = join(TEST_DIR, 'new-project');
    const result = validateTargetDirectory(targetDir);
    
    expect(result.exists).toBe(false);
    expect(result.isEmpty).toBe(true);
    expect(result.canProceed).toBe(true);
  });
  
  it('permite crear proyecto en directorio vacío', () => {
    const targetDir = join(TEST_DIR, 'empty-dir');
    mkdirSync(targetDir, { recursive: true });
    
    const result = validateTargetDirectory(targetDir);
    
    expect(result.exists).toBe(true);
    expect(result.isEmpty).toBe(true);
    expect(result.canProceed).toBe(true);
  });
  
  it('permite crear proyecto en directorio con .git vacío', () => {
    const targetDir = join(TEST_DIR, 'git-only');
    mkdirSync(targetDir, { recursive: true });
    mkdirSync(join(targetDir, '.git', 'refs', 'heads'), { recursive: true });
    
    const result = validateTargetDirectory(targetDir);
    
    expect(result.exists).toBe(true);
    expect(result.isEmptyGitRepo).toBe(true);
    expect(result.canProceed).toBe(true);
  });
  
  it('rechaza directorio no vacío sin --force', () => {
    const targetDir = join(TEST_DIR, 'non-empty');
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(join(targetDir, 'README.md'), '# Test');
    
    const result = validateTargetDirectory(targetDir, false);
    
    expect(result.exists).toBe(true);
    expect(result.isEmpty).toBe(false);
    expect(result.canProceed).toBe(false);
    expect(result.reason).toContain('no está vacío');
    expect(result.reason).toContain('--force');
  });
  
  it('permite directorio no vacío con --force', () => {
    const targetDir = join(TEST_DIR, 'non-empty-forced');
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(join(targetDir, 'README.md'), '# Test');
    
    const result = validateTargetDirectory(targetDir, true);
    
    expect(result.exists).toBe(true);
    expect(result.isEmpty).toBe(false);
    expect(result.canProceed).toBe(true);
    expect(result.reason).toContain('--force');
  });
  
  it('rechaza ruta que existe pero no es directorio', () => {
    const targetDir = join(TEST_DIR, 'not-a-dir');
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(targetDir, 'content');
    
    const result = validateTargetDirectory(targetDir);
    
    expect(result.exists).toBe(true);
    expect(result.canProceed).toBe(false);
    expect(result.reason).toContain('no es un directorio');
  });
  
  it('rechaza directorio con .git que tiene commits', () => {
    const targetDir = join(TEST_DIR, 'git-with-history');
    mkdirSync(targetDir, { recursive: true });
    
    const headsDir = join(targetDir, '.git', 'refs', 'heads');
    mkdirSync(headsDir, { recursive: true });
    writeFileSync(join(headsDir, 'main'), 'abc123');
    
    const result = validateTargetDirectory(targetDir, false);
    
    expect(result.exists).toBe(true);
    expect(result.canProceed).toBe(false);
  });
});
