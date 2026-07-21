import { defineConfig } from 'tsup';

/**
 * Build config for @pdfcraft/parser.
 *
 * - `minify: true` collapses whitespace and mangles short identifiers
 *   so the published bundle is one-line and hard to read.
 * - `mangleProps: /^_/` mangles every property starting with `_`,
 *   hiding internal implementation details from anyone inspecting
 *   node_modules/.
 * - `sourcemap: false` keeps original variable names from leaking via
 *   .map files.
 * - The banner survives minification and stays at the top of the
 *   output — copyright notice that travels with the file even if
 *   someone tries to vendor it.
 */
const BANNER = `/*! @pdfcraft/parser — Copyright (c) 2026. All Rights Reserved. Proprietary and confidential. See LICENSE. */`;

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  minify: true,
  sourcemap: false,
  treeshake: true,
  clean: true,
  banner: { js: BANNER },
  esbuildOptions(options) {
    options.mangleProps = /^_/;
    options.legalComments = 'inline';
  },
});
