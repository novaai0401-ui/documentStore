import { ByteReader } from './reader.js';
import { findStartxref } from './xref.js';
import { serializeObject, makeTextString } from './writer.js';
import {
  buildAppearanceXObject,
  buildTextAppearanceContent,
  parseDA,
} from './appearance.js';
import { burnOverlays, type Overlay } from './overlays.js';
import { addNewFields, type NewFieldDescriptor } from './newfield.js';
import { applyInfoPatch, type PdfInfo } from './info.js';
import { tagAccessibility, type A11yTagOptions } from './accessibility.js';
import { applyRedactions } from './redact.js';
import { applyPageOps, type PageOps } from './pages.js';
import { encryptObjectForWrite } from './crypto.js';
import { deflate } from './streams.js';
import type { PdfDocument } from './document.js';
import { type FormFieldDescriptor, readOnStateName } from './forms.js';
import type { PdfObject } from './types.js';

/**
 * Apply a {fieldName: value} map to the document and produce new PDF
 * bytes using the *incremental update* mechanism from the PDF spec:
 * the original file bytes are kept verbatim, and modified objects +
 * a new xref subsection + trailer are appended at the end.
 *
 * Why incremental? It's the standard way to mutate a PDF without
 * having to reproduce every object, and it works even when we can't
 * fully parse parts of the file (e.g. encrypted streams).
 */
