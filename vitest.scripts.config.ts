import { defineConfig } from 'vitest/config';

/**
 * Config de vitest a nivel raíz, acotada a los dev-scripts del repo
 * (`scripts/`). Los paquetes del monorepo tienen su propia config y corren vía
 * `pnpm -r test`; esta cubre las herramientas de repo como `progress-map.js`.
 */
export default defineConfig({
  test: {
    include: ['scripts/**/*.test.{js,mjs,ts}'],
    environment: 'node',
  },
});
