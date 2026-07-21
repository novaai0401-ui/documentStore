/**
 * Browser shim for Node's `crypto`. The `gridstorm` ESM bundle does
 * `import { webcrypto } from 'crypto'`; in the browser the global `crypto` object
 * IS the WebCrypto API (same surface as Node's `webcrypto`), so we re-export it.
 * Aliased in vite.config.ts so the browser build resolves cleanly.
 */
export const webcrypto: Crypto = globalThis.crypto;
export default { webcrypto: globalThis.crypto };