export async function saveFieldValues(
  doc: PdfDocument,
  fields: FormFieldDescriptor[],
  values: Record<string, string | boolean | string[]>,
  /** Optional drawing/text/image overlays to burn into the saved PDF.
   *  These come from the demo's annotation-tool state and are written
   *  as real PDF content (new /Contents streams + /Link annotations +
   *  image XObjects), so the saved file renders identically in every
   *  viewer. */
  overlays: Overlay[] = [],
  /** Optional new AcroForm fields to add. Each becomes a /Widget
   *  annotation appended to /AcroForm/Fields and to the page's
   *  /Annots; on reload it's a real fillable field. */
  newFields: NewFieldDescriptor[] = [],
  /** Optional /Info dict patch — title, author, subject, etc. */
  infoPatch: PdfInfo = {},
  /** Optional accessibility/PDF-UA structure tagging. */
  a11y?: A11yTagOptions,
  /** Optional page organization (reorder/delete/rotate/append). Applied as
   *  the final structural pass; page numbers refer to the ORIGINAL document.
   *  Best used as a standalone export (the demo does). */
  pages?: PageOps,
): Promise<Uint8Array> {
  // 1. Build the {objNum -> updated PdfObject} map.
  const updates = new Map<number, PdfObject>();
  // Next free object number for new XObject streams (appearance forms).
  // We allocate from max(xref) + 1 to avoid colliding with existing objects.
  let nextFreeObjNum = 1;
  for (const n of doc.xref.entries.keys()) {
    if (n + 1 > nextFreeObjNum) nextFreeObjNum = n + 1;
  }

  // Resolve the catalog-level AcroForm to find inheritable /DA and /Q.
  let acroFormDict: Map<string, PdfObject> | null = null;
  if (doc.root && doc.root.kind === 'ref') {
    const catalog = await doc.resolveDict(doc.root);
    const afEntry = catalog.get('AcroForm');
    if (afEntry) acroFormDict = await doc.resolveDict(afEntry);
  }
  const defaultDA = stringFromObj(acroFormDict?.get('DA'));
  const defaultQ = numFromObj(acroFormDict?.get('Q'));

  /** Allocate a new object number for an appearance XObject. */
  const allocObjNum = (): number => nextFreeObjNum++;

  /** Regenerate the field's /AP/N from the new displayed text. Returns
   *  an /AP dict { N: <ref> } so the caller can drop it on the widget.
   *  When the field has multiple widgets, every widget gets its own
   *  XObject (rects may differ per widget). */
  const regenerateAppearance = (
    widgetDict: Map<string, PdfObject>,
    displayedText: string,
    multiline: boolean,
  ): Map<string, PdfObject> => {
    const fieldDA = stringFromObj(widgetDict.get('DA')) ?? defaultDA;
    const fieldQ = numFromObj(widgetDict.get('Q')) ?? defaultQ ?? 0;
    const rectArr = widgetDict.get('Rect');
    let w = 0, h = 0;
    if (rectArr && rectArr.kind === 'array' && rectArr.items.length >= 4) {
      const [llx, lly, urx, ury] = rectArr.items.map((it) => (it.kind === 'num' ? it.value : 0));
      w = (urx ?? 0) - (llx ?? 0);
      h = (ury ?? 0) - (lly ?? 0);
    }
    if (w <= 0 || h <= 0) {
      // Defensive: empty /AP if we can't size the box.
      return new Map<string, PdfObject>([['N', { kind: 'dict', entries: new Map() }]]);
    }
    const content = buildTextAppearanceContent({
      width: w,
      height: h,
      text: displayedText,
      da: fieldDA,
      alignment: ((fieldQ === 1 || fieldQ === 2) ? fieldQ : 0) as 0 | 1 | 2,
      multiline,
    });
    const xobj = buildAppearanceXObject(content, w, h, parseDA(fieldDA).fontName);
    const objNum = allocObjNum();
    updates.set(objNum, xobj);
    return new Map<string, PdfObject>([
      ['N', { kind: 'ref', objectNumber: objNum, generation: 0 }],
    ]);
  };

  for (const [fieldName, value] of Object.entries(values)) {
    const field = fields.find((f) => f.id === fieldName);
    if (!field) continue;

    const ref: PdfObject = { kind: 'ref', objectNumber: field.objectNumber, generation: 0 };
    const dict = await doc.resolveDict(ref);
    // Clone so we don't mutate the cached object.
    const next = new Map(dict);

    if (field.type === 'text' || field.type === 'multiline') {
      if (typeof value !== 'string') continue;
      next.set('V', makeTextString(value));
      // Synthesize a fresh /AP/N so every viewer renders the new value,
      // not just ones that honor /NeedAppearances. One XObject per widget.
      await applyAppearanceToWidgets(
        doc, field, next, value, field.type === 'multiline',
        regenerateAppearance, updates,
      );
    } else if (field.type === 'checkbox') {
      // Dynamic "on" state name resolution:
      //   1. Use the name captured at extract time (from /AP/N).
      //   2. If missing, re-resolve at write time straight from the
      //      widget's /AP/N — handles fields we couldn't pre-classify.
      //   3. If the widget has no /AP at all, the viewer auto-generates
      //      appearance from /V; any non-/Off name works ("Yes" is the
      //      pdf-lib convention and the most-recognized fallback).
      let onName = field.checkedStateName;
      if (!onName) {
        onName = await readOnStateName(doc, dict) ?? 'Yes';
      }
      const state = value === true ? onName : 'Off';
      // Update field-level /V (the state name).
      next.set('V', { kind: 'name', value: state });
      // Update /AS on EVERY widget backing this field. Single-widget
      // leaves keep /AS on the field dict itself; multi-widget fields
      // have /AS on each kid. widgetObjectNumbers always covers both.
      const widgets = field.widgetObjectNumbers ?? [field.objectNumber];
      for (const wObjNum of widgets) {
        if (wObjNum === field.objectNumber) {
          next.set('AS', { kind: 'name', value: state });
        } else {
          const wRef: PdfObject = { kind: 'ref', objectNumber: wObjNum, generation: 0 };
          const wDict = await doc.resolveDict(wRef);
          const wCopy = new Map(wDict);
          // Each widget may have a different on-state name.
          const wOn = (await readOnStateName(doc, wDict)) ?? onName;
          wCopy.set('AS', { kind: 'name', value: value === true ? wOn : 'Off' });
          updates.set(wObjNum, { kind: 'dict', entries: wCopy });
        }
      }
    } else if (field.type === 'dropdown') {
      if (typeof value !== 'string') continue;
      // Dropdown can use [export, display] pairs in /Opt. The user
      // picked a display string; the export half is what goes into /V.
      // optionValues[i] is the export at the same index as options[i].
      const exportValue = resolveExportValue(field, value);
      next.set('V', makeTextString(exportValue));
      // Display the human-friendly label, not the export code.
      await applyAppearanceToWidgets(
        doc, field, next, value, false,
        regenerateAppearance, updates,
      );
    } else if (field.type === 'listbox') {
      const picks = Array.isArray(value) ? value : typeof value === 'string' ? [value] : null;
      if (!picks) continue;
      const exportPicks = picks.map((p) => resolveExportValue(field, p));
      const arr: PdfObject = { kind: 'array', items: exportPicks.map((v) => makeTextString(v)) };
      next.set('V', arr);
      // Display each selected option on its own line in the box.
      await applyAppearanceToWidgets(
        doc, field, next, picks.join('\n'), true,
        regenerateAppearance, updates,
      );
    } else if (field.type === 'radio') {
      if (typeof value !== 'string') continue;
      next.set('V', { kind: 'name', value });
      // Each child widget's /AS = its own on-state name when matched, /Off
      // otherwise. Read the state name from /AP/N (with ref following).
      const widgets = field.widgetObjectNumbers ?? [];
      for (const wObjNum of widgets) {
        if (wObjNum === field.objectNumber) continue; // updated in `next`
        const wRef: PdfObject = { kind: 'ref', objectNumber: wObjNum, generation: 0 };
        const wDict = await doc.resolveDict(wRef);
        const wCopy = new Map(wDict);
        const wOn = await readOnStateName(doc, wDict);
        const matches = wOn === value;
        wCopy.set('AS', { kind: 'name', value: matches ? value : 'Off' });
        updates.set(wObjNum, { kind: 'dict', entries: wCopy });
      }
    } else {
      // button / signature — not edits we represent yet.
      continue;
    }

    updates.set(field.objectNumber, { kind: 'dict', entries: next });
  }

  // 2. Also tell the AcroForm dict that appearance streams need regen.
  // Locate AcroForm: it's catalog[/AcroForm], either a ref or inline.
  const rootRef = doc.root;
  if (rootRef && rootRef.kind === 'ref') {
    const catalog = await doc.resolveDict(rootRef);
    const acroFormEntry = catalog.get('AcroForm');
    if (acroFormEntry) {
      if (acroFormEntry.kind === 'ref') {
        const afDict = await doc.resolveDict(acroFormEntry);
        const updated = new Map(afDict);
        updated.set('NeedAppearances', { kind: 'bool', value: true });
        updates.set(acroFormEntry.objectNumber, { kind: 'dict', entries: updated });
      } else if (acroFormEntry.kind === 'dict') {
        // Inline AcroForm: have to update the catalog itself.
        const updatedCatalog = new Map(catalog);
        const updatedAF = new Map(acroFormEntry.entries);
        updatedAF.set('NeedAppearances', { kind: 'bool', value: true });
        updatedCatalog.set('AcroForm', { kind: 'dict', entries: updatedAF });
        updates.set(rootRef.objectNumber, { kind: 'dict', entries: updatedCatalog });
      }
    }
  }

  // 2.5 TRUE redaction — strip text under redaction boxes from the content
  //     streams BEFORE the black box is drawn, so the glyphs are physically
  //     gone (not just visually covered). Modifies the underlying stream
  //     objects, which the overlay/tagging passes then build on.
  const redactions = overlays
    .filter((o) => o.kind === 'redact')
    .map((o) => ({
      page: o.page, x: o.x, y: o.y, width: o.width, height: o.height,
      pageCssWidth: o.pageCssWidth, pageCssHeight: o.pageCssHeight,
    }));
  if (redactions.length > 0) {
    await applyRedactions(doc, redactions, updates);
  }

  // 3. Burn drawing/text/image overlays into page content streams (incl. the
  //    black redaction boxes, now drawn over already-stripped text).
  if (overlays.length > 0) {
    await burnOverlays(doc, overlays, updates, allocObjNum);
  }

  // 4. Append any newly-drawn AcroForm fields. Order matters: do this
  //    after overlay burn so widgets land on top of any background
  //    drawings, and after the field-value pass so allocObjNum keeps
  //    monotonically increasing without collisions.
  if (newFields.length > 0) {
    await addNewFields(doc, newFields, updates, allocObjNum);
  }

  // 5. Stage any /Info dict updates (title, author, subject, etc).
  //    When the source had no /Info entry, applyInfoPatch mints a fresh
  //    indirect object — we hand its ref to buildIncrementalUpdate so
  //    the new trailer includes it.
  const infoResult = await applyInfoPatch(doc, infoPatch, updates, allocObjNum);

  // 5b. Accessibility tagging — runs LAST among catalog mutations so it
  //     builds on (rather than clobbers) any catalog changes staged above
  //     (e.g. new AcroForm fields).
  if (a11y) {
    await tagAccessibility(doc, a11y, updates, allocObjNum);
  }

  // 5c. Page organization — reorder / delete / rotate / append.
  if (pages) {
    await applyPageOps(doc, pages, updates, allocObjNum);
  }

  // 6. Compress any new streams we added. The encrypt pass (if the
  //    source PDF was encrypted) runs AFTER this, which is the correct
  //    order — encrypt operates on the compressed bytes.
  await compressNewStreams(updates);

  // 7. Produce the new bytes.
  return buildIncrementalUpdate(doc, updates, {
    newInfoRef: infoResult && infoResult.isNew ? infoResult.infoRef : undefined,
  });
}

