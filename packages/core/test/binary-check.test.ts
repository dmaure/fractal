/**
 * Tests for binary availability checker.
 * Covers scenarios with and without binary in PATH.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import {
  checkBinaryAvailable,
  ensureBinaryAvailable,
  BinaryNotAvailableError,
  checkBinaryVersion,
  ensureBinaryVersion,
  BinaryVersionMismatchError,
  checkRuntimeRequirements,
  ensureRuntimeRequirements,
} from '../src/bridge/binary-check.js';
import type { RuntimeRequirements } from '../src/types/adapter-contract.js';

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
    vi.mocked(execFileSync).mockReturnValue(mockPath);

    const result = checkBinaryAvailable('python');

    expect(result.available).toBe(true);
    expect(result.path).toBe(mockPath);
    expect(result.error).toBeUndefined();
  });

  it('returns available false when binary does not exist', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
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

    vi.mocked(execFileSync).mockReturnValue('/usr/bin/php');
    checkBinaryAvailable('php');

    expect(execFileSync).toHaveBeenCalledWith(
      'which',
      ['php'],
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

    vi.mocked(execFileSync).mockReturnValue('C:\\Program Files\\PHP\\php.exe');
    checkBinaryAvailable('php');

    expect(execFileSync).toHaveBeenCalledWith(
      'where',
      ['php'],
      expect.objectContaining({
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    );

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('handles multiple paths by returning the first one', () => {
    const multiplePaths = '/usr/local/bin/node\n/usr/bin/node\n';
    vi.mocked(execFileSync).mockReturnValue(multiplePaths);

    const result = checkBinaryAvailable('node');

    expect(result.available).toBe(true);
    expect(result.path).toBe('/usr/local/bin/node');
  });

  it('adds no perceptible delay when binary exists', () => {
    vi.mocked(execFileSync).mockReturnValue('/usr/bin/test');

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
    vi.mocked(execFileSync).mockReturnValue('/usr/bin/php');

    expect(() => {
      ensureBinaryAvailable('php');
    }).not.toThrow();
  });

  it('throws BinaryNotAvailableError when binary is missing', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('not found');
    });

    expect(() => {
      ensureBinaryAvailable('python');
    }).toThrow(BinaryNotAvailableError);
  });

  it('includes installation hint in error when provided', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
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

describe('checkBinaryVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns sufficient true when installed version meets requirement', () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce('/usr/bin/node')
      .mockReturnValueOnce('v18.16.0');

    const result = checkBinaryVersion('node', '18.0.0');

    expect(result.sufficient).toBe(true);
    expect(result.installedVersion).toBe('18.16.0');
    expect(result.requiredVersion).toBe('18.0.0');
    expect(result.error).toBeUndefined();
  });

  it('returns sufficient false when installed version is below requirement', () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce('/usr/bin/python')
      .mockReturnValueOnce('Python 3.8.5');

    const result = checkBinaryVersion('python', '3.10.0');

    expect(result.sufficient).toBe(false);
    expect(result.installedVersion).toBe('3.8.5');
    expect(result.requiredVersion).toBe('3.10.0');
    expect(result.error).toContain('version 3.8.5 is below required 3.10.0');
  });

  it('returns sufficient false when binary is not found', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('not found');
    });

    const result = checkBinaryVersion('nonexistent', '1.0.0');

    expect(result.sufficient).toBe(false);
    expect(result.installedVersion).toBeUndefined();
    expect(result.requiredVersion).toBe('1.0.0');
    expect(result.error).toContain('not found in PATH');
  });

  it('handles version strings without patch number', () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce('/usr/bin/ruby')
      .mockReturnValueOnce('ruby 3.2');

    const result = checkBinaryVersion('ruby', '3.0');

    expect(result.sufficient).toBe(true);
    expect(result.installedVersion).toBe('3.2');
  });

  it('handles version strings with only major version', () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce('/usr/bin/go')
      .mockReturnValueOnce('go version go1.21');

    const result = checkBinaryVersion('go', '1.20');

    expect(result.sufficient).toBe(true);
  });

  it('handles version strings with "v" prefix', () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce('/usr/bin/node')
      .mockReturnValueOnce('v20.10.0');

    const result = checkBinaryVersion('node', 'v20.0.0');

    expect(result.sufficient).toBe(true);
  });

  it('handles version strings with pre-release tags', () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce('/usr/bin/tool')
      .mockReturnValueOnce('2.5.0-beta.1');

    const result = checkBinaryVersion('tool', '2.4.0');

    expect(result.sufficient).toBe(true);
  });

  it('returns error when version cannot be determined', () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce('/usr/bin/tool')
      .mockReturnValue('Some tool output without version');

    const result = checkBinaryVersion('tool', '1.0.0');

    expect(result.sufficient).toBe(false);
    expect(result.error).toContain('Unable to determine version');
  });

  it('correctly compares major version differences', () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce('/usr/bin/tool')
      .mockReturnValueOnce('1.9.9');

    const result = checkBinaryVersion('tool', '2.0.0');

    expect(result.sufficient).toBe(false);
  });

  it('correctly compares minor version differences', () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce('/usr/bin/tool')
      .mockReturnValueOnce('3.4.9');

    const result = checkBinaryVersion('tool', '3.5.0');

    expect(result.sufficient).toBe(false);
  });

  it('correctly compares patch version differences', () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce('/usr/bin/tool')
      .mockReturnValueOnce('2.1.2');

    const result = checkBinaryVersion('tool', '2.1.3');

    expect(result.sufficient).toBe(false);
  });

  it('accepts exact version match', () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce('/usr/bin/tool')
      .mockReturnValueOnce('5.3.1');

    const result = checkBinaryVersion('tool', '5.3.1');

    expect(result.sufficient).toBe(true);
  });

  it('tries multiple version flags when first fails', () => {
    const mockExec = vi.mocked(execFileSync);
    mockExec
      .mockReturnValueOnce('/usr/bin/tool')
      .mockImplementationOnce(() => {
        throw new Error('--version not supported');
      })
      .mockReturnValueOnce('tool version 2.5.0');

    const result = checkBinaryVersion('tool', '2.0.0');

    expect(result.sufficient).toBe(true);
    expect(mockExec).toHaveBeenCalledWith('tool', ['--version'], expect.any(Object));
    expect(mockExec).toHaveBeenCalledWith('tool', ['-v'], expect.any(Object));
  });
});

describe('BinaryVersionMismatchError', () => {
  it('creates error with version details', () => {
    const error = new BinaryVersionMismatchError('python', '3.8.0', '3.10.0');

    expect(error.name).toBe('BinaryVersionMismatchError');
    expect(error.binaryName).toBe('python');
    expect(error.installedVersion).toBe('3.8.0');
    expect(error.requiredVersion).toBe('3.10.0');
    expect(error.message).toContain('version 3.8.0 is installed');
    expect(error.message).toContain('version 3.10.0 or higher is required');
  });

  it('handles undefined installed version', () => {
    const error = new BinaryVersionMismatchError('tool', undefined, '2.0.0');

    expect(error.installedVersion).toBeUndefined();
    expect(error.message).toContain('version 2.0.0 or higher is required');
    expect(error.message).not.toContain('is installed');
  });

  it('includes upgrade hint when provided', () => {
    const hint = 'Visit https://example.com/upgrade/';
    const error = new BinaryVersionMismatchError('tool', '1.5.0', '2.0.0', hint);

    expect(error.installationHint).toBe(hint);
    expect(error.message).toContain('Upgrade: ' + hint);
  });
});

describe('ensureBinaryVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not throw when version is sufficient', () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce('/usr/bin/node')
      .mockReturnValueOnce('v18.16.0');

    expect(() => {
      ensureBinaryVersion('node', '18.0.0');
    }).not.toThrow();
  });

  it('throws BinaryVersionMismatchError when version is insufficient', () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce('/usr/bin/python')
      .mockReturnValueOnce('Python 3.8.5');

    expect(() => {
      ensureBinaryVersion('python', '3.10.0');
    }).toThrow(BinaryVersionMismatchError);
  });

  it('throws BinaryNotAvailableError when binary is missing', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('not found');
    });

    expect(() => {
      ensureBinaryVersion('nonexistent', '1.0.0');
    }).toThrow(BinaryNotAvailableError);
  });

  it('includes upgrade hint in error when provided', () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce('/usr/bin/tool')
      .mockReturnValueOnce('1.5.0');

    const hint = 'Run: npm install -g tool@latest';

    try {
      ensureBinaryVersion('tool', '2.0.0', hint);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(BinaryVersionMismatchError);
      expect((error as BinaryVersionMismatchError).installationHint).toBe(hint);
      expect((error as BinaryVersionMismatchError).message).toContain(hint);
    }
  });

  it('throws BinaryNotAvailableError with hint when binary is missing', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('not found');
    });

    const hint = 'Visit https://example.com/install/';

    try {
      ensureBinaryVersion('tool', '1.0.0', hint);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(BinaryNotAvailableError);
      expect((error as BinaryNotAvailableError).installationHint).toBe(hint);
    }
  });
});

describe('checkRuntimeRequirements (SPEC-0006 AC-2 integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns allSatisfied true when all binaries meet requirements', () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce('/usr/bin/node')
      .mockReturnValueOnce('v18.16.0')
      .mockReturnValueOnce('/usr/bin/npm')
      .mockReturnValueOnce('9.5.0');

    const requirements: RuntimeRequirements = {
      binaries: [
        { name: 'node', minVersion: '18.0.0', displayName: 'Node.js' },
        { name: 'npm', minVersion: '9.0.0', displayName: 'npm' },
      ],
    };

    const result = checkRuntimeRequirements(requirements);

    expect(result.allSatisfied).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].satisfied).toBe(true);
    expect(result.results[0].binaryName).toBe('node');
    expect(result.results[0].displayName).toBe('Node.js');
    expect(result.results[0].installedVersion).toBe('18.16.0');
    expect(result.results[1].satisfied).toBe(true);
    expect(result.results[1].binaryName).toBe('npm');
  });

  it('returns allSatisfied false when any binary is insufficient', () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce('/usr/bin/php')
      .mockReturnValueOnce('PHP 8.1.0')
      .mockReturnValueOnce('/usr/bin/composer')
      .mockReturnValueOnce('Composer version 2.5.0');

    const requirements: RuntimeRequirements = {
      binaries: [
        { name: 'php', minVersion: '8.2.0' },
        { name: 'composer', minVersion: '2.5.0' },
      ],
    };

    const result = checkRuntimeRequirements(requirements);

    expect(result.allSatisfied).toBe(false);
    expect(result.results[0].satisfied).toBe(false);
    expect(result.results[0].binaryName).toBe('php');
    expect(result.results[0].installedVersion).toBe('8.1.0');
    expect(result.results[0].requiredVersion).toBe('8.2.0');
    expect(result.results[0].error).toContain('8.1.0 is below required 8.2.0');
    expect(result.results[1].satisfied).toBe(true);
  });

  it('returns allSatisfied false when any binary is missing', () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce('/usr/bin/ruby')
      .mockReturnValueOnce('ruby 3.2.0')
      .mockImplementation(() => {
        throw new Error('not found');
      });

    const requirements: RuntimeRequirements = {
      binaries: [
        { name: 'ruby', minVersion: '3.0.0' },
        { name: 'bundler', minVersion: '2.3.0' },
      ],
    };

    const result = checkRuntimeRequirements(requirements);

    expect(result.allSatisfied).toBe(false);
    expect(result.results[0].satisfied).toBe(true);
    expect(result.results[1].satisfied).toBe(false);
    expect(result.results[1].binaryName).toBe('bundler');
    expect(result.results[1].error).toContain('not found in PATH');
  });

  it('handles empty binaries list', () => {
    const requirements: RuntimeRequirements = {
      binaries: [],
    };

    const result = checkRuntimeRequirements(requirements);

    expect(result.allSatisfied).toBe(true);
    expect(result.results).toHaveLength(0);
  });
});

describe('ensureRuntimeRequirements (SPEC-0006 AC-2 enforcement)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not throw when all binaries are satisfied', () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce('/usr/bin/node')
      .mockReturnValueOnce('v18.16.0')
      .mockReturnValueOnce('/usr/bin/npm')
      .mockReturnValueOnce('9.5.0');

    const requirements: RuntimeRequirements = {
      binaries: [
        { name: 'node', minVersion: '18.0.0' },
        { name: 'npm', minVersion: '9.0.0' },
      ],
    };

    expect(() => {
      ensureRuntimeRequirements(requirements);
    }).not.toThrow();
  });

  it('throws on first insufficient binary', () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce('/usr/bin/php')
      .mockReturnValueOnce('PHP 8.1.0');

    const requirements: RuntimeRequirements = {
      binaries: [
        { name: 'php', minVersion: '8.2.0' },
        { name: 'composer', minVersion: '2.5.0' },
      ],
    };

    expect(() => {
      ensureRuntimeRequirements(requirements);
    }).toThrow(BinaryVersionMismatchError);
  });

  it('throws on first missing binary', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('not found');
    });

    const requirements: RuntimeRequirements = {
      binaries: [
        { name: 'nonexistent', minVersion: '1.0.0' },
      ],
    };

    expect(() => {
      ensureRuntimeRequirements(requirements);
    }).toThrow(BinaryNotAvailableError);
  });

  it('includes installation hint in error', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('not found');
    });

    const requirements: RuntimeRequirements = {
      binaries: [
        { name: 'tool', minVersion: '1.0.0' },
      ],
    };

    const hint = 'Visit https://example.com/install';

    try {
      ensureRuntimeRequirements(requirements, hint);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(BinaryNotAvailableError);
      expect((error as BinaryNotAvailableError).installationHint).toBe(hint);
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
