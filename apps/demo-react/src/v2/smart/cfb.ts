/**
 * A minimal Compound File Binary (CFB / OLE2) reader — ours. Encrypted OOXML
 * files (.docx/.xlsx/.pptx with a password) aren't zips; they're CFB containers
 * holding `EncryptionInfo` + `EncryptedPackage` streams. We only need to read
 * named streams, so this implements: the header, the FAT/DIFAT, the mini-FAT,
 * and the directory — enough to extract any stream by name.
 */

const SIG = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;

export function isCfb(bytes: Uint8Array): boolean {
  return SIG.every((b, i) => bytes[i] === b);
}

export function readCfbStreams(bytes: Uint8Array): Map<string, Uint8Array> {
  if (!isCfb(bytes)) throw new Error('Not a CFB/OLE2 file');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (o: number) => dv.getUint32(o, true);
  const u16 = (o: number) => dv.getUint16(o, true);

  const sectorShift = u16(30);
  const sectorSize = 1 << sectorShift; // 512 (v3) or 4096 (v4)
  const miniSectorSize = 1 << u16(32); // 64
  const miniCutoff = u32(56); // usually 4096
  const firstDir = u32(48);
  const firstMiniFat = u32(60);
  const numMiniFat = u32(64);
  const firstDifat = u32(68);
  const numDifat = u32(72);

  const sectorOffset = (s: number) => (s + 1) * sectorSize;

  // ── Build the FAT from the DIFAT (109 inline entries + any DIFAT sectors) ──
  const fatSectors: number[] = [];
  for (let i = 0; i < 109; i++) { const s = u32(76 + i * 4); if (s !== FREESECT && s !== ENDOFCHAIN) fatSectors.push(s); }
  let difatSector = firstDifat;
  const perDifat = sectorSize / 4 - 1;
  for (let n = 0; n < numDifat && difatSector !== ENDOFCHAIN && difatSector !== FREESECT; n++) {
    const base = sectorOffset(difatSector);
    for (let i = 0; i < perDifat; i++) { const s = u32(base + i * 4); if (s !== FREESECT && s !== ENDOFCHAIN) fatSectors.push(s); }
    difatSector = u32(base + perDifat * 4);
  }
  const fat = new Uint32Array(fatSectors.length * (sectorSize / 4));
  fatSectors.forEach((sec, i) => { const base = sectorOffset(sec); for (let j = 0; j < sectorSize / 4; j++) fat[i * (sectorSize / 4) + j] = u32(base + j * 4); });

  const readChain = (start: number, fatTable: Uint32Array, secSize: number, offsetOf: (s: number) => number, store?: Uint8Array): Uint8Array => {
    const parts: Uint8Array[] = [];
    let s = start;
    let guard = 0;
    while (s !== ENDOFCHAIN && s !== FREESECT && guard++ < fatTable.length + 4) {
      const off = offsetOf(s);
      parts.push((store ?? bytes).subarray(off, off + secSize));
      s = fatTable[s] ?? ENDOFCHAIN;
    }
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  };

  // ── Directory ──
  const dir = readChain(firstDir, fat, sectorSize, sectorOffset);
  const ddv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  const entries: Array<{ name: string; type: number; start: number; size: number }> = [];
  for (let off = 0; off + 128 <= dir.length; off += 128) {
    const nameLen = ddv.getUint16(off + 64, true);
    if (nameLen === 0) continue;
    let name = '';
    for (let i = 0; i < nameLen - 2; i += 2) name += String.fromCharCode(ddv.getUint16(off + i, true));
    entries.push({ name, type: dir[off + 66]!, start: ddv.getUint32(off + 116, true), size: Number(ddv.getBigUint64(off + 120, true)) });
  }

  // ── Mini stream + mini FAT (for streams smaller than the cutoff) ──
  const root = entries.find((e) => e.type === 5);
  const miniStream = root ? readChain(root.start, fat, sectorSize, sectorOffset) : new Uint8Array(0);
  let miniFat = new Uint32Array(0);
  if (numMiniFat > 0 && firstMiniFat !== ENDOFCHAIN) {
    const mf = readChain(firstMiniFat, fat, sectorSize, sectorOffset);
    const mdv = new DataView(mf.buffer, mf.byteOffset, mf.byteLength);
    const n = Math.floor(mf.length / 4);
    miniFat = new Uint32Array(n);
    for (let i = 0; i < n; i++) miniFat[i] = mdv.getUint32(i * 4, true); // little-endian
  }
  const miniOffset = (s: number) => s * miniSectorSize;

  const out = new Map<string, Uint8Array>();
  for (const e of entries) {
    if (e.type !== 2) continue; // streams only
    const data = e.size >= miniCutoff
      ? readChain(e.start, fat, sectorSize, sectorOffset)
      : readChain(e.start, miniFat, miniSectorSize, miniOffset, miniStream);
    out.set(e.name, data.subarray(0, e.size));
  }
  return out;
}
