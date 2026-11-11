/**
 * Plumbing del pack de convenciones (agnóstico de framework, Artículo II).
 *
 * Reexporta los helpers pequeños que rescata SPEC-0007 del plumbing: escritura
 * segura de rutas (AC-4), escritura atómica (AC-5), escritura del pack con
 * `--dry-run` (AC-6) y el gate de contrato FDL (AC-1). El contenido del pack
 * (texto específico del stack) NO vive acá: lo provee el adapter.
 *
 * @see SPEC-0007
 */

export {
  resolveSafePackPath,
  PackPathError,
  type PackPathErrorReason,
} from './path-safety.js';

export {
  writeFileAtomic,
  type AtomicWriteFsDeps,
} from './atomic-write.js';

export {
  writePack,
  type PackFile,
  type WritePackOptions,
} from './write-pack.js';

export {
  assertPackFdlValid,
  collectPackFdlViolations,
  isFdlPackFile,
  PackFdlValidationError,
  type PackFdlViolation,
} from './validate-pack-fdl.js';