/**
 * Walk the updates map and FlateDecode-compress any stream whose dict
 * doesn't yet declare a /Filter. Saves a lot of bytes on appearance
 * XObjects and overlay /Contents streams.
 *
 * Skipped when the runtime doesn't support CompressionStream (very old
 * environments) — the writer just emits the raw streams as before.
 */
async function compressNewStreams(updates: Map<number, PdfObject>): Promise<void> {
  if (typeof CompressionStream === 'undefined') return;
  for (const [objNum, obj] of updates) {
    if (obj.kind !== 'stream') continue;
    if (obj.dict.has('Filter')) continue;     // already encoded
    if (obj.raw.length < 128) continue;       // not worth the overhead
    let compressed: Uint8Array;
    try {
      compressed = await deflate(obj.raw);
    } catch {
      continue;
    }
    if (compressed.length >= obj.raw.length) continue; // didn't help
    const newDict = new Map(obj.dict);
    newDict.set('Filter', { kind: 'name', value: 'FlateDecode' });
    newDict.set('Length', { kind: 'num', value: compressed.length });
    updates.set(objNum, { kind: 'stream', dict: newDict, raw: compressed });
  }
}

/**
 * Encrypt every updated object with the original file's per-object key.
 * No-op when the source PDF wasn't encrypted. Mutates the `updates` map.
 */
