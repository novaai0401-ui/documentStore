import type { PdfDocument } from './document.js';
import type { PdfObject } from './types.js';
import { makeTextString } from './writer.js';
import { decodeStream } from './streams.js';
import { tokenizeContent } from './redact.js';

/**
 * Accessibility / PDF-UA structure tagging (incremental).
 *
 * This pass makes an untagged PDF *tagged*: it doesn't merely declare a
 * structure tree, it wraps the real page content in marked-content sequences
 * and binds them to structure elements through a /ParentTree — the thing a
 * strict validator (PAC) checks when it complains about "untagged content".
 *
 * What gets written (all additive, via incremental update — original bytes
 * are preserved):
 *
 *   • Each page's /Contents is wrapped:  /P <</MCID 0>> BDC … EMC
 *     (prepended/appended as extra content streams, so existing operators are
 *      never edited — only bracketed). The page gets /StructParents = its key.
 *   • /StructTreeRoot → Document → one /P StructElem per page, each pointing
 *     at its page via /Pg and at its marked content via /K = <MCID>.
 *   • /ParentTree (number tree) maps every page's /StructParents key to its
 *     element, so MCID ↔ StructElem resolves both ways.
 *   • Catalog: /MarkInfo <</Marked true>>, /Lang, /ViewerPreferences
 *     <</DisplayDocTitle true>>.
 *
 * Granularity: PER-PARAGRAPH. Each text object (BT…ET span) in the page's
 * content streams is bracketed as its own marked-content sequence
 * (/P <</MCID n>> BDC … EMC) with a matching /P StructElem, found with the
 * same content-stream tokenizer the redaction engine uses (so 'BT' inside
 * strings/dicts can't fool it). Pages with no text objects fall back to one
 * whole-page region so every page stays represented in the tree.
 */

export interface A11yHeading {
  page: number;
  level: number;
  text: string;
}

export interface A11yTagOptions {
  /** BCP-47 language tag, e.g. "en-US". */
  lang?: string;
  /** Detected headings — used to label each page element with /ActualText so
   *  AT announces a meaningful name; structure remains page-granular. */
  headings?: A11yHeading[];
}

// ── small value constructors ──────────────────────────────────────────────────
const name = (v: string): PdfObject => ({ kind: 'name', value: v });
const numv = (value: number): PdfObject => ({ kind: 'num', value });
const bool = (v: boolean): PdfObject => ({ kind: 'bool', value: v });
const ref = (objectNumber: number): PdfObject => ({ kind: 'ref', objectNumber, generation: 0 });
const dict = (entries: Map<string, PdfObject>): PdfObject => ({ kind: 'dict', entries });
const arr = (items: PdfObject[]): PdfObject => ({ kind: 'array', items });

function streamOf(text: string): PdfObject {
  const raw = new TextEncoder().encode(text);
  return { kind: 'stream', dict: new Map<string, PdfObject>([['Length', numv(raw.length)]]), raw };
}

/** /Lang is conventionally a plain ASCII literal string. */
function asciiString(s: string): PdfObject {
  const clean = s.replace(/[^\x20-\x7e]/g, '');
  const bytes = new Uint8Array(clean.length);
  for (let i = 0; i < clean.length; i++) bytes[i] = clean.charCodeAt(i) & 0x7f;
  return { kind: 'string', value: bytes, literal: true };
}

/** Resolve page object refs in document order (for /Pg back-references). */
async function findPageRefs(doc: PdfDocument): Promise<Array<PdfObject & { kind: 'ref' }>> {
  const refs: Array<PdfObject & { kind: 'ref' }> = [];
  if (!doc.root || doc.root.kind !== 'ref') return refs;
  const catalog = await doc.resolveDict(doc.root);
  const pagesRef = catalog.get('Pages');
  if (!pagesRef) return refs;
  await walk(pagesRef);
  return refs;

  async function walk(r: PdfObject): Promise<void> {
    if (r.kind !== 'ref') return;
    const d = await doc.resolveDict(r);
    const type = d.get('Type');
    if (type && type.kind === 'name' && type.value === 'Page') {
      refs.push(r);
      return;
    }
    const kids = d.get('Kids');
    if (kids && kids.kind === 'array') {
      for (const k of kids.items) await walk(k);
    }
  }
}

/**
 * Append accessibility structure to the incremental `updates` map. Builds on
 * top of any catalog / page changes already staged by earlier passes (e.g.
 * overlay burn, new AcroForm fields) so nothing is clobbered.
 */
