// Minimal types for gifenc (ships no declarations). Covers the encoder API we use.
declare module 'gifenc' {
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: unknown): number[][];
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: number[][], format?: string): Uint8Array;
  export interface GifFrameOpts { palette?: number[][]; delay?: number; transparent?: boolean; dispose?: number; repeat?: number }
  export interface GifEncoderInstance {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: GifFrameOpts): void;
    finish(): void;
    bytes(): Uint8Array;
  }
  export function GIFEncoder(opts?: unknown): GifEncoderInstance;
}
