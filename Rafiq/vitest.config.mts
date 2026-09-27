import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Pure engine modules only: they are React-free and run under Node as they are.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['src/**/engine/**/*.test.ts'] },
});
