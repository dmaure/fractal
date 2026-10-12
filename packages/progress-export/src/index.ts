import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium, type Browser, type Page } from 'playwright-core';

/**
 * Renderer del mapa de progreso (FRA-48).
 *
 * Toma el texto Mermaid que ya produce `@fractal/core` (Diagrama 1 de hitos y
 * Diagrama 2 de capacidades) y lo exporta a SVG y/o PNG.
 *
 * Decisión (ver docs/adr/0015): el SVG se genera cargando la librería `mermaid`
 * dentro de un Chromium headless manejado por `playwright-core`; el PNG se
 * rasteriza sacándole una captura al nodo `<svg>` ya renderizado en el MISMO
 * navegador. Esto maneja correctamente las etiquetas con `<br/>` (que Mermaid
 * dibuja como `<foreignObject>` HTML), que los rasterizadores puros de SVG
 * suelen no soportar.
 *
 * El bundle de Mermaid se inyecta OFFLINE desde node_modules (no desde una CDN),
 * y el Chromium es el que ya está preinstalado en el entorno (no se corre
 * `playwright install`). Este paquete concentra las dependencias pesadas
 * (`mermaid`, `playwright-core`) para que `@fractal/core` siga siendo stdlib
 * puro en su generación de texto.
 */

const require = createRequire(import.meta.url);

/** Formatos de imagen soportados. */
export type RenderFormat = 'svg' | 'png';

/** Un archivo a escribir para un diagrama, con su formato y ruta destino. */
export interface RenderTarget {
  format: RenderFormat;
  path: string;
}

/** Una petición de render: un diagrama y los archivos que debe producir. */
export interface RenderRequest {
  /** Id determinístico para el render de Mermaid (afecta los ids del SVG). */
  id: string;
  /** Etiqueta legible (p. ej. "Diagrama 1 — hitos"). */
  label: string;
  /** Texto Mermaid crudo (sin las cercas ```mermaid). */
  mermaid: string;
  /** Archivos a producir para este diagrama. */
  targets: RenderTarget[];
}

/** Un archivo efectivamente escrito. */
export interface RenderedFile {
  label: string;
  format: RenderFormat;
  path: string;
}

/** Subconjunto de la API de Mermaid que usamos dentro del navegador. */
interface MermaidApi {
  initialize(config: Record<string, unknown>): void;
  render(id: string, text: string): Promise<{ svg: string }>;
}

/**
 * Lanza un Chromium headless. Prioriza el que resuelve `playwright-core` a
 * partir de `PLAYWRIGHT_BROWSERS_PATH`; si no lo encuentra, cae al binario
 * preinstalado del entorno (o al que indique `FRACTAL_CHROMIUM_EXECUTABLE`).
 * Nunca descarga un navegador.
 */
async function launchChromium(): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true });
  } catch (primaryError) {
    const fallback =
      process.env.FRACTAL_CHROMIUM_EXECUTABLE ??
      (process.env.PLAYWRIGHT_BROWSERS_PATH
        ? `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium`
        : undefined);
    if (!fallback) throw primaryError;
    return await chromium.launch({ headless: true, executablePath: fallback });
  }
}

/**
 * Indica si hay un Chromium lanzable en este entorno. Útil para que los tests
 * de render se salten limpiamente donde no hay navegador (p. ej. la CI), sin
 * romper el pipeline.
 */
export async function hasChromium(): Promise<boolean> {
  let browser: Browser | undefined;
  try {
    browser = await launchChromium();
    return true;
  } catch {
    return false;
  } finally {
    await browser?.close();
  }
}

/** Ruta al bundle UMD de Mermaid dentro de node_modules (carga offline). */
function mermaidBundlePath(): string {
  return require.resolve('mermaid/dist/mermaid.min.js');
}

/**
 * Prepara una página con el bundle de Mermaid cargado e inicializado de forma
 * determinística (`deterministicIds: true`) para que el SVG sea estable y
 * snapshoteable.
 */
async function preparePage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.setContent(
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<style>body{margin:0;background:#ffffff;}</style></head>' +
      '<body><div id="container"></div></body></html>'
  );
  const bundle = await readFile(mermaidBundlePath(), 'utf-8');
  await page.addScriptTag({ content: bundle });
  await page.evaluate(() => {
    const mermaid = (globalThis as unknown as { mermaid: MermaidApi }).mermaid;
    mermaid.initialize({
      startOnLoad: false,
      deterministicIds: true,
      securityLevel: 'loose',
      htmlLabels: true,
      flowchart: { htmlLabels: true },
    });
  });
  return page;
}

/**
 * Renderiza un texto Mermaid a un string SVG dentro de la página dada.
 * Exportada para poder snapshotear el SVG en tests (gateados por `hasChromium`).
 */
export async function renderMermaidToSvg(
  page: Page,
  mermaidText: string,
  id: string
): Promise<string> {
  return page.evaluate(
    async ({ text, renderId }) => {
      const mermaid = (globalThis as unknown as { mermaid: MermaidApi }).mermaid;
      const { svg } = await mermaid.render(renderId, text);
      return svg;
    },
    { text: mermaidText, renderId: id }
  );
}

/** Rasteriza un SVG a PNG sacándole una captura al nodo `<svg>` en la página. */
async function svgToPng(page: Page, svg: string, path: string): Promise<void> {
  await page.evaluate((markup) => {
    const doc = (globalThis as unknown as {
      document: { getElementById(id: string): { innerHTML: string } | null };
    }).document;
    const container = doc.getElementById('container');
    if (container) container.innerHTML = markup;
  }, svg);
  const node = page.locator('#container svg').first();
  await node.screenshot({ path, omitBackground: false });
}

/**
 * Renderiza cada petición a los formatos pedidos en un único Chromium headless.
 * Devuelve la lista de archivos escritos. El llamador es responsable de que el
 * directorio destino exista.
 */
export async function renderDiagrams(
  requests: RenderRequest[]
): Promise<RenderedFile[]> {
  const written: RenderedFile[] = [];
  const browser = await launchChromium();
  try {
    const page = await preparePage(browser);
    for (const req of requests) {
      const svg = await renderMermaidToSvg(page, req.mermaid, req.id);
      for (const target of req.targets) {
        if (target.format === 'svg') {
          await writeFile(target.path, svg, 'utf-8');
        } else {
          await svgToPng(page, svg, target.path);
        }
        written.push({ label: req.label, format: target.format, path: target.path });
      }
    }
    return written;
  } finally {
    await browser.close();
  }
}
