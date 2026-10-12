import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hasChromium, renderDiagrams } from './index.js';

/**
 * Test de render real (FRA-48). Mermaid necesita un navegador, así que este
 * test se SALTA limpiamente donde no hay Chromium lanzable (p. ej. la CI):
 * `hasChromium()` decide, y `describe.skipIf` lo reporta como skipped sin
 * romper el pipeline. Donde sí hay Chromium (entorno local con el navegador
 * preinstalado) corre de verdad.
 *
 * No snapshoteamos los bytes del PNG (el raster de Chromium no es
 * byte-reproducible entre versiones/plataformas); afirmamos sobre el string SVG
 * y sobre la firma del PNG.
 */

const chromiumAvailable = await hasChromium();

const MERMAID_FIXTURE = [
  'flowchart LR',
  '    A["Inicio<br/>paso 1"]',
  '    B["Fin"]',
  '    A --> B',
  '    classDef done fill:#2e7d32,color:#fff;',
  '    class B done;',
].join('\n');

describe.skipIf(!chromiumAvailable)('progress-export · render real', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'progress-export-'));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('exporta un SVG determinístico y un PNG válido', async () => {
    const svgPath = join(dir, 'diagrama.svg');
    const pngPath = join(dir, 'diagrama.png');

    const written = await renderDiagrams([
      {
        id: 'fractal-fixture',
        label: 'Fixture',
        mermaid: MERMAID_FIXTURE,
        targets: [
          { format: 'svg', path: svgPath },
          { format: 'png', path: pngPath },
        ],
      },
    ]);

    expect(written.map((w) => w.format)).toEqual(['svg', 'png']);

    const svg = await readFile(svgPath, 'utf-8');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');

    // Firma de archivo PNG (\x89PNG).
    const png = await readFile(pngPath);
    expect(png.subarray(0, 4).toString('latin1')).toBe('\x89PNG');
    expect(png.byteLength).toBeGreaterThan(0);
  });

  it('con deterministicIds, dos renders del mismo texto dan el mismo SVG', async () => {
    const a = join(dir, 'a.svg');
    const b = join(dir, 'b.svg');
    await renderDiagrams([
      { id: 'fractal-fixture', label: 'A', mermaid: MERMAID_FIXTURE, targets: [{ format: 'svg', path: a }] },
    ]);
    await renderDiagrams([
      { id: 'fractal-fixture', label: 'B', mermaid: MERMAID_FIXTURE, targets: [{ format: 'svg', path: b }] },
    ]);
    expect(await readFile(a, 'utf-8')).toBe(await readFile(b, 'utf-8'));
  });
});

describe('progress-export · hasChromium', () => {
  it('devuelve un booleano sin lanzar', async () => {
    expect(typeof (await hasChromium())).toBe('boolean');
  });
});
