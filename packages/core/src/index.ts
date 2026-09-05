/**
 * @fractal/core
 * 
 * Core de Fractal: CLI, FDL, orquestación.
 * Agnóstico de framework (Artículo II).
 */

export {
  invokeAdapter,
  type AdapterResult,
  type AdapterSuccess,
  type AdapterFailure,
  type InvokeAdapterOptions
} from './adapter-bridge.js';
