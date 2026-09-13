import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ManifestManager } from '@fractal/deploy';

const TEST_DIR = join(process.cwd(), 'test-e2e-coordination');

function cleanTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

beforeEach(() => {
  cleanTestDir();
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  cleanTestDir();
});

function createInitialManifest(dir: string, role: 'api' | 'web') {
  const content = `role: ${role}
sibling:
  git_url: null
  domain: null
orchestration_state: pending
`;
  writeFileSync(join(dir, 'fractal.project.yml'), content, 'utf-8');
}

describe('E2E: Coordinación multirepo - primer deploy', () => {
  it('flujo completo: pending → recolección → resolved', () => {
    // 1. Simular proyecto multirepo recién generado con fractal new
    createInitialManifest(TEST_DIR, 'api');
    
    const manager = new ManifestManager(TEST_DIR);
    
    // 2. Verificar estado inicial
    const initialRead = manager.read();
    expect(initialRead.exists).toBe(true);
    expect(initialRead.manifest?.orchestration_state).toBe('pending');
    expect(initialRead.manifest?.sibling.git_url).toBeNull();
    expect(initialRead.manifest?.sibling.domain).toBeNull();
    
    // 3. Simular primer deploy con recolección de datos del hermano
    const updateResult = manager.updateWithSiblingInfo({
      gitUrl: 'https://github.com/user/web.git',
      domain: 'web.example.com',
    });
    
    expect(updateResult.success).toBe(true);
    
    // 4. Verificar que el manifiesto quedó en resolved
    const finalRead = manager.read();
    expect(finalRead.manifest?.orchestration_state).toBe('resolved');
    expect(finalRead.manifest?.sibling.git_url).toBe('https://github.com/user/web.git');
    expect(finalRead.manifest?.sibling.domain).toBe('web.example.com');
  });

  it('flujo de reconfiguración: resolved → --reconfigure → resolved con nuevos valores', () => {
    // 1. Simular manifiesto ya resuelto de un primer deploy anterior
    const resolvedContent = `role: web
sibling:
  git_url: https://github.com/user/api-old.git
  domain: api-old.example.com
orchestration_state: resolved
`;
    writeFileSync(join(TEST_DIR, 'fractal.project.yml'), resolvedContent, 'utf-8');
    
    const manager = new ManifestManager(TEST_DIR);
    
    // 2. Verificar estado inicial
    const initialRead = manager.read();
    expect(initialRead.manifest?.orchestration_state).toBe('resolved');
    expect(initialRead.manifest?.sibling.domain).toBe('api-old.example.com');
    
    // 3. Simular fractal deploy --reconfigure con nuevos valores
    const updateResult = manager.updateWithSiblingInfo({
      gitUrl: 'https://github.com/user/api-new.git',
      domain: 'api-new.example.com',
    });
    
    expect(updateResult.success).toBe(true);
    
    // 4. Verificar que los valores fueron actualizados
    const finalRead = manager.read();
    expect(finalRead.manifest?.orchestration_state).toBe('resolved');
    expect(finalRead.manifest?.sibling.git_url).toBe('https://github.com/user/api-new.git');
    expect(finalRead.manifest?.sibling.domain).toBe('api-new.example.com');
  });

  it('segundo deploy: no pregunta si ya está resolved', () => {
    // 1. Simular manifiesto ya resuelto
    const resolvedContent = `role: api
sibling:
  git_url: https://github.com/user/web.git
  domain: web.example.com
orchestration_state: resolved
`;
    writeFileSync(join(TEST_DIR, 'fractal.project.yml'), resolvedContent, 'utf-8');
    
    const manager = new ManifestManager(TEST_DIR);
    const read = manager.read();
    
    // 2. El deploy command detectará orchestration_state: resolved
    // y NO preguntará por la info del hermano (askSiblingInfo = false)
    expect(read.manifest?.orchestration_state).toBe('resolved');
    
    // Los valores del hermano ya están disponibles para configurar
    // las variables cruzadas sin preguntar de nuevo
    expect(read.manifest?.sibling.git_url).toBe('https://github.com/user/web.git');
    expect(read.manifest?.sibling.domain).toBe('web.example.com');
  });

  it('manifiesto en .gitignore: si se pierde, vuelve a preguntar', () => {
    // 1. Simular un VPS reconstruido donde se clonó el repo
    // pero el manifiesto no está (estaba en .gitignore)
    const manager = new ManifestManager(TEST_DIR);
    const read = manager.read();
    
    expect(read.exists).toBe(false);
    
    // 2. fractal new habrá generado un manifiesto con pending
    // (o el deploy detectará que no hay manifiesto y asumirá que no es multirepo)
    // Degradación aceptable: simplemente vuelve a preguntar
    createInitialManifest(TEST_DIR, 'api');
    
    const read2 = manager.read();
    expect(read2.exists).toBe(true);
    expect(read2.manifest?.orchestration_state).toBe('pending');
  });
});

describe('E2E: Roles y variables cruzadas', () => {
  it('api recibe info de web para configurar CORS', () => {
    createInitialManifest(TEST_DIR, 'api');
    
    const manager = new ManifestManager(TEST_DIR);
    
    // Deploy del api/ con info del web/
    manager.updateWithSiblingInfo({
      gitUrl: 'https://github.com/org/project-web.git',
      domain: 'app.example.com',
    });
    
    const manifest = manager.read().manifest!;
    
    // Las variables que se configurarían:
    // CORS_ALLOWED_ORIGIN=https://app.example.com
    // SANCTUM_STATEFUL_DOMAINS=app.example.com
    expect(manifest.role).toBe('api');
    expect(manifest.sibling.domain).toBe('app.example.com');
  });

  it('web recibe info de api para configurar API_URL', () => {
    createInitialManifest(TEST_DIR, 'web');
    
    const manager = new ManifestManager(TEST_DIR);
    
    // Deploy del web/ con info del api/
    manager.updateWithSiblingInfo({
      gitUrl: 'https://github.com/org/project-api.git',
      domain: 'api.example.com',
    });
    
    const manifest = manager.read().manifest!;
    
    // La variable que se configurará (horneada en build time por Vite):
    // VITE_API_URL=https://api.example.com
    expect(manifest.role).toBe('web');
    expect(manifest.sibling.domain).toBe('api.example.com');
  });
});
