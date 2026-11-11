import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * The production CSP, read from the nginx config so there is only one copy. `vite preview` sends
 * it, so a production build can be checked locally under the real policy.
 */
function productionCsp(): string {
  const conf = readFileSync(new URL('./nginx/default.conf', import.meta.url), 'utf8');
  const csp = /add_header Content-Security-Policy "([^"]+)"/.exec(conf)?.[1];
  if (!csp) {
    throw new Error('Content-Security-Policy not found in nginx/default.conf');
  }
  return csp;
}

export default defineConfig(({ mode }) => {
  // `npm run benchmark` builds the KDF benchmark page instead of the app.
  const benchmark = mode === 'benchmark';
  return {
    plugins: [react(), tailwindcss()],
    server: {
      // Proxying keeps development same-origin, matching production, so CORS stays closed.
      proxy: {
        '/api': 'http://localhost:8080',
      },
    },
    preview: {
      headers: { 'Content-Security-Policy': productionCsp() },
    },
    build: {
      sourcemap: false,
      outDir: benchmark ? 'dist-benchmark' : 'dist',
      rollupOptions: benchmark ? { input: 'benchmark.html' } : {},
    },
    test: {
      environment: 'jsdom',
      // Argon2id at 64 MiB runs for real in these tests; slower CI machines need the headroom.
      testTimeout: 30_000,
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
    },
  };
});
