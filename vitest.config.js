import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [path.resolve(__dirname, './tests/setup.js')],
    include: [
      'tests/**/*.{test,spec}.{js,mjs,cjs}'
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 20000
  }
});
