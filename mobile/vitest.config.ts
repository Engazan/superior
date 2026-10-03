import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(import.meta.dirname, '../desktop/src/shared') },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
