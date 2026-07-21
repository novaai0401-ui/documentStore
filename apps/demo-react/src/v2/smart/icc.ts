/**
 * Generate a valid sRGB-class ICC v2 display profile — ours, from scratch. An
 * ICC profile is just a binary structure defined by the ICC spec; the sRGB
 * primaries, D50 white point and transfer curve are public colorimetric
 * constants (math, not a downloaded asset). We emit a matrix/TRC RGB monitor
 * profile, which is what a PDF/A OutputIntent needs — no external file, no dep.
 */

function s15f16(x: number): number { return Math.round(x * 65536); } // s15Fixed16

function xyzType(X: number, Y: number, Z: number): Uint8Array {
  const b = new Uint8Array(20);
  const dv = new DataView(b.buffer);
  b.set([0x58, 0x59, 0x5a, 0x20]); // 'XYZ '
  dv.setInt32(8, s15f16(X)); dv.setInt32(12, s15f16(Y)); dv.setInt32(16, s15f16(Z));
  return b;
}

/** curveType: sampled sRGB EOTF (device → linear), 1024 points. */
function curveType(): Uint8Array {
  const N = 1024;
  const b = new Uint8Array(12 + N * 2);
  const dv = new DataView(b.buffer);
  b.set([0x63, 0x75, 0x72, 0x76]); // 'curv'
  dv.setUint32(8, N);
  for (let i = 0; i < N; i++) {
    const c = i / (N - 1);
    const lin = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    dv.setUint16(12 + i * 2, Math.max(0, Math.min(65535, Math.round(lin * 65535))));
  }
  return b;
}

/** textDescriptionType ('desc', ICC v2): ASCII + (zeroed) Unicode/ScriptCode. */
function descType(text: string): Uint8Array {
  const ascii = text + '\0';
  const b = new Uint8Array(8 + 4 + ascii.length + 4 + 4 + 2 + 1 + 67);
  const dv = new DataView(b.buffer);
  b.set([0x64, 0x65, 0x73, 0x63]); // 'desc'
  dv.setUint32(8, ascii.length);
  for (let i = 0; i < ascii.length; i++) b[12 + i] = ascii.charCodeAt(i);
  return b; // remaining fields are zero (no Unicode/Mac description)
}

function textType(text: string): Uint8Array {
  const ascii = text + '\0';
  const b = new Uint8Array(8 + ascii.length);
  b.set([0x74, 0x65, 0x78, 0x74]); // 'text'
  for (let i = 0; i < ascii.length; i++) b[8 + i] = ascii.charCodeAt(i);
  return b;
}

const sig = (s: string) => [s.charCodeAt(0), s.charCodeAt(1), s.charCodeAt(2), s.charCodeAt(3)];

export function srgbIccProfile(): Uint8Array {
  // D50-adapted sRGB colorants (the standard HP/MS sRGB profile values).
  const tags: Array<{ name: string; data: Uint8Array }> = [
    { name: 'desc', data: descType('pdfcraft sRGB') },
    { name: 'wtpt', data: xyzType(0.9642, 1.0, 0.8249) }, // D50 PCS white
    { name: 'rXYZ', data: xyzType(0.43607, 0.22249, 0.01392) },
    { name: 'gXYZ', data: xyzType(0.38515, 0.71687, 0.09708) },
    { name: 'bXYZ', data: xyzType(0.14307, 0.06061, 0.71410) },
    { name: 'rTRC', data: curveType() },
    { name: 'cprt', data: textType('No copyright, use freely.') },
  ];
  // r/g/b TRC share one curve (ICC permits tags pointing at the same data).
  const trc = tags.find((t) => t.name === 'rTRC')!;

  // Layout: header(128) + tag table(4 + 12*count) + tag data (4-byte aligned).
  const tagOrder = ['desc', 'wtpt', 'rXYZ', 'gXYZ', 'bXYZ', 'rTRC', 'gTRC', 'bTRC', 'cprt'];
  const dataOf = (name: string) => (name === 'gTRC' || name === 'bTRC' ? trc.data : tags.find((t) => t.name === name)!.data);

  const count = tagOrder.length;
  const tableSize = 4 + 12 * count;
  let dataStart = 128 + tableSize;
  const align = (n: number) => (n + 3) & ~3;
  dataStart = align(dataStart);

  // Assign offsets; gTRC/bTRC reuse rTRC's offset.
  const offsets = new Map<string, { off: number; size: number }>();
  let cursor = dataStart;
  for (const name of ['desc', 'wtpt', 'rXYZ', 'gXYZ', 'bXYZ', 'rTRC', 'cprt']) {
    const d = dataOf(name);
    offsets.set(name, { off: cursor, size: d.length });
    cursor = align(cursor + d.length);
  }
  offsets.set('gTRC', offsets.get('rTRC')!);
  offsets.set('bTRC', offsets.get('rTRC')!);
  const totalSize = cursor;

  const out = new Uint8Array(totalSize);
  const dv = new DataView(out.buffer);
  // Header
  dv.setUint32(0, totalSize);
  dv.setUint32(8, 0x02400000); // version 2.4
  out.set(sig('mntr'), 12);
  out.set(sig('RGB '), 16);
  out.set(sig('XYZ '), 20);
  out.set(sig('acsp'), 36);
  dv.setUint32(64, 0); // rendering intent: perceptual
  // PCS illuminant = D50
  dv.setInt32(68, s15f16(0.9642)); dv.setInt32(72, s15f16(1.0)); dv.setInt32(76, s15f16(0.8249));

  // Tag table
  dv.setUint32(128, count);
  tagOrder.forEach((name, i) => {
    const o = 132 + i * 12;
    out.set(sig(name), o);
    const { off, size } = offsets.get(name)!;
    dv.setUint32(o + 4, off);
    dv.setUint32(o + 8, size);
  });

  // Tag data
  for (const name of ['desc', 'wtpt', 'rXYZ', 'gXYZ', 'bXYZ', 'rTRC', 'cprt']) {
    out.set(dataOf(name), offsets.get(name)!.off);
  }
  return out;
}
