/**
 * A baseline TIFF decoder we wrote ourselves — so pdfcraft can open/convert
 * .tiff without a native canvas decode (browsers don't decode TIFF) and without
 * pulling in a heavyweight image library. Returns RGBA pixels; pair it with our
 * PNG encoder to embed in a PDF.
 *
 * Scope (covers the overwhelming majority of real-world TIFFs):
 *   • little- and big-endian
 *   • 8 bits/sample, strips (RowsPerStrip), chunky planar config
 *   • photometric: min-is-black/white grayscale, RGB, RGB+alpha, palette
 *   • compression: none (1), CCITT-not-supported, LZW (5), PackBits (32773),
 *     Deflate (8 / 32946, via fflate)
 *   • predictor: none (1) or horizontal differencing (2)
 * Anything outside this (1-bit fax, 16-bit, JPEG-in-TIFF, tiled) throws a clear
 * error so the caller can fall back / report honestly.
 */

export interface DecodedImage {
  width: number;
  height: number;
  rgba: Uint8Array;
}

const T = {
  ImageWidth: 256, ImageLength: 257, BitsPerSample: 258, Compression: 259,
  Photometric: 262, StripOffsets: 273, SamplesPerPixel: 277, RowsPerStrip: 278,
  StripByteCounts: 279, PlanarConfig: 284, Predictor: 317, ColorMap: 320,
  ExtraSamples: 338,
} as const;

interface Reader {
  u16(o: number): number;
  u32(o: number): number;
  dv: DataView;
  le: boolean;
}

function makeReader(dv: DataView, le: boolean): Reader {
  return { dv, le, u16: (o) => dv.getUint16(o, le), u32: (o) => dv.getUint32(o, le) };
}

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8 };

function readEntryValues(r: Reader, type: number, count: number, valueOffset: number): number[] {
  const size = TYPE_SIZE[type] ?? 1;
  const total = size * count;
  // Values ≤4 bytes are stored inline in the entry's value field.
  const base = total <= 4 ? valueOffset : r.u32(valueOffset);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const o = base + i * size;
    if (type === 3) out.push(r.u16(o));
    else if (type === 4) out.push(r.u32(o));
    else out.push(r.dv.getUint8(o));
  }
  return out;
}

// ── decompressors ───────────────────────────────────────────────────────────────

function packBits(src: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < src.length) {
    const n = (src[i++]! << 24) >> 24; // sign-extend
    if (n >= 0) { for (let j = 0; j <= n; j++) out.push(src[i++]!); }
    else if (n !== -128) { const b = src[i++]!; for (let j = 0; j < 1 - n; j++) out.push(b); }
  }
  return Uint8Array.from(out);
}

/** TIFF LZW (MSB-first, variable width 9→12, EarlyChange = 1). */
function lzwDecode(src: Uint8Array): Uint8Array {
  const CLEAR = 256, EOI = 257;
  const out: number[] = [];
  let bitBuf = 0, bitCount = 0, pos = 0, codeWidth = 9;
  let dict: number[][] = [];
  const reset = () => { dict = []; for (let i = 0; i < 256; i++) dict[i] = [i]; dict[CLEAR] = []; dict[EOI] = []; codeWidth = 9; };
  reset();
  const next = (): number => {
    while (bitCount < codeWidth) {
      if (pos >= src.length) return EOI;
      bitBuf = (bitBuf << 8) | src[pos++]!;
      bitCount += 8;
    }
    bitCount -= codeWidth;
    return (bitBuf >> bitCount) & ((1 << codeWidth) - 1);
  };
  let prev: number[] | null = null;
  for (;;) {
    const code = next();
    if (code === EOI) break;
    if (code === CLEAR) { reset(); prev = null; continue; }
    let entry: number[];
    if (dict[code]) entry = dict[code]!;
    else if (prev) entry = [...prev, prev[0]!];
    else break;
    for (const b of entry) out.push(b);
    if (prev) dict.push([...prev, entry[0]!]);
    prev = entry;
    // EarlyChange: widen one code before the table is actually full.
    if (dict.length + 1 >= (1 << codeWidth) && codeWidth < 12) codeWidth++;
  }
  return Uint8Array.from(out);
}

async function inflate(src: Uint8Array): Promise<Uint8Array> {
  const { unzlibSync, inflateSync } = await import('fflate');
  try { return unzlibSync(src); } catch { return inflateSync(src); }
}

