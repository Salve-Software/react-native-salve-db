import { defineConfig, type PluginOption } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Builds ui/ into public/ — the same static folder server.ts already serves via express.static.
 *
 * `react()`'s types come from the `vite@8` this package depends on directly, while `tailwindcss()`
 * and `vitest/config` resolve against the `vite@7` hoisted for an unrelated workspace (`example`'s
 * RN harness) — same plugin protocol at runtime, but TS sees two incompatible `Plugin` types. The
 * cast below is scoped to that mismatch; it doesn't relax anything else in this config.
 */
export default defineConfig({
  root: 'ui',
  plugins: [react() as unknown as PluginOption, tailwindcss()],
  esbuild: {
    jsx: 'automatic',
  },
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/vitest-setup.ts'],
  },
});
