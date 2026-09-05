/**
 * @fractal/core
 * 
 * CLI, FDL, y orquestación del generador.
 * Agnóstico de framework (Artículo II).
 */

export {
  LockManager,
  LockError,
  withLock,
  type LockInfo,
} from './lock/lock-manager.js';

export {
  withTimeout,
  createTimeoutWrapper,
  TimeoutError,
  DEFAULT_TIMEOUT_MS,
  type TimeoutOptions,
} from './bridge/timeout.js';