async function encryptUpdatesIfNeeded(
  doc: PdfDocument,
  updates: Map<number, PdfObject>,
): Promise<void> {
  if (!doc.encryption || !doc.encryption.fileKey) return;
  for (const [objNum, obj] of updates) {
    const gen = doc.xref.entries.get(objNum)?.generation ?? 0;
    updates.set(objNum, await encryptObjectForWrite(obj, objNum, gen, doc.encryption));
  }
}

/**
 * Map a display value the user picked to the export value the PDF
 * expects in /V. When /Opt is a flat string array, display == export
 * and this is a no-op. When /Opt has [export, display] pairs, look up
 * by display position. Falls back to the input string if no match.
 */
function resolveExportValue(field: FormFieldDescriptor, displayValue: string): string {
  if (!field.options || !field.optionValues) return displayValue;
  const i = field.options.indexOf(displayValue);
  if (i < 0) return displayValue;
  return field.optionValues[i] ?? displayValue;
}

/**
 * Apply a synthesized appearance to every widget backing this field.
 * The field dict (single-widget leaf) gets /AP directly; multi-widget
 * fields write a new /AP on each widget (each has its own /Rect).
 *
 * Important: we use the *displayed* text — not the export value — for
 * the visible appearance, so the user sees what they picked.
 */
