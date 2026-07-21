import { describe, it, expect } from 'vitest';
import { unzlibSync } from 'fflate';
import { encodeApng, type ApngFrame } from './apng.js';

/** Minimal PNG/APNG chunk reader for verification. */
function readChunks(bytes: Uint8Array): { type: string; data: Uint8Array; crcOk: boolean }[] {
  const out: { type: string; data: Uint8Array; crcOk: boolean }[] = [];
  let p = 8; // skip signature
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const table = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc = (b: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = table[(c ^ b[i]!) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  while (p < bytes.length) {
    const len = dv.getUint32(p);
    const type = String.fromCharCode(...bytes.subarray(p + 4, p + 8));
    const data = bytes.subarray(p + 8, p + 8 + len);
    const stored = dv.getUint32(p + 8 + len);
    out.push({ type, data, crcOk: crc(bytes.subarray(p + 4, p + 8 + len)) === stored });
    p += 12 + len;
  }
  return out;
}

const solid = (w: number, h: number, rgba: [number, number, number, number]): Uint8Array => {
  const a = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { a[i * 4] = rgba[0]; a[i * 4 + 1] = rgba[1]; a[i * 4 + 2] = rgba[2]; a[i * 4 + 3] = rgba[3]; }
  return a;
};

describe('APNG encoder', () => {
  const W = 3, H = 2;
  const frames: ApngFrame[] = [
    { rgba: solid(W, H, [10, 20, 30, 255]), delayMs: 100 },
    { rgba: solid(W, H, [200, 100, 50, 128]), delayMs: 200 },
    { rgba: solid(W, H, [0, 0, 0, 0]), delayMs: 60 },
  ];

  it('writes a valid PNG signature and chunk ordering', () => {
    const png = encodeApng(W, H, frames);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const types = readChunks(png).map((c) => c.type);
    expect(types[0]).toBe('IHDR');
    expect(types[1]).toBe('acTL');          // animation control before frames
    expect(types.indexOf('IDAT')).toBeGreaterThan(types.indexOf('acTL'));
    expect(types[types.length - 1]).toBe('IEND');
  });

  it('all chunk CRCs are correct', () => {
    expect(readChunks(encodeApng(W, H, frames)).every((c) => c.crcOk)).toBe(true);
  });

  it('IHDR encodes RGBA dimensions and acTL the frame count', () => {
    const chunks = readChunks(encodeApng(W, H, frames, 0));
    const ihdr = chunks.find((c) => c.type === 'IHDR')!.data;
    const dv = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
    expect(dv.getUint32(0)).toBe(W);
    expect(dv.getUint32(4)).toBe(H);
    expect(ihdr[8]).toBe(8);   // bit depth
    expect(ihdr[9]).toBe(6);   // colour type RGBA
    const actl = chunks.find((c) => c.type === 'acTL')!.data;
    expect(new DataView(actl.buffer, actl.byteOffset, actl.byteLength).getUint32(0)).toBe(3); // 3 frames
  });

  it('emits one fcTL per frame, one IDAT, and fdAT for the rest', () => {
    const types = readChunks(encodeApng(W, H, frames)).map((c) => c.type);
    expect(types.filter((t) => t === 'fcTL').length).toBe(3);
    expect(types.filter((t) => t === 'IDAT').length).toBe(1);
    expect(types.filter((t) => t === 'fdAT').length).toBe(2);
  });

  it('round-trips the first frame pixels through IDAT', () => {
    const chunks = readChunks(encodeApng(W, H, frames));
    const idat = chunks.find((c) => c.type === 'IDAT')!.data;
    const raw = unzlibSync(idat);
    // Each scanline is [filter=0, R,G,B,A * W]; check row 0, pixel 0.
    expect(raw[0]).toBe(0);             // filter byte
    expect([raw[1], raw[2], raw[3], raw[4]]).toEqual([10, 20, 30, 255]);
  });

  it('carries the frame delays', () => {
    const chunks = readChunks(encodeApng(W, H, frames));
    const fctls = chunks.filter((c) => c.type === 'fcTL');
    const delay = (d: Uint8Array) => new DataView(d.buffer, d.byteOffset, d.byteLength).getUint16(20);
    expect(fctls.map((c) => delay(c.data))).toEqual([100, 200, 60]);
  });

  it('rejects bad input', () => {
    expect(() => encodeApng(0, 1, frames)).toThrow();
    expect(() => encodeApng(W, H, [])).toThrow();
    expect(() => encodeApng(W, H, [{ rgba: new Uint8Array(3), delayMs: 10 }])).toThrow();
  });
});
