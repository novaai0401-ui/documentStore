import type { PdfObject } from './types.js';

/**
 * Decompress a FlateDecode stream using the browser-native
 * `DecompressionStream`. PDF's FlateDecode is the same algorithm as
 * HTTP's `deflate` content-encoding — zlib-wrapped raw deflate.
 *
 * No third-party zlib / pako dependency.
 */
export async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('inflate: DecompressionStream not available in this runtime');
  }
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Compress raw bytes with the same zlib-wrapped deflate algorithm PDF
 * uses for /Filter /FlateDecode. Inverse of inflate(). Used by the
 * incremental-update writer to shrink appearance + overlay streams
 * before they hit the saved file.
 */
export async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') {
    throw new Error('deflate: CompressionStream not available in this runtime');
  }
  const cs = new CompressionStream('deflate');
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(cs);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Apply each filter named in /Filter to the stream's raw bytes, in order.
 * Text filters: FlateDecode, ASCIIHexDecode, ASCII85Decode, LZWDecode,
 * RunLengthDecode. Image-only filters (DCTDecode/JPEG, JBIG2Decode,
 * JPXDecode/JPEG2000, CCITTFaxDecode, Crypt) stay un-implemented — the
 * AcroForm read path doesn't need them and the renderer wants the
 * original bytes anyway.
 */
export async function decodeStream(streamObj: PdfObject): Promise<Uint8Array> {
  if (streamObj.kind !== 'stream') throw new Error('decodeStream: not a stream');
  const filter = streamObj.dict.get('Filter');
  if (!filter || filter.kind === 'null') return streamObj.raw;

  const filterNames: string[] = [];
  if (filter.kind === 'name') filterNames.push(filter.value);
  else if (filter.kind === 'array') {
    for (const it of filter.items) {
      if (it.kind === 'name') filterNames.push(it.value);
    }
  }

  let data = streamObj.raw;
  for (const name of filterNames) {
    if (name === 'FlateDecode' || name === 'Fl') {
      data = await inflate(data);
    } else if (name === 'ASCIIHexDecode' || name === 'AHx') {
      data = asciiHexDecode(data);
    } else if (name === 'ASCII85Decode' || name === 'A85') {
      data = ascii85Decode(data);
    } else if (name === 'LZWDecode' || name === 'LZW') {
      data = lzwDecode(data);
    } else if (name === 'RunLengthDecode' || name === 'RL') {
      data = runLengthDecode(data);
    } else {
      throw new Error(`decodeStream: filter not supported: ${name}`);
    }
  }
  return data;
}

/**
 * RunLengthDecode (PDF spec §7.4.5).
 *
 * Each control byte N (0..127, 128, 129..255):
 *   - 0..127  → copy N+1 bytes literally
 *   - 128     → end of data
 *   - 129..255 → repeat the next byte (257 - N) times
 */
export function runLengthDecode(input: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < input.length) {
    const n = input[i]!;
    i++;
    if (n === 128) break;
    if (n < 128) {
      const len = n + 1;
      for (let k = 0; k < len && i < input.length; k++, i++) out.push(input[i]!);
    } else {
      const len = 257 - n;
      if (i >= input.length) break;
      const b = input[i]!;
      i++;
      for (let k = 0; k < len; k++) out.push(b);
    }
  }
  return new Uint8Array(out);
}

/**
 * LZWDecode (PDF spec §7.4.4).
 *
 * Adobe's LZW variant — variable-width codes starting at 9 bits, growing
 * by 1 every time the dictionary fills, capped at 12 bits. Code 256 = clear
 * (reset dictionary, back to 9-bit codes), code 257 = end-of-data. Codes
 * 0..255 are single-byte literals.
 *
 * Bit packing is MSB-first.
 */
