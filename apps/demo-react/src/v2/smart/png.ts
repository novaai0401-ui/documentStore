/**
 * A tiny, dependency-light PNG encoder (RGBA → PNG). We own this so we can turn
 * pixels we decode ourselves (e.g. from our TIFF decoder) into bytes pdf-lib can
 * embed, without a canvas — so it works in Node and in workers too. DEFLATE is
 * delegated to fflate (already a dependency), the rest (chunking, CRC, the IHDR
 * colour model) is ours.
 */
import { crc32 } from './zip.js';

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  // CRC is over the type + data bytes.
  const crcInput = out.subarray(4, 8 + data.length);
  dv.setUint32(8 + data.length, crc32(crcInput));
  return out;
}

/** Encode an RGBA pixel buffer (row-major, 4 bytes/pixel) as a PNG. */
export async function encodePngRGBA(width: number, height: number, rgba: Uint8Array): Promise<Uint8Array> {
  const { zlibSync } = await import('fflate');
  const stride = width * 4;
  // PNG scanlines: one filter byte (0 = None) per row, then the row's RGBA.
  const raw = new Uint8Array(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + stride)] = 0;
    raw.set(rgba.subarray(y * stride, y * stride + stride), y * (1 + stride) + 1);
  }
  const idatData = zlibSync(raw, { level: 6 });

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', idatData), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