export async function tagAccessibility(
  doc: PdfDocument,
  opts: A11yTagOptions,
  updates: Map<number, PdfObject>,
  allocObjNum: () => number,
): Promise<void> {
  if (!doc.root || doc.root.kind !== 'ref') return;
  const catalogRef = doc.root;
  const pageRefs = await findPageRefs(doc);
  if (pageRefs.length === 0) return;

  // A page's "best" heading text → /ActualText label for its element.
  const labelByPage = new Map<number, string>();
  for (const h of opts.headings ?? []) {
    if (h.text.trim() && !labelByPage.has(h.page)) labelByPage.set(h.page, h.text.trim());
  }

  // Reserve object numbers up front (elements reference each other).
  const strNum = allocObjNum();
  const parentTreeNum = allocObjNum();
  const docNum = allocObjNum();
  const strRef = ref(strNum);
  const docElemRef = ref(docNum);

  const pageElemRefs: PdfObject[] = [];
  const parentTreeNums: PdfObject[] = [];

  for (let i = 0; i < pageRefs.length; i++) {
    const pageRef = pageRefs[i]!;

    // Read the most recent page dict (a staged update if present, e.g. from
    // the overlay or page-organization passes).
    const stagedPage = updates.get(pageRef.objectNumber);
    const basePage =
      stagedPage && stagedPage.kind === 'dict' ? stagedPage.entries : await doc.resolveDict(pageRef);
    const pageCopy = new Map(basePage);

    // Per-paragraph tagging: bracket every BT…ET text object in the page's
    // content streams with /P <</MCID n>> BDC … EMC. Streams already staged
    // by earlier passes (redaction!) are read from `updates` so their edits
    // are preserved.
    const existing = pageCopy.get('Contents');
    const streamRefs: Array<PdfObject & { kind: 'ref' }> = [];
    if (existing?.kind === 'ref') streamRefs.push(existing);
    else if (existing?.kind === 'array') {
      for (const it of existing.items) if (it.kind === 'ref') streamRefs.push(it);
    }

    let mcid = 0;
    for (const sref of streamRefs) {
      const stagedObj = updates.get(sref.objectNumber);
      const obj = stagedObj ?? (await doc.resolve(sref));
      if (obj.kind !== 'stream') continue;
      const decoded = await decodeStream(obj);
      // Find BT/ET operator offsets via the shared tokenizer (string/dict-safe).
      const inserts: Array<{ at: number; text: string }> = [];
      for (const tok of tokenizeContent(decoded)) {
        if (tok.type !== 'op') continue;
        const op = String.fromCharCode(...decoded.subarray(tok.start, tok.end));
        if (op === 'BT') inserts.push({ at: tok.start, text: `/P <</MCID ${mcid++}>> BDC\n` });
        else if (op === 'ET') inserts.push({ at: tok.end, text: '\nEMC\n' });
      }
      if (inserts.length === 0) continue;
      const parts: Uint8Array[] = [];
      let cursor = 0;
      for (const ins of inserts) {
        parts.push(decoded.subarray(cursor, ins.at), new TextEncoder().encode(ins.text));
        cursor = ins.at;
      }
      parts.push(decoded.subarray(cursor));
      const total = parts.reduce((n, x) => n + x.length, 0);
      const out = new Uint8Array(total);
      let o = 0;
      for (const x of parts) { out.set(x, o); o += x.length; }
      const sdict = new Map(obj.dict);
      sdict.delete('Filter');
      sdict.delete('DecodeParms');
      sdict.delete('DL');
      sdict.set('Length', numv(out.length));
      updates.set(sref.objectNumber, { kind: 'stream', dict: sdict, raw: out });
    }

    // Fallback: no text objects found — wrap the whole page as one region so
    // the page is still represented in the structure tree.
    if (mcid === 0) {
      const bdcRef = allocStore(streamOf('/P <</MCID 0>> BDC\n'), allocObjNum, updates);
      const emcRef = allocStore(streamOf('\nEMC'), allocObjNum, updates);
      const items: PdfObject[] =
        !existing ? [] : existing.kind === 'array' ? [...existing.items] : [existing];
      pageCopy.set('Contents', arr([bdcRef, ...items, emcRef]));
      mcid = 1;
    }

    // /StructParents key into the ParentTree for this page's marked content.
    pageCopy.set('StructParents', numv(i));
    updates.set(pageRef.objectNumber, dict(pageCopy));

    // One /P element per marked-content sequence (paragraph) on this page.
    const pageParentArr: PdfObject[] = [];
    for (let k = 0; k < mcid; k++) {
      const elemNum = allocObjNum();
      const e = new Map<string, PdfObject>();
      e.set('Type', name('StructElem'));
      e.set('S', name('P'));
      e.set('P', docElemRef);
      e.set('Pg', pageRef);
      e.set('K', numv(k));
      const label = labelByPage.get(i + 1);
      if (k === 0 && label) e.set('ActualText', makeTextString(label));
      updates.set(elemNum, dict(e));
      pageElemRefs.push(ref(elemNum));
      pageParentArr.push(ref(elemNum));
    }
    // ParentTree: key i → array indexed by MCID.
    parentTreeNums.push(numv(i), arr(pageParentArr));
  }

  // Document element holds the page elements in reading order.
  const docElem = new Map<string, PdfObject>();
  docElem.set('Type', name('StructElem'));
  docElem.set('S', name('Document'));
  docElem.set('P', strRef);
  docElem.set('K', arr(pageElemRefs));
  updates.set(docNum, dict(docElem));

  // Number tree mapping /StructParents keys → elements.
  const parentTree = new Map<string, PdfObject>([['Nums', arr(parentTreeNums)]]);
  updates.set(parentTreeNum, dict(parentTree));

  // Structure tree root.
  const structRoot = new Map<string, PdfObject>();
  structRoot.set('Type', name('StructTreeRoot'));
  structRoot.set('K', docElemRef);
  structRoot.set('ParentTree', ref(parentTreeNum));
  structRoot.set('ParentTreeNextKey', numv(pageRefs.length));
  updates.set(strNum, dict(structRoot));

  // Catalog: build on the latest staged catalog; only ADD keys.
  const stagedCat = updates.get(catalogRef.objectNumber);
  const baseCatalog =
    stagedCat && stagedCat.kind === 'dict' ? stagedCat.entries : await doc.resolveDict(catalogRef);
  const newCatalog = new Map(baseCatalog);

  newCatalog.set('MarkInfo', dict(new Map([['Marked', bool(true)]])));
  if (opts.lang) newCatalog.set('Lang', asciiString(opts.lang));

  const vpEntry = baseCatalog.get('ViewerPreferences');
  const vp = vpEntry ? new Map(await doc.resolveDict(vpEntry)) : new Map<string, PdfObject>();
  vp.set('DisplayDocTitle', bool(true));
  newCatalog.set('ViewerPreferences', dict(vp));

  newCatalog.set('StructTreeRoot', strRef);
  updates.set(catalogRef.objectNumber, dict(newCatalog));
}

