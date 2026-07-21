import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Client-side routes (/docs, /app) are served by one SPA. Many static hosts —
// including Render — don't reliably honour a `_redirects` SPA rewrite, so emit a
// physical index.html under each route directory at build time. Then /docs and
// /app resolve as real files regardless of any host rewrite config.
function spaRoutes(routes: string[]): Plugin {
  return {
    name: 'spa-route-pages',
    apply: 'build',
    closeBundle() {
      const dist = resolve(__dirname, 'dist');
      let index: string;
      try { index = readFileSync(resolve(dist, 'index.html'), 'utf8'); } catch { return; }
      for (const r of routes) {
        // Cover both clean-URL directory serving (/docs → /docs/index.html) and
        // hosts that map /docs → /docs.html.
        mkdirSync(resolve(dist, r), { recursive: true });
        writeFileSync(resolve(dist, r, 'index.html'), index);
        writeFileSync(resolve(dist, `${r}.html`), index);
      }
    },
  };
}

// `base` controls the prefix Vite stamps on every emitted asset URL.
// On Render this app is served at /app/ behind the landing page, so all
// /assets/… need to be /app/assets/…. Pass VITE_BASE at build time to
// flip it. Local `pnpm dev` keeps the default `/`.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), spaRoutes(['docs', 'app'])],
  resolve: {
    alias: {
      // gridstorm's browser ESM does `import { webcrypto } from 'crypto'`; in the
      // browser that's just the global WebCrypto API. Shim it so the build (and
      // dev) resolve without Node's `crypto`.
      crypto: resolve(__dirname, 'src/shims/node-crypto.ts'),
    },
  },
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
  // The office build worker is a module worker that code-splits its heavy deps
  // (SheetJS) into a separate chunk, which the default `iife` worker format
  // can't emit — `es` workers support multi-chunk output.
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // pdf-lib is no longer in the v2 runtime — chunk rule kept dormant
          // for the brief case where a downstream pulls it in transitively.
          if (id.includes('node_modules/pdf-lib')) return 'vendor-pdf-lib';
          if (id.includes('node_modules/pdfjs-dist') && !id.includes('worker')) return 'vendor-pdfjs';
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'vendor-react';
        },
      },
    },
  },
});
