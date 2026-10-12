# ADR-0015: Exportación de los diagramas del mapa de progreso a SVG/PNG

**Estado:** Aceptado
**Fecha:** 2026-10-12
**Decisores:** Diego
**Relacionado con:** FRA-48, SPEC-0031, ADR-0002

---

## Contexto

El mapa de progreso (`docs/MAPA_DE_PROGRESO.md`) contiene dos diagramas
**Mermaid** auto-generados desde `docs/progress.json` por `@fractal/core`
(`packages/core/src/commands/progress-map.ts`): el Diagrama 1 (hitos,
`flowchart LR`) y el Diagrama 2 (capacidades, `flowchart TD`, solo si hay
bloque `capacidades`). GitHub los renderiza de forma nativa en el documento.

FRA-48 pide poder **exportar esos diagramas como imágenes** (SVG y PNG), por
ejemplo para pegarlos en una presentación o en un reporte fuera de GitHub.

Mermaid es una librería de navegador/DOM: necesita layout real (`getBBox`,
etc.), así que no existe un renderer puro de Node (jsdom no alcanza). Hay que
decidir **cómo** producir las imágenes, dónde viven las dependencias pesadas y
cómo se prueba, sin volver flaky la guardia de CI ni acoplar el core agnóstico.

Alternativas consideradas:

**(a) `mermaid` + `playwright-core` contra un Chromium del entorno** (elegida)
- El texto Mermaid lo sigue produciendo `@fractal/core` (sin cambios); un
  Chromium headless carga el bundle de `mermaid` y genera el SVG; el PNG se
  rasteriza sacándole una captura al nodo `<svg>` ya renderizado en el MISMO
  navegador.
- La captura de Chromium maneja bien las etiquetas con `<br/>` (que Mermaid
  dibuja como `<foreignObject>` HTML), que es justo lo que usan varios nodos
  del mapa (p. ej. FDL).
- `playwright-core` no descarga navegador; se usa el Chromium ya preinstalado
  del entorno. El bundle de Mermaid se inyecta OFFLINE desde `node_modules`
  (no desde una CDN).
- `mermaid.initialize({ deterministicIds: true, ... })` hace el SVG estable y
  snapshoteable.

**(b) `@mermaid-js/mermaid-cli` (`mmdc`)**
- Una sola herramienta hace Mermaid -> SVG y -> PNG, pero arrastra su propio
  Puppeteer y su propia descarga de Chromium, y acopla el flujo a spawnear un
  binario externo. Árbol de dependencias más pesado y menos control.

**(c) SVG hecho a mano desde `progress.json` (sin navegador, sin Mermaid)**
- Totalmente offline y determinístico, pero requiere reimplementar el layout
  de grafos. Trivial para el Diagrama 1 (cadena lineal), **difícil** para el
  Diagrama 2 (subgraphs + aristas arbitrarias). Además duplicaría la fuente de
  verdad de los diagramas, que hoy es el texto Mermaid.

**(d) SVG con Mermaid + rasterización con `@resvg/resvg-js` o `sharp`**
- Evita el navegador para el paso de raster, pero esos rasterizadores suelen
  **no** soportar `<foreignObject>`, así que romperían las etiquetas con
  `<br/>`. Igual se necesita un navegador para producir el SVG.

---

## Decisión

Elegimos la **opción (a)**: renderizar con `mermaid` + `playwright-core` sobre
el Chromium preinstalado, PNG vía captura del `<svg>`.

Detalles de diseño:

1. **Superficie de CLI (opt-in):** una bandera nueva en `fractal status`,
   separada de `--write`/`--check` y sin tocar su comportamiento ni la guardia
   de CI:
   - `--export` (dispara la exportación),
   - `--out <dir>` (directorio de salida; por defecto `docs/progress-map/`),
   - `--format svg|png|both` (por defecto `both`).
   Archivos de salida: `mapa-hitos.svg`/`.png` (Diagrama 1) y
   `mapa-capacidades.svg`/`.png` (Diagrama 2, solo si hay `capacidades`).

2. **Ubicación de las dependencias:** `mermaid` y `playwright-core` viven en un
   paquete dedicado **`@fractal/progress-export`**, no en `@fractal/core`. El
   core sigue produciendo solo TEXTO Mermaid con stdlib pura; su CLI carga el
   renderer de forma **perezosa** (`import()` dinámico) solo cuando se usa
   `--export`. Así el camino normal del CLI no arrastra Chromium/Mermaid y se
   respeta el Artículo II (el renderer es agnóstico de framework).

3. **Salidas no se commitean:** el directorio por defecto se agrega a
   `.gitignore`. Los PNG de Chromium **no son byte-reproducibles** entre
   versiones/plataformas; commitearlos haría flaky cualquier guardia. Las
   imágenes se regeneran bajo demanda. En GitHub los diagramas se siguen viendo
   vía los bloques Mermaid del documento (que sí se versionan).

4. **Testing:** las partes puras (extracción del texto Mermaid, parseo de
   `--format`, construcción de rutas, filtrado por formato, ausencia de
   `capacidades`) se testean sin navegador en `@fractal/core`. El render real
   se prueba en `@fractal/progress-export` **gateado por `hasChromium()`**:
   corre donde hay Chromium (local) y se **saltea limpiamente** donde no lo hay
   (la CI de GitHub), por lo que el job de tests no necesita instalar un
   navegador ni se edita ningún workflow. Se snapshotea/afirma sobre el **string
   SVG**, nunca sobre los bytes del PNG.

---

## Consecuencias

### Positivas
- Exportación offline, reutilizando el texto Mermaid que ya existe (una sola
  fuente de verdad de los diagramas).
- `@fractal/core` sigue liviano y stdlib-puro en su generación de texto.
- La CI queda verde sin cambios en los workflows ni imágenes versionadas.
- Las etiquetas con `<br/>` se rasterizan bien (vía Chromium).

### Negativas
- La exportación depende de un Chromium disponible en el entorno; sin él,
  `--export` falla con un mensaje accionable (y el test de render se saltea).
- Se suma un paquete nuevo al monorepo (`@fractal/progress-export`) y sus
  dependencias (`mermaid`, `playwright-core`) al árbol de instalación.

### Neutras / a monitorear
- Si en el futuro se quisieran imágenes versionadas y verificadas por CI,
  habría que resolver antes la no-reproducibilidad del raster (p. ej. fijar
  versión de Chromium y tolerancias de diff), fuera del alcance de FRA-48.

---

## Notas

Un ADR no se edita después de ser aceptado. Si la decisión cambia, se crea un
ADR nuevo que lo reemplaza y se actualiza el campo Estado de este.