function allocStore(
  obj: PdfObject,
  allocObjNum: () => number,
  updates: Map<number, PdfObject>,
): PdfObject & { kind: 'ref' } {
  const n = allocObjNum();
  updates.set(n, obj);
  return { kind: 'ref', objectNumber: n, generation: 0 };
}

// ── read-back: audit a document's accessibility state ────────────────────────

export interface A11ySummary {
  /** /MarkInfo <</Marked true>> present. */
  marked: boolean;
  /** /StructTreeRoot present in the catalog. */
  hasStructTree: boolean;
  /** Catalog /Lang, decoded to ASCII, or null. */
  lang: string | null;
  /** /ViewerPreferences /DisplayDocTitle true. */
  displayDocTitle: boolean;
}

/**
 * Inspect the catalog for the accessibility markers `tagAccessibility`
 * writes (and that validators look for). Used by the compliance audit to
 * check a document BEFORE remediation and to independently verify the
 * remediated output.
 */
export async function readAccessibilitySummary(doc: PdfDocument): Promise<A11ySummary> {
  const out: A11ySummary = { marked: false, hasStructTree: false, lang: null, displayDocTitle: false };
  if (!doc.root || doc.root.kind !== 'ref') return out;
  const catalog = await doc.resolveDict(doc.root);

  const mi = catalog.get('MarkInfo');
  if (mi) {
    const d = await doc.resolveDict(mi);
    const marked = d.get('Marked');
    out.marked = !!(marked && marked.kind === 'bool' && marked.value);
  }
  out.hasStructTree = !!catalog.get('StructTreeRoot');

  const lang = catalog.get('Lang');
  if (lang && lang.kind === 'string') {
    let s = '';
    for (const b of lang.value) s += String.fromCharCode(b);
    out.lang = s.replace(/^\xfe\xff/, '') || null;
  }

  const vp = catalog.get('ViewerPreferences');
  if (vp) {
    const d = await doc.resolveDict(vp);
    const ddt = d.get('DisplayDocTitle');
    out.displayDocTitle = !!(ddt && ddt.kind === 'bool' && ddt.value);
  }
  return out;
}
