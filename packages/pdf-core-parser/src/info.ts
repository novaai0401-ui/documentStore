/**
 * /Info dictionary read + write. PDF metadata that shows up in every
 * viewer's "Document Properties" dialog: title, author, subject,
 * keywords, creator, producer, creation/mod dates.
 *
 * Read path: resolve the trailer's /Info ref, pull out the standard
 * keys, decode their string values via the same UTF-16BE / PDFDocEncoding
 * logic used for field names.
 *
 * Write path: produce an Info patch in the shared `updates` map so the
 * incremental-update writer picks it up. When the original document
 * has no /Info dict, we mint a new indirect object and link it from
 * the trailer.
 */
import type { PdfDocument } from './document.js';
import type { PdfObject } from './types.js';
import { makeTextString } from './writer.js';

export interface PdfInfo {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  /** PDF date string, e.g. "D:20260530143000+00'00'". Read-only by default. */
  creationDate?: string;
  modDate?: string;
}

const STANDARD_KEYS = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate'] as const;

/**
 * Pull the document's /Info dict into a plain JSON shape. Returns an
 * empty object when no /Info entry exists or when every standard key
 * is missing.
 */
export async function readInfo(doc: PdfDocument): Promise<PdfInfo> {
  const infoEntry = doc.xref.trailer.get('Info');
  if (!infoEntry) return {};

  let dict: Map<string, PdfObject>;
  try {
    if (infoEntry.kind === 'ref') {
      dict = await doc.resolveDict(infoEntry);
    } else if (infoEntry.kind === 'dict') {
      dict = infoEntry.entries;
    } else {
      return {};
    }
  } catch {
    return {};
  }

  const out: PdfInfo = {};
  for (const key of STANDARD_KEYS) {
    const v = dict.get(key);
    if (!v) continue;
    let bytes: Uint8Array | null = null;
    if (v.kind === 'string') bytes = v.value;
    else if (v.kind === 'ref') {
      try {
        const r = await doc.resolve(v);
        if (r.kind === 'string') bytes = r.value;
      } catch { /* ignore */ }
    }
    if (!bytes) continue;
    const decoded = decodePdfString(bytes);
    // Map the PDF capitalized key to a camelCase output key.
    const outKey = key.charAt(0).toLowerCase() + key.slice(1) as keyof PdfInfo;
    out[outKey] = decoded;
  }
  return out;
}

/**
 * Stage an /Info dict update into the shared `updates` map. The caller
 * (saveFieldValues) runs this before buildIncrementalUpdate so the
 * standard incremental-write path picks it up.
 *
 * Only writes the keys present in `patch` — preserves any extra entries
 * the producer added (custom metadata).
 *
 * Returns the trailer-level info ref (existing or newly minted) so the
 * incremental-update writer can include it in the new trailer when no
 * prior /Info existed.
 */
export async function applyInfoPatch(
  doc: PdfDocument,
  patch: PdfInfo,
  updates: Map<number, PdfObject>,
  allocObjNum: () => number,
): Promise<{ infoRef: PdfObject & { kind: 'ref' }; isNew: boolean } | null> {
  if (Object.keys(patch).length === 0) return null;

  const infoEntry = doc.xref.trailer.get('Info');
  let baseDict: Map<string, PdfObject> = new Map();
  let infoObjNum: number | null = null;
  let isNew = false;

  if (infoEntry && infoEntry.kind === 'ref') {
    infoObjNum = infoEntry.objectNumber;
    try {
      const d = await doc.resolveDict(infoEntry);
      baseDict = new Map(d);
    } catch { /* fall through */ }
  } else if (infoEntry && infoEntry.kind === 'dict') {
    baseDict = new Map(infoEntry.entries);
  } else {
    isNew = true;
    infoObjNum = allocObjNum();
  }

  // Capitalization map: camelCase → PDF key.
  const fieldToKey: Array<[keyof PdfInfo, string]> = [
    ['title', 'Title'],
    ['author', 'Author'],
    ['subject', 'Subject'],
    ['keywords', 'Keywords'],
    ['creator', 'Creator'],
    ['producer', 'Producer'],
    ['creationDate', 'CreationDate'],
    ['modDate', 'ModDate'],
  ];
  for (const [field, key] of fieldToKey) {
    const value = patch[field];
    if (value === undefined) continue;
    if (value === '') {
      baseDict.delete(key);
    } else if (field === 'creationDate' || field === 'modDate') {
      // Dates are ASCII literal strings, e.g. "D:20260530143000+00'00'".
      const bytes = new Uint8Array(value.length);
      for (let i = 0; i < value.length; i++) bytes[i] = value.charCodeAt(i) & 0xff;
      baseDict.set(key, { kind: 'string', value: bytes, literal: true });
    } else {
      baseDict.set(key, makeTextString(value));
    }
  }

  if (infoObjNum === null) return null;
  updates.set(infoObjNum, { kind: 'dict', entries: baseDict });
  return {
    infoRef: { kind: 'ref', objectNumber: infoObjNum, generation: 0 },
    isNew,
  };
}

function decodePdfString(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let s = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      s += String.fromCharCode((bytes[i]! << 8) | bytes[i + 1]!);
    }
    return s;
  }
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}
