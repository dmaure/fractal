import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Config de vitest a nivel raíz, acotada a los dev-scripts del repo
 * (`scripts/`). Los paquetes del monorepo tienen su propia config y corren vía
 * `pnpm -r test`; esta cubre las herramientas de repo como `progress-map.js`.
 *
 * El wrapper `scripts/progress-map.js` importa la lógica de dominio desde
 * `@fractal/core/progress-map`. Para que los tests corran contra el CÓDIGO
 * FUENTE (TypeScript, transformado por vitest) sin depender de un build previo
 * de `packages/core/dist`, se aliasa el subpath a su fuente. En runtime real
 * (`node scripts/progress-map.js`) Node resuelve el paquete compilado.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@fractal/core/progress-map': fileURLToPath(
        new URL('./packages/core/src/commands/progress-map.ts', import.meta.url)
      ),
    },
  },
  test: {
    include: ['scripts/**/*.test.{js,mjs,ts}'],
    environment: 'node',
  },
});
