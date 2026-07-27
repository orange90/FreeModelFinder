import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: { url: 'http://127.0.0.1:11435/' },
    },
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['app/page.tsx', 'app/lib/**/*.ts'],
      exclude: ['app/**/__tests__/**'],
      thresholds: { lines: 70 },
      reporter: ['text'],
    },
  },
});