async function applyAppearanceToWidgets(
  doc: PdfDocument,
  field: FormFieldDescriptor,
  fieldDictNext: Map<string, PdfObject>,
  displayedText: string,
  multiline: boolean,
  regen: (
    widgetDict: Map<string, PdfObject>,
    text: string,
    multiline: boolean,
  ) => Map<string, PdfObject>,
  updates: Map<number, PdfObject>,
): Promise<void> {
  const widgets = field.widgetObjectNumbers ?? [field.objectNumber];
  for (const wObjNum of widgets) {
    if (wObjNum === field.objectNumber) {
      // The field dict IS the widget (single-widget leaf case). Place /AP
      // on the field-dict copy the caller is about to register.
      const apDict = regen(fieldDictNext, displayedText, multiline);
      fieldDictNext.set('AP', { kind: 'dict', entries: apDict });
    } else {
      // Multi-widget field: each kid is its own widget annot.
      const wRef: PdfObject = { kind: 'ref', objectNumber: wObjNum, generation: 0 };
      const wDict = await doc.resolveDict(wRef);
      const wCopy = new Map(wDict);
      const apDict = regen(wDict, displayedText, multiline);
      wCopy.set('AP', { kind: 'dict', entries: apDict });
      updates.set(wObjNum, { kind: 'dict', entries: wCopy });
    }
  }
}

function stringFromObj(o: PdfObject | undefined): string | undefined {
  if (!o) return undefined;
  if (o.kind === 'string') {
    // /DA is an ASCII byte string — decode as ISO-8859-1 (charcode-per-byte).
    let s = '';
    for (let i = 0; i < o.value.length; i++) s += String.fromCharCode(o.value[i]!);
    return s;
  }
  if (o.kind === 'name') return o.value;
  return undefined;
}

function numFromObj(o: PdfObject | undefined): number | undefined {
  return o && o.kind === 'num' ? o.value : undefined;
}

/**
 * Append modified objects + new xref subsection + trailer to the
 * document's original bytes. Returns the full new file content.
 *
 * When the source PDF is encrypted, every appended object is re-encrypted
 * with the original file's per-object key before serialization so the
 * viewer can decrypt it transparently. The trailer's /Encrypt entry is
 * referenced verbatim from the original file via the xref chain.
 */