async function decompressStrip(comp: number, src: Uint8Array): Promise<Uint8Array> {
  switch (comp) {
    case 1: return src;
    case 5: return lzwDecode(src);
    case 8: case 32946: return inflate(src);
    case 32773: return packBits(src);
    default: throw new Error(`Unsupported TIFF compression ${comp}`);
  }
}

// ── decode ──────────────────────────────────────────────────────────────────────

export async function decodeTiff(bytes: Uint8Array): Promise<DecodedImage> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const bom = dv.getUint16(0, false);
  const le = bom === 0x4949;
  if (!le && bom !== 0x4d4d) throw new Error('Not a TIFF (bad byte-order mark)');
  const r = makeReader(dv, le);
  if (r.u16(2) !== 42) throw new Error('Not a TIFF (bad magic)');

  const ifd = r.u32(4);
  const count = r.u16(ifd);
  const tags = new Map<number, { type: number; count: number; valueOffset: number }>();
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    tags.set(r.u16(e), { type: r.u16(e + 2), count: r.u32(e + 4), valueOffset: e + 8 });
  }
  const vals = (tag: number): number[] | null => {
    const t = tags.get(tag);
    return t ? readEntryValues(r, t.type, t.count, t.valueOffset) : null;
  };
  const one = (tag: number, def: number): number => (vals(tag)?.[0] ?? def);

  const width = one(T.ImageWidth, 0);
  const height = one(T.ImageLength, 0);
  if (!width || !height) throw new Error('TIFF: missing dimensions');
  const spp = one(T.SamplesPerPixel, 1);
  const bits = vals(T.BitsPerSample) ?? [8];
  if (bits.some((b) => b !== 8)) throw new Error('TIFF: only 8 bits/sample supported');
  const comp = one(T.Compression, 1);
  const photometric = one(T.Photometric, spp >= 3 ? 2 : 1);
  if (one(T.PlanarConfig, 1) !== 1) throw new Error('TIFF: only chunky planar config supported');
  const predictor = one(T.Predictor, 1);
  const rowsPerStrip = one(T.RowsPerStrip, height);
  const offsets = vals(T.StripOffsets) ?? [];
  const counts = vals(T.StripByteCounts) ?? [];
  const colorMap = vals(T.ColorMap);

  // Decode every strip into one contiguous chunky sample buffer.
  const rowBytes = width * spp;
  const pixels = new Uint8Array(height * rowBytes);
  let writeRow = 0;
  for (let s = 0; s < offsets.length; s++) {
    const raw = bytes.subarray(offsets[s]!, offsets[s]! + (counts[s] ?? 0));
    const data = await decompressStrip(comp, raw);
    const stripRows = Math.min(rowsPerStrip, height - writeRow);
    for (let row = 0; row < stripRows; row++) {
      const srcOff = row * rowBytes;
      const dstOff = (writeRow + row) * rowBytes;
      pixels.set(data.subarray(srcOff, srcOff + rowBytes), dstOff);
      if (predictor === 2) {
        for (let x = spp; x < rowBytes; x++) pixels[dstOff + x] = (pixels[dstOff + x]! + pixels[dstOff + x - spp]!) & 0xff;
      }
    }
    writeRow += stripRows;
  }

  // Map samples → RGBA per photometric interpretation.
  const rgba = new Uint8Array(width * height * 4);
  const whiteIsZero = photometric === 0;
  for (let i = 0; i < width * height; i++) {
    const sp = i * spp;
    const dp = i * 4;
    if (photometric === 3 && colorMap) {
      // Palette: ColorMap holds 16-bit R,R..G,G..B,B (each 1<<bits entries).
      const idx = pixels[sp]!;
      const n = colorMap.length / 3;
      rgba[dp] = colorMap[idx]! >> 8;
      rgba[dp + 1] = colorMap[n + idx]! >> 8;
      rgba[dp + 2] = colorMap[2 * n + idx]! >> 8;
      rgba[dp + 3] = 255;
    } else if (photometric === 2) {
      rgba[dp] = pixels[sp]!; rgba[dp + 1] = pixels[sp + 1]!; rgba[dp + 2] = pixels[sp + 2]!;
      rgba[dp + 3] = spp >= 4 ? pixels[sp + 3]! : 255;
    } else {
      let v = pixels[sp]!;
      if (whiteIsZero) v = 255 - v;
      rgba[dp] = v; rgba[dp + 1] = v; rgba[dp + 2] = v;
      rgba[dp + 3] = spp >= 2 ? pixels[sp + 1]! : 255;
    }
  }
  return { width, height, rgba };
}
