import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Kept separate from vite.config.ts so the test run doesn't load the React
// and Tailwind plugins it doesn't need. Only pure modules (domain/rules.ts,
// shared/project/rules.ts, ...) have tests; they run in Node with no DOM.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
