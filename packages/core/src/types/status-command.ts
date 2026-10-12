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

  /**
   * Modo exportación (opt-in, FRA-48): renderiza los diagramas del mapa de
   * progreso a archivos de imagen (SVG y/o PNG) en un directorio de salida.
   * Es independiente de `--write`/`--check`: no modifica
   * `docs/MAPA_DE_PROGRESO.md` ni participa de la guardia de CI.
   */
  export?: boolean;

  /**
   * Directorio de salida para `--export`. Por defecto `docs/progress-map/`
   * (ignorado por git; las imágenes no se commitean).
   */
  out?: string;

  /**
   * Formato de salida para `--export`: `svg`, `png` o `both`. Por defecto
   * `both`.
   */
  format?: string;
}
