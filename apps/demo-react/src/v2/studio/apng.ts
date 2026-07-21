/**
 * Our own Animated PNG (APNG) encoder — pure, dependency-light and fully
 * deterministic, so unlike a browser video codec we can byte-verify it in Node.
 * APNG is a real, widely-supported animated format that keeps full 24-bit colour
 * + alpha (no GIF 256-colour banding), making it the high-quality, silent
 * companion to the GIF and WebCodecs video exports. Frames are encoded as
 * truecolour-alpha PNG IDAT/fdAT chunks per the APNG spec (acTL + fcTL).
 */
import { zlibSync } from 'fflate';

export interface ApngFrame { rgba: Uint8Array; delayMs: number }

// CRC-32 (PNG polynomial), table built once.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Prepend the PNG "None" filter byte (0) to each scanline. */
function rawScanlines(rgba: Uint8Array, w: number, h: number): Uint8Array {
  const stride = w * 4;
  const raw = new Uint8Array(h * (stride + 1));
  for (let y = 0; y < h; y++) { const o = y * (stride + 1); raw[o] = 0; raw.set(rgba.subarray(y * stride, (y + 1) * stride), o + 1); }
  return raw;
}

function concat(parts: Uint8Array[]): Uint8Array {
  let len = 0; for (const p of parts) len += p.length;
  const out = new Uint8Array(len); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Encode frames (each a width*height RGBA buffer) into an APNG byte stream.
 * `plays` = 0 loops forever. Throws on bad input. The output is a valid PNG that
 * still shows the first frame in viewers that don't understand animation.
 */
export function encodeApng(width: number, height: number, frames: ApngFrame[], plays = 0): Uint8Array {
  if (width < 1 || height < 1) throw new Error('APNG: invalid dimensions');
  if (!frames.length) throw new Error('APNG: at least one frame required');
  const need = width * height * 4;
  for (const f of frames) if (f.rgba.length !== need) throw new Error('APNG: frame size does not match dimensions');

  const ihdr = new Uint8Array(13);
  const idv = new DataView(ihdr.buffer);
  idv.setUint32(0, width); idv.setUint32(4, height);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type 6 = truecolour with alpha (RGBA)
  // 10,11,12 = compression/filter/interlace = 0

  const actl = new Uint8Array(8);
  const adv = new DataView(actl.buffer);
  adv.setUint32(0, frames.length); adv.setUint32(4, plays);

  const parts: Uint8Array[] = [SIGNATURE, chunk('IHDR', ihdr), chunk('acTL', actl)];
  let seq = 0;
  frames.forEach((f, i) => {
    const fctl = new Uint8Array(26);
    const fdv = new DataView(fctl.buffer);
    fdv.setUint32(0, seq++);        // sequence number
    fdv.setUint32(4, width); fdv.setUint32(8, height);
    fdv.setUint32(12, 0); fdv.setUint32(16, 0); // x/y offset
    fdv.setUint16(20, Math.max(0, Math.round(f.delayMs))); // delay numerator (ms)
    fdv.setUint16(22, 1000);        // delay denominator → numerator is in ms
    fctl[24] = 0;                   // dispose_op = NONE
    fctl[25] = 0;                   // blend_op = SOURCE
    parts.push(chunk('fcTL', fctl));

    const comp = zlibSync(rawScanlines(f.rgba, width, height));
    if (i === 0) {
      parts.push(chunk('IDAT', comp));
    } else {
      const fdat = new Uint8Array(4 + comp.length);
      new DataView(fdat.buffer).setUint32(0, seq++);
      fdat.set(comp, 4);
      parts.push(chunk('fdAT', fdat));
    }
  });
  parts.push(chunk('IEND', new Uint8Array(0)));
  return concat(parts);
}
