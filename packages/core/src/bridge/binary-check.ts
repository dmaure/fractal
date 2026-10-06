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

/**
 * Result of a binary version check.
 */
export interface BinaryVersionCheckResult {
  sufficient: boolean;
  installedVersion?: string;
  requiredVersion: string;
  error?: string;
}

/**
 * Parses a semantic version string into major, minor, and patch components.
 * Handles common version formats: "1.2.3", "v1.2.3", "1.2", "1", "1.2.3-beta", etc.
 * 
 * @param version - Version string to parse
 * @returns Array of [major, minor, patch] or null if parsing fails
 */
function parseSemver(version: string): [number, number, number] | null {
  const cleaned = version.trim().replace(/^v/, '');
  const parts = cleaned.split(/[.-]/);
  
  if (parts.length === 0) {
    return null;
  }
  
  const major = parseInt(parts[0], 10);
  const minor = parts.length > 1 ? parseInt(parts[1], 10) : 0;
  const patch = parts.length > 2 ? parseInt(parts[2], 10) : 0;
  
  if (isNaN(major)) {
    return null;
  }
  
  return [
    major,
    isNaN(minor) ? 0 : minor,
    isNaN(patch) ? 0 : patch,
  ];
}

/**
 * Compares two semantic versions.
 * 
 * @param installed - Installed version string
 * @param required - Required version string
 * @returns true if installed >= required, false otherwise
 */
function compareVersions(installed: string, required: string): boolean {
  const installedParts = parseSemver(installed);
  const requiredParts = parseSemver(required);
  
  if (!installedParts || !requiredParts) {
    return false;
  }
  
  const [iMajor, iMinor, iPatch] = installedParts;
  const [rMajor, rMinor, rPatch] = requiredParts;
  
  if (iMajor !== rMajor) {
    return iMajor > rMajor;
  }
  if (iMinor !== rMinor) {
    return iMinor > rMinor;
  }
  return iPatch >= rPatch;
}

/**
 * Gets the version of a binary by running it with --version flag.
 * Tries common version flags in order.
 * 
 * @param binaryName - Name of the binary
 * @returns Version string or null if unable to determine
 */
function getBinaryVersion(binaryName: string): string | null {
  const versionFlags = ['--version', '-v', '-V', 'version'];
  
  for (const flag of versionFlags) {
    try {
      const output = execSync(`${binaryName} ${flag}`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000,
      });
      
      const lines = output.trim().split('\n');
      const firstLine = lines[0];
      
      const versionMatch = firstLine.match(/(\d+\.\d+(?:\.\d+)?)/);
      if (versionMatch) {
        return versionMatch[1];
      }
    } catch {
      continue;
    }
  }
  
  return null;
}

/**
 * Checks if a binary meets the minimum version requirement.
 * Framework-agnostic: does not know which specific versions are needed.
 * 
 * @param binaryName - Name of the binary to check (e.g., "node", "python")
 * @param minVersion - Minimum required version in semver format (e.g., "8.2.0")
 * @returns Result object with version check status and details
 * 
 * @example
 * const result = checkBinaryVersion("node", "18.0.0");
 * if (!result.sufficient) {
 *   console.error(`Version ${result.installedVersion} is below required ${result.requiredVersion}`);
 * }
 */
export function checkBinaryVersion(
  binaryName: string,
  minVersion: string
): BinaryVersionCheckResult {
  const availabilityCheck = checkBinaryAvailable(binaryName);
  
  if (!availabilityCheck.available) {
    return {
      sufficient: false,
      requiredVersion: minVersion,
      error: `Binary "${binaryName}" not found in PATH`,
    };
  }
  
  const installedVersion = getBinaryVersion(binaryName);
  
  if (!installedVersion) {
    return {
      sufficient: false,
      requiredVersion: minVersion,
      error: `Unable to determine version of "${binaryName}"`,
    };
  }
  
  const sufficient = compareVersions(installedVersion, minVersion);
  
  return {
    sufficient,
    installedVersion,
    requiredVersion: minVersion,
    error: sufficient
      ? undefined
      : `Binary "${binaryName}" version ${installedVersion} is below required ${minVersion}`,
  };
}

/**
 * Error thrown when a binary version is insufficient.
 * Contains user-friendly upgrade instructions.
 */
export class BinaryVersionMismatchError extends Error {
  constructor(
    public readonly binaryName: string,
    public readonly installedVersion: string | undefined,
    public readonly requiredVersion: string,
    public readonly installationHint?: string
  ) {
    const versionInfo = installedVersion
      ? `version ${installedVersion} is installed, but version ${requiredVersion} or higher is required`
      : `version ${requiredVersion} or higher is required`;
    
    const message = installationHint
      ? `Binary "${binaryName}" ${versionInfo}.\n\nUpgrade: ${installationHint}`
      : `Binary "${binaryName}" ${versionInfo}.\n\nPlease upgrade "${binaryName}" to version ${requiredVersion} or higher.`;
    
    super(message);
    this.name = 'BinaryVersionMismatchError';
  }
}

/**
 * Checks binary version and throws if insufficient.
 * This is the function to be called before invoking an adapter.
 * 
 * @param binaryName - Name of the binary to check
 * @param minVersion - Minimum required version in semver format
 * @param installationHint - Optional upgrade instructions for the user
 * @throws {BinaryNotAvailableError} If the binary is not available
 * @throws {BinaryVersionMismatchError} If the version is insufficient
 * 
 * @example
 * // Before invoking an adapter:
 * ensureBinaryVersion("node", "18.0.0", "Visit https://nodejs.org/");
 */
export function ensureBinaryVersion(
  binaryName: string,
  minVersion: string,
  installationHint?: string
): void {
  const result = checkBinaryVersion(binaryName, minVersion);
  
  if (!result.sufficient) {
    if (!result.installedVersion) {
      throw new BinaryNotAvailableError(binaryName, installationHint);
    }
    
    throw new BinaryVersionMismatchError(
      binaryName,
      result.installedVersion,
      minVersion,
      installationHint
    );
  }
}
