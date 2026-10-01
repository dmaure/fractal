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

  /**
   * Modo validación (dry-run) para CI: regenera los diagramas en memoria y NO
   * escribe ningún archivo. Sale con código 0 si `docs/MAPA_DE_PROGRESO.md`
   * está sincronizado con `docs/progress.json`, y con código != 0 (con mensaje
   * accionable) si está desactualizado o si faltan/están invertidos los
   * marcadores de auto-generación (SPEC-0031 AC-4/AC-5, FRA-45).
   */
  check?: boolean;
}
