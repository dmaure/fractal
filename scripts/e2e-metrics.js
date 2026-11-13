#!/usr/bin/env node
/**
 * Métricas TTS / TTP del e2e de deploy (FRA-105, SPEC-0007, VISION §8).
 *
 * El workflow `deploy-e2e.yml` cronometra cada tramo del flujo del usuario y
 * deja la duración (en segundos) en variables de entorno. Este script las
 * combina en las dos métricas de producto:
 *
 *   - **TTS** (Time-to-Usable-Scaffold, objetivo < 5 min): desde que arranca
 *     `fractal new` hasta que el proyecto responde en local
 *     (`composer install` + `php artisan serve`).
 *       TTS = new + local
 *
 *   - **TTP** (Time-to-Production, objetivo < 30 min): desde que arranca
 *     `fractal new` hasta que `fractal doctor` declara sana la producción.
 *       TTP = new + deploy + doctor
 *
 * El tramo `local` NO suma al TTP: el usuario que despliega no necesita
 * levantar el proyecto en local antes. Tampoco suman el provisionado del VPS ni
 * el registro DNS: son prerrequisitos que el usuario trae (el workflow solo los
 * simula para tener un servidor descartable).
 *
 * Si falta un tramo (un step falló antes de medirlo), la métrica que lo
 * necesita queda como "no alcanzada" (`null`). Pasarse del objetivo NO falla el
 * job: se emite un `::warning::` de GitHub Actions y queda en el resumen.
 *
 * Entradas (env, enteros >= 0 en segundos; ausentes/vacías = tramo no medido):
 *   E2E_NEW_SECONDS, E2E_LOCAL_SECONDS, E2E_DEPLOY_SECONDS, E2E_DOCTOR_SECONDS
 *
 * Salidas:
 *   - resumen Markdown por stdout y, si existe, anexado a $GITHUB_STEP_SUMMARY
 *   - JSON en la ruta de `--json <ruta>` (si se pasa)
 *   - exit 0 siempre que las entradas sean válidas; exit 1 si alguna está mal
 *     formada (no es un entero >= 0).
 *
 * Uso:
 *   node scripts/e2e-metrics.js [--json <ruta>]
 */

import { appendFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Objetivos v1 de VISION.md §8, en segundos. */
export const TARGETS = Object.freeze({
  tts: 5 * 60,
  ttp: 30 * 60,
});

/** Variables de entorno de cada tramo cronometrado. */
export const SEGMENT_ENV = Object.freeze({
  new: 'E2E_NEW_SECONDS',
  local: 'E2E_LOCAL_SECONDS',
  deploy: 'E2E_DEPLOY_SECONDS',
  doctor: 'E2E_DOCTOR_SECONDS',
});

/**
 * Lee los tramos desde un objeto tipo `process.env`.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ segments: Record<string, number | null> } | { error: string }}
 */
export function parseSegments(env) {
  /** @type {Record<string, number | null>} */
  const segments = {};
  for (const [name, key] of Object.entries(SEGMENT_ENV)) {
    const raw = (env[key] ?? '').trim();
    if (raw === '') {
      segments[name] = null;
      continue;
    }
    if (!/^\d+$/.test(raw)) {
      return { error: `${key} debe ser un entero >= 0 (segundos); se recibió "${raw}".` };
    }
    segments[name] = Number(raw);
  }
  return { segments };
}

/** Suma los tramos; `null` si alguno falta. */
function sumOrNull(values) {
  return values.some((v) => v === null) ? null : values.reduce((a, b) => a + b, 0);
}

/**
 * Calcula TTS y TTP a partir de los tramos. Función pura.
 *
 * @param {Record<string, number | null>} segments
 * @param {{ tts: number, ttp: number }} [targets]
 */
export function computeMetrics(segments, targets = TARGETS) {
  const build = (seconds, target) => ({
    seconds,
    target,
    reached: seconds !== null,
    withinTarget: seconds === null ? null : seconds < target,
  });
  return {
    segments: { ...segments },
    tts: build(sumOrNull([segments.new, segments.local]), targets.tts),
    ttp: build(sumOrNull([segments.new, segments.deploy, segments.doctor]), targets.ttp),
  };
}

/** Formatea segundos como `Xm YYs` (o `—` si no hay valor). */
export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function statusLabel(metric) {
  if (!metric.reached) return '⚪ no alcanzado';
  return metric.withinTarget ? '✅ dentro del objetivo' : '⚠️ excede el objetivo';
}

/**
 * Resumen Markdown determinista (para $GITHUB_STEP_SUMMARY).
 *
 * @param {ReturnType<typeof computeMetrics>} metrics
 */
export function renderSummary(metrics) {
  const { segments, tts, ttp } = metrics;
  return [
    '## Métricas TTS / TTP (FRA-105)',
    '',
    '| Métrica | Duración | Objetivo | Estado |',
    '|---|---|---|---|',
    `| TTS — scaffold local | ${formatDuration(tts.seconds)} | < ${formatDuration(tts.target)} | ${statusLabel(tts)} |`,
    `| TTP — producción sana | ${formatDuration(ttp.seconds)} | < ${formatDuration(ttp.target)} | ${statusLabel(ttp)} |`,
    '',
    '| Tramo | Duración |',
    '|---|---|',
    `| \`fractal new\` | ${formatDuration(segments.new)} |`,
    `| Local (\`composer install\` + \`php artisan serve\`) | ${formatDuration(segments.local)} |`,
    `| \`fractal deploy\` | ${formatDuration(segments.deploy)} |`,
    `| \`fractal doctor\` hasta sano | ${formatDuration(segments.doctor)} |`,
    '',
    'TTS = new + local · TTP = new + deploy + doctor. No incluyen el provisionado del VPS ni el DNS (prerrequisitos del usuario).',
    '',
  ].join('\n');
}

/**
 * Anotaciones `::warning::` para métricas fuera de objetivo o no alcanzadas.
 *
 * @param {ReturnType<typeof computeMetrics>} metrics
 * @returns {string[]}
 */
export function warnings(metrics) {
  const out = [];
  for (const [name, metric] of [
    ['TTS', metrics.tts],
    ['TTP', metrics.ttp],
  ]) {
    if (!metric.reached) {
      out.push(`::warning::${name} no alcanzado: algún tramo no llegó a medirse (un step falló antes).`);
    } else if (!metric.withinTarget) {
      out.push(
        `::warning::${name} ${formatDuration(metric.seconds)} excede el objetivo de ${formatDuration(metric.target)}.`
      );
    }
  }
  return out;
}

/** Punto de entrada de CLI. Devuelve el exit code. */
export function main(argv = process.argv.slice(2), env = process.env) {
  const jsonIdx = argv.indexOf('--json');
  const jsonPath = jsonIdx >= 0 ? argv[jsonIdx + 1] : undefined;
  if (jsonIdx >= 0 && !jsonPath) {
    console.error('--json requiere una ruta.');
    return 1;
  }

  const parsed = parseSegments(env);
  if ('error' in parsed) {
    console.error(parsed.error);
    return 1;
  }

  const metrics = computeMetrics(parsed.segments);
  const summary = renderSummary(metrics);
  console.log(summary);
  for (const w of warnings(metrics)) console.log(w);

  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  if (jsonPath) writeFileSync(jsonPath, `${JSON.stringify(metrics, null, 2)}\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main());
}
