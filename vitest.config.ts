import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/setup/no-network.ts'],
    include: ['{apps,packages}/*/src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'apps/mobile/**'],
  },
});
