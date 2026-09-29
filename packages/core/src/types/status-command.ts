/**
 * Opciones del comando `fractal status`.
 */
export interface StatusCommandOptions {
  /**
   * Modo escritura: además del resumen en terminal, regenera de forma
   * idempotente el Diagrama 1 y el Diagrama 2 de `docs/MAPA_DE_PROGRESO.md`
   * desde `docs/progress.json` (SPEC-0031 AC-3, FRA-47).
   */
  write?: boolean;
}
