import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Versión de Fractal: la del `package.json` de `@fractal/core` (los paquetes
 * del monorepo se versionan juntos, ver `scripts/set-version.js`).
 * Desde `dist/version.js` y `src/version.ts` el package.json está en `../`.
 */
export function readVersion(): string {
  const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
  return pkg.version ?? '0.0.0';
}
