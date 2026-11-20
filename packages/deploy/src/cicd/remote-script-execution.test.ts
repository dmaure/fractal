import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeployRuntime } from '@fractal/core';
import { GitHubActionsGenerator } from './github-actions-generator.js';
import { GitLabCiGenerator } from './gitlab-ci-generator.js';
import type { DeployConfig } from './types.js';

// FRA-120: el script remoto (heredoc de `ssh ... bash -s`) debe correr completo.
// `docker compose exec` sin `< /dev/null` se come el stdin de `bash -s` y el
// script se corta después de migrate con exit 0.
const RUNTIME: DeployRuntime = {
  services: ['app', 'nginx', 'db'],
  buildCommand: 'make build',
  migrateCommand: 'make migrate',
  postDeployCommands: ['make config-clear', 'make cache-clear'],
  port: 8000,
  healthcheck: { path: '/api/health' },
};

const base = {
  projectName: 'myapp',
  productionBranch: 'main',
  domain: 'app.example.com',
  targetType: 'backend-full',
  runtime: RUNTIME,
} as const;

function githubScript(): { header: string; body: string } {
  const content = new GitHubActionsGenerator().generateWorkflowContent({
    ...base,
    provider: 'github-actions',
    outputPath: 'x.yml',
  } as DeployConfig);
  const step = parse(content).jobs.deploy.steps.find((s: { name: string }) => s.name === 'Deploy to server');
  return split(step.run as string);
}

function gitlabScript(): { header: string; body: string } {
  const content = new GitLabCiGenerator().generatePipelineContent({
    ...base,
    provider: 'gitlab-ci',
    outputPath: 'x.yml',
  } as DeployConfig);
  return split(parse(content).deploy.script[0] as string);
}

function split(run: string): { header: string; body: string } {
  const lines = run.split('\n');
  const start = lines.findIndex((l) => l.includes("<< 'ENDSSH'"));
  const end = lines.findIndex((l, i) => i > start && l === 'ENDSSH');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start); // terminador válido: columna 0, sin indentar
  return { header: lines.slice(0, start + 1).join('\n'), body: lines.slice(start + 1, end).join('\n') };
}

const cases: [string, () => { header: string; body: string }][] = [
  ['GitHub Actions', githubScript],
  ['GitLab CI', gitlabScript],
];

describe.each(cases)('script remoto: %s', (_name, get) => {
  it('tiene set -euo pipefail, migrate, post-deploy y state.json, con stdin protegido', () => {
    const { body } = get();
    expect(body).toContain('set -euo pipefail');
    const execs = body.split('\n').filter((l) => l.includes('docker compose exec'));
    expect(execs.map((l) => l.trim())).toEqual([
      'docker compose exec -T app make migrate < /dev/null',
      'docker compose exec -T app make config-clear < /dev/null',
      'docker compose exec -T app make cache-clear < /dev/null',
    ]);
    expect(body).toContain('lastSuccessfulImageTag');
    expect(body).toContain('deployHistory');
  });

  function run(healthCode: string) {
    const { body } = get();
    const dir = mkdtempSync(join(tmpdir(), 'fra120-'));
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    const stub = (n: string, src: string) => {
      writeFileSync(join(bin, n), `#!/bin/bash\n${src}\n`);
      chmodSync(join(bin, n), 0o755);
    };
    // docker compose exec consume stdin como el real; el resto solo registra.
    stub('docker', `echo "docker $*" >> "${dir}/calls.log"\n[ "$2" = exec ] && cat > /dev/null\nexit 0`);
    stub('sudo', 'exec "$@"');
    stub('sleep', 'exit 0');
    stub('curl', `printf ${healthCode}`);
    const state = join(dir, 'state.json');
    const script = body
      .replaceAll('/etc/fractal/state.json', state)
      .replaceAll('/home/deploy', dir)
      .replaceAll('/var/www/myapp', dir)
      .replaceAll(/\$\{\{ secrets\.\w+ \}\}/g, 'x');
    const r = spawnSync('bash', ['-s'], {
      input: script,
      encoding: 'utf-8',
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        HOME: dir,
        IMAGE_TAG: 'abc123',
        COMMIT_SHA: 'abc123',
        GIT_BRANCH: 'main',
        DOCKER_REGISTRY: 'ghcr.io/o/r',
      },
    });
    return { r, calls: readFileSync(join(dir, 'calls.log'), 'utf-8'), state };
  }

  it('ejecutado contra stubs llega hasta el final y actualiza state.json', () => {
    const { r, calls, state } = run('200');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(calls).toContain('exec -T app make migrate');
    expect(calls).toContain('exec -T app make cache-clear');
    expect(r.stdout).toContain('Deploy state updated');
    const json = JSON.parse(readFileSync(state, 'utf-8'));
    expect(json.lastSuccessfulImageTag).toBe('abc123');
    expect(json.deployHistory).toHaveLength(1);
    expect(json.deployHistory[0]).toMatchObject({ imageTag: 'abc123', branch: 'main', healthcheck: 'passed' });
  });

  it('si el healthcheck falla, el script sale con error', () => {
    const { r } = run('500');
    expect(r.status).not.toBe(0);
  });
});
