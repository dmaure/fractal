import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TARGETS,
  parseSegments,
  computeMetrics,
  formatDuration,
  renderSummary,
  warnings,
  main,
} from './e2e-metrics.js';

const fullEnv = {
  E2E_NEW_SECONDS: '12',
  E2E_LOCAL_SECONDS: '48',
  E2E_DEPLOY_SECONDS: '540',
  E2E_DOCTOR_SECONDS: '20',
};

describe('parseSegments', () => {
  it('lee los cuatro tramos como enteros', () => {
    expect(parseSegments(fullEnv)).toEqual({
      segments: { new: 12, local: 48, deploy: 540, doctor: 20 },
    });
  });

  it('un tramo ausente o vacío queda como null', () => {
    const { segments } = parseSegments({ E2E_NEW_SECONDS: '5', E2E_DEPLOY_SECONDS: ' ' });
    expect(segments).toEqual({ new: 5, local: null, deploy: null, doctor: null });
  });

  it('rechaza valores que no son enteros >= 0', () => {
    for (const bad of ['-1', '1.5', 'abc', '10s']) {
      const r = parseSegments({ ...fullEnv, E2E_DEPLOY_SECONDS: bad });
      expect(r).toHaveProperty('error');
      expect(r.error).toContain('E2E_DEPLOY_SECONDS');
    }
  });
});

describe('computeMetrics', () => {
  it('TTS = new + local y TTP = new + deploy + doctor (local no suma al TTP)', () => {
    const m = computeMetrics({ new: 12, local: 48, deploy: 540, doctor: 20 });
    expect(m.tts).toEqual({ seconds: 60, target: TARGETS.tts, reached: true, withinTarget: true });
    expect(m.ttp).toEqual({ seconds: 572, target: TARGETS.ttp, reached: true, withinTarget: true });
  });

  it('marca fuera de objetivo cuando se iguala o supera el target', () => {
    const m = computeMetrics({ new: 0, local: 300, deploy: 1700, doctor: 100 });
    expect(m.tts.withinTarget).toBe(false);
    expect(m.ttp.withinTarget).toBe(false);
  });

  it('si falta un tramo, la métrica que lo necesita no se alcanza', () => {
    const m = computeMetrics({ new: 10, local: 30, deploy: 600, doctor: null });
    expect(m.tts.reached).toBe(true);
    expect(m.ttp).toEqual({ seconds: null, target: TARGETS.ttp, reached: false, withinTarget: null });
  });

  it('los objetivos por defecto son los de VISION §8 (5 y 30 min)', () => {
    expect(TARGETS).toEqual({ tts: 300, ttp: 1800 });
  });
});

describe('formatDuration', () => {
  it('formatea minutos y segundos con padding', () => {
    expect(formatDuration(0)).toBe('0m 00s');
    expect(formatDuration(65)).toBe('1m 05s');
    expect(formatDuration(1800)).toBe('30m 00s');
    expect(formatDuration(null)).toBe('—');
  });
});

describe('renderSummary / warnings', () => {
  it('resumen estable con todas las métricas alcanzadas', () => {
    const m = computeMetrics(parseSegments(fullEnv).segments);
    expect(renderSummary(m)).toMatchSnapshot();
    expect(warnings(m)).toEqual([]);
  });

  it('resumen estable con TTP no alcanzado', () => {
    const m = computeMetrics({ new: 12, local: 48, deploy: null, doctor: null });
    expect(renderSummary(m)).toMatchSnapshot();
    expect(warnings(m)).toEqual([
      '::warning::TTP no alcanzado: algún tramo no llegó a medirse (un step falló antes).',
    ]);
  });

  it('advierte cuando una métrica excede el objetivo', () => {
    const m = computeMetrics({ new: 60, local: 300, deploy: 1800, doctor: 5 });
    expect(warnings(m)).toEqual([
      '::warning::TTS 6m 00s excede el objetivo de 5m 00s.',
      '::warning::TTP 31m 05s excede el objetivo de 30m 00s.',
    ]);
  });
});

describe('main', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'e2e-metrics-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it('escribe el JSON y anexa el resumen a GITHUB_STEP_SUMMARY', async () => {
    const jsonPath = join(dir, 'metrics.json');
    const summaryPath = join(dir, 'summary.md');
    const code = main(['--json', jsonPath], { ...fullEnv, GITHUB_STEP_SUMMARY: summaryPath });
    expect(code).toBe(0);
    const json = JSON.parse(await readFile(jsonPath, 'utf8'));
    expect(json.tts.seconds).toBe(60);
    expect(json.ttp.seconds).toBe(572);
    expect(await readFile(summaryPath, 'utf8')).toContain('## Métricas TTS / TTP (FRA-105)');
  });

  it('exit 0 aunque falten tramos (no falla el job)', () => {
    expect(main([], {})).toBe(0);
  });

  it('exit 1 ante una entrada mal formada o --json sin ruta', () => {
    expect(main([], { E2E_NEW_SECONDS: 'x' })).toBe(1);
    expect(main(['--json'], fullEnv)).toBe(1);
  });
});
