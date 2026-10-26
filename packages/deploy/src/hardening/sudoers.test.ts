import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertSafeSudoersUsername,
  buildDeploySudoers,
  DEPLOY_SUDOERS_FORBIDDEN,
  DEPLOY_SUDOERS_REQUIRED,
} from './sudoers.js';

describe('buildDeploySudoers', () => {
  it('incluye la lista explícita de comandos del camino de deploy, no NOPASSWD:ALL', () => {
    const content = buildDeploySudoers('deploy');

    for (const required of DEPLOY_SUDOERS_REQUIRED) {
      expect(content, `falta ${required}`).toContain(required);
    }

    const rules = content
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim();
        return trimmed.length > 0 && !trimmed.startsWith('#');
      })
      .join('\n');

    for (const forbidden of DEPLOY_SUDOERS_FORBIDDEN) {
      expect(rules, `no debería contener ${forbidden}`).not.toContain(forbidden);
    }
    expect(rules).not.toMatch(/NOPASSWD:\s*ALL\b/);

    expect(content).toContain('deploy ALL=(ALL) NOPASSWD: FRACTAL_STATE');
    expect(content).toContain('/usr/bin/tee /etc/fractal/state.json');
    expect(content).toContain('Defaults:deploy env_keep += "DEBIAN_FRONTEND"');
  });

  it('interpola el usuario y rechaza nombres inseguros', () => {
    const content = buildDeploySudoers('deploy');
    expect(content).toContain('usermod -aG docker deploy');

    expect(() => assertSafeSudoersUsername('deploy; rm -rf /')).toThrow(
      /inválido/
    );
    expect(() => buildDeploySudoers('ALL')).toThrow(/inválido/);
    expect(() => buildDeploySudoers('../etc')).toThrow(/inválido/);
  });

  it('pasa visudo -cf (sintaxis), además del alcance', () => {
    const content = buildDeploySudoers('deploy');
    const dir = mkdtempSync(join(tmpdir(), 'fractal-sudoers-'));
    const path = join(dir, '90-fractal-deploy');

    try {
      writeFileSync(path, content, { mode: 0o440 });
      execFileSync('visudo', ['-cf', path], { encoding: 'utf8' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
