import { defineConfig } from 'tsup';

const BANNER = `/*! @pdfcraft/ui-react — Copyright (c) 2026. All Rights Reserved. Proprietary and confidential. See LICENSE. */`;

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  minify: true,
  sourcemap: false,
  treeshake: true,
  clean: true,
  external: ['react', 'react-dom', '@pdfcraft/engine', '@pdfcraft/form-schema'],
  banner: { js: BANNER },
  esbuildOptions(options) {
    options.mangleProps = /^_/;
    options.legalComments = 'inline';
    // JSX runtime
    options.jsx = 'automatic';
  },
});
