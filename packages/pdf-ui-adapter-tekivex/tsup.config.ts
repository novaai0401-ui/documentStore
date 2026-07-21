import { defineConfig } from 'tsup';

const BANNER = `/*! @pdfcraft/ui-adapter-tekivex — Copyright (c) 2026. All Rights Reserved. Proprietary and confidential. See LICENSE. */`;

export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['esm'],
  dts: true,
  minify: true,
  sourcemap: false,
  treeshake: true,
  clean: true,
  target: 'es2022',
  external: ['react', 'react-dom', 'tekivex-ui', '@pdfcraft/ui-react'],
  banner: { js: BANNER },
  esbuildOptions(options) {
    options.mangleProps = /^_/;
    options.legalComments = 'inline';
    options.jsx = 'automatic';
  },
});
