/**
 * Contrato del adapter frontend React + Vite (`get-contract`).
 *
 * Declara cómo se compila y se sirve el frontend; el backend arma su
 * Dockerfile y su nginx desde acá, sin conocer el stack (ADR-0017).
 */
import type { FrontendContract } from '@fractal/core';

export function getContract(): FrontendContract {
  return {
    version: '0',
    kind: 'frontend',
    target: 'react-vite',
    platform: 'web',
    description: 'SPA React con Vite',
    runtimeRequirements: {
      binaries: [{ name: 'node', minVersion: '18.0.0', displayName: 'Node.js' }],
    },
    build: {
      image: 'node:22-alpine',
      dependencyManifests: 'package*.json',
      installCommand: 'if [ -f package-lock.json ]; then npm ci; else npm install; fi',
      buildCommand: 'npm run build',
      outputDir: 'dist',
    },
    serve: 'static',
    dev: { command: 'npm run dev', port: 3000, apiProxy: '/api' },
    apiBaseEnv: 'VITE_API_URL',
  };
}