export function lzwDecode(input: Uint8Array): Uint8Array {
  const out: number[] = [];
  const CLEAR = 256;
  const EOD = 257;
  const MAX_CODE = 4096;

  let dict: (number[] | null)[] = newLzwDict();
  let codeLen = 9;
  let nextCode = 258;
  let prev: number[] | null = null;
  let bitBuf = 0;
  let bitCount = 0;
  let pos = 0;

  while (pos < input.length || bitCount >= codeLen) {
    while (bitCount < codeLen && pos < input.length) {
      bitBuf = (bitBuf << 8) | input[pos]!;
      bitCount += 8;
      pos++;
    }
    if (bitCount < codeLen) break;
    const code = (bitBuf >>> (bitCount - codeLen)) & ((1 << codeLen) - 1);
    bitCount -= codeLen;

    if (code === EOD) break;
    if (code === CLEAR) {
      dict = newLzwDict();
      codeLen = 9;
      nextCode = 258;
      prev = null;
      continue;
    }

    let entry: number[];
    if (code < nextCode && dict[code]) {
      entry = dict[code]!;
    } else if (code === nextCode && prev) {
      // KwKwK case: code refers to entry being formed right now.
      entry = [...prev, prev[0]!];
    } else {
      // Corrupt stream — abort cleanly.
      break;
    }
    for (const b of entry) out.push(b);

    if (prev && nextCode < MAX_CODE) {
      dict[nextCode] = [...prev, entry[0]!];
      nextCode++;
      // Grow code length one step before we'd emit an out-of-range code.
      // Adobe's spec: switch at nextCode = 511, 1023, 2047.
      if (nextCode === (1 << codeLen) - 1 && codeLen < 12) codeLen++;
    }
    prev = entry;
  }
  return new Uint8Array(out);
}

function newLzwDict(): (number[] | null)[] {
  const d: (number[] | null)[] = new Array(4096).fill(null);
  for (let i = 0; i < 256; i++) d[i] = [i];
  return d;
}

/**
 * ASCIIHexDecode: pairs of hex digits → bytes. Whitespace ignored.
 * Terminator is '>'. Odd trailing nibble is treated as if followed by '0'.
 */
export function asciiHexDecode(input: Uint8Array): Uint8Array {
  const out: number[] = [];
  let hi = -1;
  for (let i = 0; i < input.length; i++) {
    const b = input[i]!;
    if (b === 0x3e /* '>' */) break;
    const v = hexValue(b);
    if (v < 0) continue; // whitespace or other
    if (hi < 0) hi = v;
    else { out.push((hi << 4) | v); hi = -1; }
  }
  if (hi >= 0) out.push(hi << 4);
  return new Uint8Array(out);
}

/**
 * ASCII85Decode: each group of 5 characters in base-85 encodes 4 bytes.
 * Optional leading '<~' and trailing '~>'. Special: 'z' = four 0x00 bytes.
 * A short final group is padded with 'u' (0x75) and the result truncated.
 */
export function ascii85Decode(input: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  // skip optional leading '<~'
  if (input.length >= 2 && input[0] === 0x3c && input[1] === 0x7e) i = 2;

  let group = 0;
  let count = 0;
  const flush = (n: number) => {
    while (count < 5) { group = group * 85 + 84; count++; } // pad with 'u'
    for (let k = 3; k >= 4 - n; k--) out.push((group >>> (k * 8)) & 0xff);
    group = 0;
    count = 0;
  };

  for (; i < input.length; i++) {
    const b = input[i]!;
    if (b === 0x7e /* '~' */) { // end marker '~>'
      if (count > 1) flush(count - 1);
      break;
    }
    if (b <= 0x20) continue; // whitespace
    if (b === 0x7a /* 'z' */ && count === 0) {
      out.push(0, 0, 0, 0);
      continue;
    }
    if (b < 0x21 || b > 0x75) continue; // out of range
    group = group * 85 + (b - 0x21);
    count++;
    if (count === 5) {
      for (let k = 3; k >= 0; k--) out.push((group >>> (k * 8)) & 0xff);
      group = 0;
      count = 0;
    }
  }
  if (count > 0) flush(count - 1);
  return new Uint8Array(out);
}

function hexValue(b: number): number {
  if (b >= 0x30 && b <= 0x39) return b - 0x30;
  if (b >= 0x41 && b <= 0x46) return b - 0x41 + 10;
  if (b >= 0x61 && b <= 0x66) return b - 0x61 + 10;
  return -1;
}
