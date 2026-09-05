import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { newCommand } from './new.js';
import type { NewCommandOptions } from '../types/new-command.js';

const TEST_DIR = join(process.cwd(), 'test-integration');

function cleanTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

beforeEach(() => {
  cleanTestDir();
  mkdirSync(TEST_DIR, { recursive: true });
  vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit called');
  }) as any);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanTestDir();
  vi.restoreAllMocks();
});

describe('newCommand', () => {
  it('acepta proyecto con topología vía flag', async () => {
    const projectName = 'test-project';
    const options: NewCommandOptions = {
      topology: 'monolith',
      force: false,
    };
    
    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);
    
    await newCommand(projectName, options);
    
    process.chdir(originalCwd);
    
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Parámetros validados')
    );
  });
  
  it('acepta cada topología válida', async () => {
    const topologies: Array<'monolith' | 'monorepo' | 'multirepo'> = [
      'monolith',
      'monorepo',
      'multirepo',
    ];
    
    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);
    
    for (const topology of topologies) {
      vi.clearAllMocks();
      
      await newCommand(`test-${topology}`, { topology });
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(topology)
      );
    }
    
    process.chdir(originalCwd);
  });
  
  it('rechaza topología inválida', async () => {
    const projectName = 'test-invalid';
    const options: NewCommandOptions = {
      topology: 'invalid' as any,
    };
    
    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);
    
    await expect(async () => {
      await newCommand(projectName, options);
    }).rejects.toThrow('process.exit called');
    
    process.chdir(originalCwd);
    
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Topología inválida')
    );
  });
  
  it('aborta si directorio no está vacío sin --force', async () => {
    const projectName = 'non-empty-project';
    const targetPath = join(TEST_DIR, projectName);
    
    mkdirSync(targetPath, { recursive: true });
    writeFileSync(join(targetPath, 'existing.txt'), 'content');
    
    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);
    
    await expect(async () => {
      await newCommand(projectName, { topology: 'monolith' });
    }).rejects.toThrow('process.exit called');
    
    process.chdir(originalCwd);
    
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('no está vacío')
    );
  });
  
  it('procede con --force sobre directorio no vacío', async () => {
    const projectName = 'forced-project';
    const targetPath = join(TEST_DIR, projectName);
    
    mkdirSync(targetPath, { recursive: true });
    writeFileSync(join(targetPath, 'existing.txt'), 'content');
    
    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);
    
    await newCommand(projectName, { topology: 'monolith', force: true });
    
    process.chdir(originalCwd);
    
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Parámetros validados')
    );
  });
  
  it('permite proyecto en directorio con solo .git vacío', async () => {
    const projectName = 'git-project';
    const targetPath = join(TEST_DIR, projectName);
    
    mkdirSync(join(targetPath, '.git', 'refs', 'heads'), { recursive: true });
    
    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);
    
    await newCommand(projectName, { topology: 'monolith' });
    
    process.chdir(originalCwd);
    
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Parámetros validados')
    );
  });
});
