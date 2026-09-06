/**
 * Binary availability checker for external toolchain dependencies.
 * Framework-agnostic: does not know which specific binaries are needed.
 */

import { execSync } from 'child_process';

export interface BinaryCheckResult {
  available: boolean;
  path?: string;
  error?: string;
}

/**
 * Checks if a binary is available in the system PATH.
 * Uses cross-platform detection (which/where equivalent).
 * 
 * @param binaryName - Name of the binary to check (e.g., "node", "python")
 * @returns Result object with availability status and details
 * 
 * @example
 * const result = checkBinaryAvailable("somebin");
 * if (!result.available) {
 *   console.error(`Binary not found: ${binaryName}`);
 * }
 */
export function checkBinaryAvailable(binaryName: string): BinaryCheckResult {
  const isWindows = process.platform === 'win32';
  const command = isWindows ? 'where' : 'which';
  
  try {
    const output = execSync(`${command} ${binaryName}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    const path = output.trim().split('\n')[0];
    
    return {
      available: true,
      path,
    };
  } catch (error) {
    return {
      available: false,
      error: `Binary "${binaryName}" not found in PATH`,
    };
  }
}

/**
 * Error thrown when a required binary is not available.
 * Contains user-friendly installation instructions.
 */
export class BinaryNotAvailableError extends Error {
  constructor(
    public readonly binaryName: string,
    public readonly installationHint?: string
  ) {
    const message = installationHint
      ? `Binary "${binaryName}" is required but not found in PATH.\n\nInstallation: ${installationHint}`
      : `Binary "${binaryName}" is required but not found in PATH.\n\nPlease install "${binaryName}" and ensure it is available in your PATH.`;
    
    super(message);
    this.name = 'BinaryNotAvailableError';
  }
}

/**
 * Checks binary availability and throws if not found.
 * This is the function to be called before invoking an adapter.
 * 
 * @param binaryName - Name of the binary to check
 * @param installationHint - Optional installation instructions for the user
 * @throws {BinaryNotAvailableError} If the binary is not available
 * 
 * @example
 * // Before invoking an adapter:
 * ensureBinaryAvailable("targetbin", "Visit https://example.com/install/");
 */
export function ensureBinaryAvailable(
  binaryName: string,
  installationHint?: string
): void {
  const result = checkBinaryAvailable(binaryName);
  
  if (!result.available) {
    throw new BinaryNotAvailableError(binaryName, installationHint);
  }
}
