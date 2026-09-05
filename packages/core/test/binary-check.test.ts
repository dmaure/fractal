/**
 * Tests for binary availability checker.
 * Covers scenarios with and without binary in PATH.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import {
  checkBinaryAvailable,
  ensureBinaryAvailable,
  BinaryNotAvailableError,
} from '../src/bridge/binary-check.js';

// Mock child_process
vi.mock('child_process');

describe('checkBinaryAvailable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns available true when binary exists in PATH', () => {
    const mockPath = '/usr/local/bin/python';
    vi.mocked(execSync).mockReturnValue(mockPath);

    const result = checkBinaryAvailable('python');

    expect(result.available).toBe(true);
    expect(result.path).toBe(mockPath);
    expect(result.error).toBeUndefined();
  });

  it('returns available false when binary does not exist', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('not found');
    });

    const result = checkBinaryAvailable('nonexistent');

    expect(result.available).toBe(false);
    expect(result.path).toBeUndefined();
    expect(result.error).toBe('Binary "nonexistent" not found in PATH');
  });

  it('uses "which" command on Unix-like systems', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux' });

    vi.mocked(execSync).mockReturnValue('/usr/bin/php');
    checkBinaryAvailable('php');

    expect(execSync).toHaveBeenCalledWith(
      'which php',
      expect.objectContaining({
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    );

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('uses "where" command on Windows', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    vi.mocked(execSync).mockReturnValue('C:\\Program Files\\PHP\\php.exe');
    checkBinaryAvailable('php');

    expect(execSync).toHaveBeenCalledWith(
      'where php',
      expect.objectContaining({
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    );

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('handles multiple paths by returning the first one', () => {
    const multiplePaths = '/usr/local/bin/node\n/usr/bin/node\n';
    vi.mocked(execSync).mockReturnValue(multiplePaths);

    const result = checkBinaryAvailable('node');

    expect(result.available).toBe(true);
    expect(result.path).toBe('/usr/local/bin/node');
  });

  it('adds no perceptible delay when binary exists', () => {
    vi.mocked(execSync).mockReturnValue('/usr/bin/test');

    const startTime = Date.now();
    checkBinaryAvailable('test');
    const duration = Date.now() - startTime;

    // Should complete in less than 100ms
    expect(duration).toBeLessThan(100);
  });
});

describe('BinaryNotAvailableError', () => {
  it('creates error with binary name and default message', () => {
    const error = new BinaryNotAvailableError('python');

    expect(error.name).toBe('BinaryNotAvailableError');
    expect(error.binaryName).toBe('python');
    expect(error.message).toContain('Binary "python" is required');
    expect(error.message).toContain('not found in PATH');
    expect(error.message).toContain('Please install "python"');
  });

  it('creates error with installation hint when provided', () => {
    const hint = 'Visit https://example.com/install/';
    const error = new BinaryNotAvailableError('somebin', hint);

    expect(error.binaryName).toBe('somebin');
    expect(error.installationHint).toBe(hint);
    expect(error.message).toContain('Binary "somebin" is required');
    expect(error.message).toContain('Installation: ' + hint);
  });
});

describe('ensureBinaryAvailable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not throw when binary is available', () => {
    vi.mocked(execSync).mockReturnValue('/usr/bin/php');

    expect(() => {
      ensureBinaryAvailable('php');
    }).not.toThrow();
  });

  it('throws BinaryNotAvailableError when binary is missing', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('not found');
    });

    expect(() => {
      ensureBinaryAvailable('python');
    }).toThrow(BinaryNotAvailableError);
  });

  it('includes installation hint in error when provided', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('not found');
    });

    const hint = 'Run: apt-get install somepackage';

    try {
      ensureBinaryAvailable('somebin', hint);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(BinaryNotAvailableError);
      expect((error as BinaryNotAvailableError).installationHint).toBe(hint);
      expect((error as BinaryNotAvailableError).message).toContain(hint);
    }
  });
});

describe('Framework-agnostic compliance (Article II)', () => {
  it('does not contain framework-specific terms in binary-check module', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const filePath = path.join(
      process.cwd(),
      'src/bridge/binary-check.ts'
    );
    const content = await fs.readFile(filePath, 'utf-8');

    // Verify no framework-specific terms
    const forbiddenTerms = [
      'laravel',
      'artisan',
      'eloquent',
      'blade',
      'composer',
      'rails',
      'activerecord',
      'gemfile',
      'bundler',
      'erb',
    ];

    const foundTerms = forbiddenTerms.filter((term) =>
      content.toLowerCase().includes(term)
    );

    expect(foundTerms).toEqual([]);
  });
});
