/**
 * Bridge module: mechanisms for invoking external toolchain adapters.
 * Implements SPEC-0002: Bridge Node → toolchain del target.
 */

export {
  checkBinaryAvailable,
  ensureBinaryAvailable,
  BinaryNotAvailableError,
  type BinaryCheckResult,
} from './binary-check.js';
