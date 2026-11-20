import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import type { DeployRuntime } from '@fractal/core';
import { GitHubActionsGenerator } from './github-actions-generator.js';
import { GitLabCiGenerator } from './gitlab-ci-generator.js';
import type { DeployConfig } from './types.js';

// FRA-119: los bloques multilínea (run:/script:) deben quedar bien indentados;
// si el YAML generado es inválido el CI rechaza el workflow.
const BACKEND: DeployRuntime = {
  services: ['app', 'nginx', 'db'],
  buildCommand: 'make build',
  migrateCommand: 'make migrate',
  postDeployCommands: ['make clear'],
  port: 8000,
  healthcheck: { path: '/api/health' },
};
const FRONTEND: DeployRuntime = {
  services: ['nginx'],
  buildCommand: 'make build',
  port: 80,
  healthcheck: { path: '/health.txt' },
};

type Variant = [string, Partial<DeployConfig>];
const variants: Variant[] = [
  ['backend-full', { targetType: 'backend-full', runtime: BACKEND }],
  ['frontend-static', { targetType: 'frontend-static', runtime: FRONTEND }],
  [
    'multirepo api',
    {
      targetType: 'backend-full',
      runtime: BACKEND,
      multiRepo: { role: 'api', siblingGitUrl: 'https://example.com/web.git', siblingDomain: 'app.example.com' },
    },
  ],
  [
    'multirepo web',
    {
      targetType: 'frontend-static',
      runtime: FRONTEND,
      multiRepo: { role: 'web', siblingGitUrl: 'https://example.com/api.git', siblingDomain: 'api.example.com' },
    },
  ],
];

function config(provider: 'github-actions' | 'gitlab-ci', extra: Partial<DeployConfig>): DeployConfig {
  return {
    provider,
    projectName: 'myapp',
    productionBranch: 'main',
    domain: 'app.example.com',
    outputPath: provider === 'gitlab-ci' ? '.gitlab-ci.yml' : '.github/workflows/deploy.yml',
    ...extra,
  } as DeployConfig;
}

describe('YAML generado es válido', () => {
  it.each(variants)('GitHub Actions: %s', (_name, extra) => {
    const content = new GitHubActionsGenerator().generateWorkflowContent(config('github-actions', extra));
    const doc = parse(content);
    expect(doc.jobs).toBeTruthy();
  });

  it.each(variants)('GitLab CI: %s', (_name, extra) => {
    const content = new GitLabCiGenerator().generatePipelineContent(config('gitlab-ci', extra));
    const doc = parse(content);
    expect(doc.stages ?? doc).toBeTruthy();
  });
});
