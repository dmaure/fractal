import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    // El render real abre un Chromium headless; le damos margen de tiempo.
    testTimeout: 60000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['dist/**', '**/*.spec.ts', '**/*.test.ts'],
    },
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.test.json',
    },
  },
});