export async function buildIncrementalUpdate(
  doc: PdfDocument,
  updates: Map<number, PdfObject>,
  opts: { newInfoRef?: PdfObject & { kind: 'ref' } } = {},
): Promise<Uint8Array> {
  await encryptUpdatesIfNeeded(doc, updates);
  const original = doc.sourceBytes;
  const parts: Uint8Array[] = [];

  // Ensure a newline before our additions.
  parts.push(original);
  let cursor = original.length;
  const last = original[original.length - 1];
  if (last !== 0x0a && last !== 0x0d) {
    parts.push(new Uint8Array([0x0a]));
    cursor += 1;
  }

  // Emit each modified object, recording its offset.
  const newOffsets = new Map<number, { offset: number; generation: number }>();
  for (const [objNum, obj] of updates) {
    const gen = doc.xref.entries.get(objNum)?.generation ?? 0;
    const header = `${objNum} ${gen} obj\n`;
    const body = serializeObject(obj);
    const footer = '\nendobj\n';
    const headerBytes = bytesOfStr(header);
    const footerBytes = bytesOfStr(footer);
    newOffsets.set(objNum, { offset: cursor, generation: gen });
    parts.push(headerBytes, body, footerBytes);
    cursor += headerBytes.length + body.length + footerBytes.length;
  }

  // Build the new xref subsection(s).
  const xrefOffset = cursor;
  const xrefStr = buildClassicXref(newOffsets);
  parts.push(bytesOfStr(xrefStr));

  // Build the new trailer dict pointing back at the prior xref via /Prev.
  const previousStartxref = findStartxref(new ByteReader(original));
  const rootRef = doc.root;
  if (!rootRef || rootRef.kind !== 'ref') throw new Error('saveFieldValues: catalog /Root not a ref');
  const maxObjNum = Math.max(
    ...doc.xref.entries.keys(),
    ...newOffsets.keys(),
  );
  const newSize = maxObjNum + 1;

  // Carry /Encrypt and /ID forward verbatim from the original trailer
  // when present. /Encrypt is mandatory for encrypted PDFs (the viewer
  // re-reads it from this newest trailer); /ID is folded into the
  // per-object key derivation so it MUST stay byte-identical.
  let extraTrailer = '';
  const origEncrypt = doc.xref.trailer.get('Encrypt');
  if (origEncrypt) extraTrailer += `/Encrypt ${serializeForTrailer(origEncrypt)}\n`;
  const origId = doc.xref.trailer.get('ID');
  if (origId) extraTrailer += `/ID ${serializeForTrailer(origId)}\n`;
  // /Info: if the original trailer carries one, the existing ref keeps
  // pointing at our updated /Info object (mutation flows through the
  // updates map). When we minted a fresh /Info, we have to link it.
  const origInfo = doc.xref.trailer.get('Info');
  if (origInfo) {
    extraTrailer += `/Info ${serializeForTrailer(origInfo)}\n`;
  } else if (opts.newInfoRef) {
    extraTrailer += `/Info ${serializeForTrailer(opts.newInfoRef)}\n`;
  }

  const trailerStr =
    `trailer\n<<\n/Size ${newSize}\n/Prev ${previousStartxref}\n` +
    `/Root ${rootRef.objectNumber} ${rootRef.generation} R\n` +
    extraTrailer +
    `>>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;
  parts.push(bytesOfStr(trailerStr));

  return concat(parts);
}

/**
 * Serialize a small PdfObject (ref / array of strings) for use inside
 * the trailer dict. Wraps `serializeObject` and decodes the result back
 * to a string so it can be concatenated into the trailer template.
 *
 * The trailer is plaintext per spec (even in encrypted files), so we
 * call serializeObject directly without an encryption pass.
 */
function serializeForTrailer(obj: PdfObject): string {
  const bytes = serializeObject(obj);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}

function buildClassicXref(
  offsets: Map<number, { offset: number; generation: number }>,
): string {
  // Group into contiguous subsections.
  const nums = [...offsets.keys()].sort((a, b) => a - b);
  // The "0 1\n0000000000 65535 f " head entry is required at file
  // start, but in *incremental* updates it's only included for the
  // very first xref. Here we just emit the modified subsections.
  let out = 'xref\n';
  let i = 0;
  while (i < nums.length) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1]! === nums[j]! + 1) j++;
    const start = nums[i]!;
    const count = j - i + 1;
    out += `${start} ${count}\n`;
    for (let k = i; k <= j; k++) {
      const num = nums[k]!;
      const { offset, generation } = offsets.get(num)!;
      out += `${pad10(offset)} ${pad5(generation)} n \n`;
    }
    i = j + 1;
  }
  return out;
}

function pad10(n: number): string {
  return n.toString().padStart(10, '0');
}

function pad5(n: number): string {
  return n.toString().padStart(5, '0');
}

function bytesOfStr(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}
