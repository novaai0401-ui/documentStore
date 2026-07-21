import type { PdfDocument } from './document.js';
import type { PdfObject } from './types.js';

export type FieldType =
  | 'text'
  | 'multiline'
  | 'checkbox'
  | 'radio'
  | 'dropdown'
  | 'listbox'
  | 'button';

export interface FormFieldDescriptor {
  id: string;
  type: FieldType;
  rect: [number, number, number, number];
  page: number;
  required: boolean;
  readOnly: boolean;
  value: string | boolean | string[] | null;
  /** Display values (what the user sees). For dropdowns/listboxes with
   *  /Opt items shaped as [export, display] pairs, this is the display
   *  half — the export half is captured separately in `optionValues`. */
  options?: string[];
  /** Export values for dropdowns/listboxes. Same length as `options`.
   *  When the producer used plain string /Opt items, this is identical
   *  to `options`. When they used [export, display] pairs, this is the
   *  export half — what must go into /V on save. */
  optionValues?: string[];
  /** Object number of the underlying field, for write-back. */
  objectNumber: number;
  /** Optional human-readable label from /TU (alt-text / tooltip). */
  label?: string;
  /** For checkboxes: the "on" appearance-state name from this widget's
   *  /AP/N dict. Often /Yes, but can be /On, /Choice1, or any custom
   *  name the producer chose. */
  checkedStateName?: string;
  /** All widget object numbers backing this field. For checkboxes/radios
   *  with multiple widgets, every widget needs its /AS updated on save.
   *  Only populated when the field has /Kids; absent for leaf widgets. */
  widgetObjectNumbers?: number[];
  /** /MaxLen — maximum number of characters for /Tx text fields. Absent
   *  when the producer didn't set a limit. */
  maxLength?: number;
  /** True when /Ff bit 25 (Comb) is set AND /MaxLen is present. The text
   *  is divided into N equally-spaced cells (think SSN/phone fields). */
  comb?: boolean;
  /** True when /Ff bit 14 (Password) is set — text rendered as bullets. */
  password?: boolean;
}

const TEXT_FIELD_FLAG_MULTILINE = 1 << 12;  // bit 13
const TEXT_FIELD_FLAG_PASSWORD  = 1 << 13;  // bit 14
const TEXT_FIELD_FLAG_COMB      = 1 << 24;  // bit 25

export interface ExtractDiagnostics {
  catalogFound: boolean;
  acroFormFound: boolean;
  acroFormKind: 'ref' | 'inline-dict' | 'missing' | 'unexpected';
  xfaPresent: boolean;
  fieldsArrayLength: number;
  /** Widget annotations found on pages and added by the fallback scan. */
  pageAnnotationWidgetCount: number;
  emittedDescriptorCount: number;
  /** Field-tree leaves we skipped (e.g. no /T name). */
  skippedFieldCount: number;
}

/**
 * Walk /Root → /AcroForm → /Fields recursively and emit one descriptor
 * per widget. Widgets that aren't matched to a page report page=0.
 *
 * The optional `onDiagnose` callback fires once with structural facts
 * about what was found, useful for telling apart "no AcroForm at all",
 * "XFA-only form (we can't read these yet)", and "AcroForm present but
 * all leaves skipped".
 */
export async function extractFormFields(
  doc: PdfDocument,
  onDiagnose?: (diag: ExtractDiagnostics) => void,
): Promise<FormFieldDescriptor[]> {
  const diag: ExtractDiagnostics = {
    catalogFound: false,
    acroFormFound: false,
    acroFormKind: 'missing',
    xfaPresent: false,
    fieldsArrayLength: 0,
    pageAnnotationWidgetCount: 0,
    emittedDescriptorCount: 0,
    skippedFieldCount: 0,
  };
  const report = () => onDiagnose?.(diag);

  const rootRef = doc.root;
  if (!rootRef) { report(); return []; }
  const catalog = await doc.resolveDict(rootRef);
  diag.catalogFound = true;

  const acroFormEntry = catalog.get('AcroForm');
  let acroForm: Map<string, PdfObject> | null = null;
  if (acroFormEntry) {
    diag.acroFormFound = true;
    diag.acroFormKind =
      acroFormEntry.kind === 'ref' ? 'ref' :
      acroFormEntry.kind === 'dict' ? 'inline-dict' : 'unexpected';
    acroForm = await doc.resolveDict(acroFormEntry);
    if (acroForm.has('XFA')) diag.xfaPresent = true;
  }

  const pageIndex = await buildPageIndex(doc, catalog);
  const out: FormFieldDescriptor[] = [];
  const seenObjNums = new Set<number>();

  // Primary path: /AcroForm/Fields tree walk.
  if (acroForm) {
    const fieldsArr = acroForm.get('Fields');
    if (fieldsArr && fieldsArr.kind === 'array') {
      diag.fieldsArrayLength = fieldsArr.items.length;
      for (const ref of fieldsArr.items) {
        await walkField(doc, ref, /* inherited */ {}, pageIndex, out);
      }
      for (const d of out) seenObjNums.add(d.objectNumber);
    }
  }

  // Complementary path: scan each page's /Annots for widget annotations
  // that didn't surface through /AcroForm/Fields. Some PDFs (e.g.
  // certain Form 15G generations) register widgets only on pages.
  // For each /Subtype/Widget annotation, walk up /Parent to gather
  // inherited /FT, /Ff, /V, and the full dotted field name.
  await scanPageAnnotations(doc, catalog, pageIndex, out, seenObjNums, diag);

  diag.emittedDescriptorCount = out.length;
  diag.skippedFieldCount = Math.max(0, diag.fieldsArrayLength - out.length);
  report();
  return out;
}

/**
 * Walk every page's /Annots looking for widget annotations that the
 * /AcroForm/Fields traversal missed. Resolves field name + inheritance
 * by climbing the /Parent chain on each widget.
 */
async function scanPageAnnotations(
  doc: PdfDocument,
  catalog: Map<string, PdfObject>,
  pageIndex: Map<number, number>,
  out: FormFieldDescriptor[],
  seenObjNums: Set<number>,
  diag: ExtractDiagnostics,
): Promise<void> {
  const pagesRef = catalog.get('Pages');
  if (!pagesRef) return;
  const pageRefs: Array<PdfObject & { kind: 'ref' }> = [];
  await walkPageTree(doc, pagesRef, (objNum) => {
    pageRefs.push({ kind: 'ref', objectNumber: objNum, generation: 0 });
  });

  for (let i = 0; i < pageRefs.length; i++) {
    const pageRef = pageRefs[i]!;
    const currentPageNumber = pageIndex.get(pageRef.objectNumber) ?? i + 1;
    const page = await doc.resolveDict(pageRef);
    let annots = page.get('Annots');
    // /Annots may be an indirect reference to an array object — common
    // when the array is large. Resolve before iterating.
    if (annots && annots.kind === 'ref') annots = await doc.resolve(annots);
    if (!annots || annots.kind !== 'array') continue;
    for (const annotRef of annots.items) {
      if (annotRef.kind !== 'ref') continue;
      if (seenObjNums.has(annotRef.objectNumber)) continue;
      const annot = await doc.resolveDict(annotRef);
      if (getName(annot.get('Subtype')) !== 'Widget') continue;
      diag.pageAnnotationWidgetCount++;

      // Walk /Parent up to gather inheritance + full name. The widget's
      // own /FT and /Ff override inherited ones (orphan widgets put their
      // type directly on the widget rather than on a parent field node).
      const inh = await resolveInheritedFromParent(doc, annot);
      const widgetFT = getName(annot.get('FT')) ?? inh.ft;
      const widgetFF = getNum(annot.get('Ff')) ?? inh.ff;
      const widgetV = annot.get('V') ?? inh.v;
      const widgetOpt = annot.get('Opt') ?? inh.opt;
      const partialName = await resolveString(doc, annot.get('T'));
      const fullName = partialName
        ? inh.parentName
          ? `${inh.parentName}.${partialName}`
          : partialName
        : inh.parentName ?? '';

      if (!fullName) continue;
      seenObjNums.add(annotRef.objectNumber);
      const labelTU = await resolveString(doc, annot.get('TU'));
      const onState = await readOnStateName(doc, annot);
      emit(
        annotRef,
        annot,
        fullName,
        widgetFT,
        widgetFF,
        widgetV,
        widgetOpt,
        pageIndex,
        out,
        currentPageNumber,
        labelTU,
        onState,
        [annotRef.objectNumber],
      );
    }
  }
}

async function resolveInheritedFromParent(
  doc: PdfDocument,
  widget: Map<string, PdfObject>,
): Promise<Inherited> {
  const inh: Inherited = {};
  // Climb /Parent chain, collecting the first /FT, /Ff, /V, /Opt we see
  // and assembling the dotted name from each /T encountered.
  let current = widget;
  const nameParts: string[] = [];
  const visited = new Set<number>();
  while (true) {
    const parentRef = current.get('Parent');
    if (!parentRef || parentRef.kind !== 'ref') break;
    if (visited.has(parentRef.objectNumber)) break;
    visited.add(parentRef.objectNumber);
    const parent = await doc.resolveDict(parentRef);
    const t = getStringValue(parent.get('T'));
    if (t) nameParts.unshift(t);
    if (inh.ft === undefined) {
      const ft = getName(parent.get('FT'));
      if (ft) inh.ft = ft;
    }
    if (inh.ff === undefined) {
      const ff = getNum(parent.get('Ff'));
      if (ff !== undefined) inh.ff = ff;
    }
    if (inh.v === undefined && parent.has('V')) inh.v = parent.get('V');
    if (inh.opt === undefined && parent.has('Opt')) inh.opt = parent.get('Opt');
    current = parent;
  }
  if (nameParts.length > 0) inh.parentName = nameParts.join('.');
  return inh;
}

interface Inherited {
  ft?: string;
  ff?: number;
  v?: PdfObject;
  opt?: PdfObject;
  parentName?: string;
}

async function walkField(
  doc: PdfDocument,
  ref: PdfObject,
  inherited: Inherited,
  pageIndex: Map<number, number>,
  out: FormFieldDescriptor[],
): Promise<void> {
  if (ref.kind !== 'ref') return;
  const dict = await doc.resolveDict(ref);

  const ft = (getName(dict.get('FT')) ?? inherited.ft) as string | undefined;
  const ff = getNum(dict.get('Ff')) ?? inherited.ff;
  const value = dict.get('V') ?? inherited.v;
  const opt = dict.get('Opt') ?? inherited.opt;

  const partial = getStringValue(dict.get('T'));
  const fullName = partial
    ? inherited.parentName
      ? `${inherited.parentName}.${partial}`
      : partial
    : inherited.parentName;

  const kids = dict.get('Kids');
  if (kids && kids.kind === 'array' && kids.items.length > 0) {
    const kidRefs = kids.items.filter((k): k is PdfObject & { kind: 'ref' } => k.kind === 'ref');
    const kidDicts: Array<{ k: PdfObject & { kind: 'ref' }; dict: Map<string, PdfObject> }> = [];
    for (const k of kidRefs) kidDicts.push({ k, dict: await doc.resolveDict(k) });

    const anyHasT = kidDicts.some((kd) => kd.dict.has('T'));
    if (anyHasT) {
      for (const kd of kidDicts) {
        await walkField(
          doc,
          kd.k,
          { ft, ff, v: value, opt, parentName: fullName },
          pageIndex,
          out,
        );
      }
      return;
    }
    // Multi-widget leaf: emit one descriptor per widget. Collect every
    // widget's object number so the writer can update each /AS.
    const widgetObjNums = kidDicts.map((kd) => kd.k.objectNumber);
    for (const kd of kidDicts) {
      const label = await resolveString(doc, kd.dict.get('TU'));
      const onState = await readOnStateName(doc, kd.dict);
      emit(
        ref, kd.dict, fullName ?? '', ft, ff, value, opt,
        pageIndex, out, undefined, label, onState, widgetObjNums,
      );
    }
    return;
  }

  // Single-widget leaf: the field dict IS the widget — its own object
  // number is the lone widget number.
  const label = await resolveString(doc, dict.get('TU'));
  const onState = await readOnStateName(doc, dict);
  emit(
    ref, dict, fullName ?? '', ft, ff, value, opt,
    pageIndex, out, undefined, label, onState, [ref.objectNumber],
  );
}

/**
 * Look up the "on" appearance-state name for a check/radio widget by
 * inspecting its /AP /N dict. /N has one entry per visual state; the
 * key that isn't "Off" is the checked-state name. PDF spec allows
 * *any* name — the writer must read this rather than guessing.
 *
 * Follows indirect refs at every level: /AP itself, /AP/N, and the
 * /AP/N entries (which are XObject streams).
 */
export async function readOnStateName(
  doc: PdfDocument,
  widget: Map<string, PdfObject>,
): Promise<string | undefined> {
  let ap = widget.get('AP');
  if (!ap) return undefined;
  if (ap.kind === 'ref') ap = await doc.resolve(ap);
  let apDict: Map<string, PdfObject> | null = null;
  if (ap.kind === 'dict') apDict = ap.entries;
  else if (ap.kind === 'stream') apDict = ap.dict;
  if (!apDict) return undefined;

  let n = apDict.get('N');
  if (!n) return undefined;
  if (n.kind === 'ref') n = await doc.resolve(n);
  let nDict: Map<string, PdfObject> | null = null;
  if (n.kind === 'dict') nDict = n.entries;
  else if (n.kind === 'stream') nDict = n.dict;
  if (!nDict) return undefined;

  for (const key of nDict.keys()) {
    if (key !== 'Off' && key !== 'Type' && key !== 'Subtype' && key !== 'Length' &&
        key !== 'Filter' && key !== 'DecodeParms' && key !== 'BBox' && key !== 'Matrix' &&
        key !== 'FormType' && key !== 'Resources') {
      return key;
    }
  }
  return undefined;
}

function emit(
  fieldRef: PdfObject & { kind: 'ref' },
  widgetDict: Map<string, PdfObject>,
  name: string,
  ft: string | undefined,
  ff: number | undefined,
  value: PdfObject | undefined,
  opt: PdfObject | undefined,
  pageIndex: Map<number, number>,
  out: FormFieldDescriptor[],
  pageOverride?: number,
  labelOverride?: string,
  checkedStateName?: string,
  widgetObjectNumbers?: number[],
): void {
  if (!name) return; // skip nameless

  const type = classify(ft, ff);
  const rect = getRect(widgetDict.get('Rect'));
  if (!rect) return;

  // Page resolution: caller's override wins (used when we iterate pages
  // from scanPageAnnotations and already know the number). Otherwise
  // look up via /P (the widget's back-pointer to the owning page).
  let page = pageOverride ?? 0;
  if (!page) {
    const pRef = widgetDict.get('P');
    if (pRef && pRef.kind === 'ref') {
      page = pageIndex.get(pRef.objectNumber) ?? 0;
    }
  }

  const flags = ff ?? 0;
  const label = labelOverride;
  const opts = parseOptionsBoth(opt);

  // /Tx-specific extras. /MaxLen is shared across producers; /Ff bits
  // 14 (Password) and 25 (Comb) are field-type flag bits we surface so
  // the form view can render appropriately.
  let maxLength: number | undefined;
  let comb: boolean | undefined;
  let password: boolean | undefined;
  if (ft === 'Tx') {
    const ml = widgetDict.get('MaxLen');
    if (ml && ml.kind === 'num' && ml.value > 0) maxLength = ml.value;
    if ((flags & TEXT_FIELD_FLAG_PASSWORD) !== 0) password = true;
    if ((flags & TEXT_FIELD_FLAG_COMB) !== 0 && maxLength) comb = true;
  }

  out.push({
    id: name,
    type,
    rect,
    page,
    required: (flags & 0b10) !== 0,
    readOnly: (flags & 0b1) !== 0,
    value: parseValue(value, type),
    ...(opts ? { options: opts.display, optionValues: opts.export } : {}),
    objectNumber: fieldRef.objectNumber,
    ...(label ? { label } : {}),
    ...(checkedStateName ? { checkedStateName } : {}),
    ...(widgetObjectNumbers && widgetObjectNumbers.length ? { widgetObjectNumbers } : {}),
    ...(maxLength !== undefined ? { maxLength } : {}),
    ...(comb ? { comb: true } : {}),
    ...(password ? { password: true } : {}),
  });
}

function classify(ft: string | undefined, ff: number | undefined): FieldType {
  if (ft === 'Tx') return ((ff ?? 0) & TEXT_FIELD_FLAG_MULTILINE) !== 0 ? 'multiline' : 'text';
  if (ft === 'Btn') {
    const flags = ff ?? 0;
    if ((flags & (1 << 15)) !== 0) return 'radio';
    if ((flags & (1 << 16)) !== 0) return 'button'; // pushbutton
    return 'checkbox';
  }
  if (ft === 'Ch') return ((ff ?? 0) & (1 << 17)) !== 0 ? 'dropdown' : 'listbox';
  return 'button';
}

function parseValue(v: PdfObject | undefined, type: FieldType): FormFieldDescriptor['value'] {
  if (!v || v.kind === 'null') return null;
  if (type === 'checkbox') {
    return v.kind === 'name' && v.value !== 'Off';
  }
  if (type === 'radio') {
    // For radios /V is the selected button's name. "Off" means none selected.
    if (v.kind === 'name') return v.value === 'Off' ? null : v.value;
    return null;
  }
  if (type === 'listbox') {
    // Listboxes are conceptually multi-select even when only one value is
    // currently selected. Normalize so consumers don't have to type-check.
    if (v.kind === 'array') {
      const out: string[] = [];
      for (const it of v.items) {
        if (it.kind === 'string') out.push(decodePdfString(it.value));
        else if (it.kind === 'name') out.push(it.value);
      }
      return out;
    }
    if (v.kind === 'string') return [decodePdfString(v.value)];
    if (v.kind === 'name') return [v.value];
    return null;
  }
  // text / multiline / dropdown / button
  if (v.kind === 'string') return decodePdfString(v.value);
  if (v.kind === 'name') return v.value;
  if (v.kind === 'array') {
    const out: string[] = [];
    for (const it of v.items) {
      if (it.kind === 'string') out.push(decodePdfString(it.value));
      else if (it.kind === 'name') out.push(it.value);
    }
    return out;
  }
  return null;
}

function parseOptions(opt: PdfObject | undefined): string[] | undefined {
  return parseOptionsBoth(opt)?.display;
}

/**
 * Decode /Opt into both display labels and export values. PDF spec
 * lets each item be either a plain string (display = export) or a
 * 2-element array [export, display]. Producers use the array form
 * when the on-screen text differs from the value that should appear
 * in /V (very common for code-keyed dropdowns).
 */
function parseOptionsBoth(
  opt: PdfObject | undefined,
): { display: string[]; export: string[] } | undefined {
  if (!opt || opt.kind !== 'array') return undefined;
  const display: string[] = [];
  const exp: string[] = [];
  for (const it of opt.items) {
    if (it.kind === 'string') {
      const s = decodePdfString(it.value);
      display.push(s);
      exp.push(s);
    } else if (it.kind === 'name') {
      display.push(it.value);
      exp.push(it.value);
    } else if (it.kind === 'array' && it.items.length >= 2) {
      const e = it.items[0]!;
      const d = it.items[1]!;
      const exportStr =
        e.kind === 'string' ? decodePdfString(e.value) :
        e.kind === 'name' ? e.value : '';
      const displayStr =
        d.kind === 'string' ? decodePdfString(d.value) :
        d.kind === 'name' ? d.value : '';
      exp.push(exportStr);
      display.push(displayStr || exportStr);
    }
  }
  return { display, export: exp };
}

function getRect(r: PdfObject | undefined): [number, number, number, number] | null {
  if (!r || r.kind !== 'array' || r.items.length < 4) return null;
  const nums = r.items.slice(0, 4).map((x) => (x.kind === 'num' ? x.value : NaN));
  if (nums.some(Number.isNaN)) return null;
  // PDF /Rect is [llx, lly, urx, ury]; convert to [x, y, w, h] (origin bottom-left)
  const [llx, lly, urx, ury] = nums as [number, number, number, number];
  return [llx, lly, urx - llx, ury - lly];
}

async function buildPageIndex(doc: PdfDocument, catalog: Map<string, PdfObject>): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const pagesRef = catalog.get('Pages');
  if (!pagesRef) return out;
  const counter = { n: 1 };
  await walkPageTree(doc, pagesRef, (objNum) => out.set(objNum, counter.n++));
  return out;
}

async function walkPageTree(
  doc: PdfDocument,
  ref: PdfObject,
  onLeaf: (objNum: number) => void,
): Promise<void> {
  if (ref.kind !== 'ref') return;
  const dict = await doc.resolveDict(ref);
  const type = getName(dict.get('Type'));
  if (type === 'Page') {
    onLeaf(ref.objectNumber);
    return;
  }
  const kids = dict.get('Kids');
  if (kids && kids.kind === 'array') {
    for (const k of kids.items) await walkPageTree(doc, k, onLeaf);
  }
}

function getName(o: PdfObject | undefined): string | undefined {
  return o && o.kind === 'name' ? o.value : undefined;
}

function getNum(o: PdfObject | undefined): number | undefined {
  return o && o.kind === 'num' ? o.value : undefined;
}

function getStringValue(o: PdfObject | undefined): string | undefined {
  if (!o) return undefined;
  if (o.kind === 'string') return decodePdfString(o.value);
  if (o.kind === 'name') return o.value;
  return undefined;
}

/**
 * Resolve a PdfObject that should yield a string, following one level of
 * indirect reference. PDFs commonly store reusable strings (e.g. /TU
 * descriptions shared across widgets) as standalone string objects with
 * /TU pointing at them.
 */
async function resolveString(doc: PdfDocument, o: PdfObject | undefined): Promise<string | undefined> {
  if (!o) return undefined;
  if (o.kind === 'ref') {
    const resolved = await doc.resolve(o);
    return getStringValue(resolved);
  }
  return getStringValue(o);
}

/**
 * PDFDocEncoding lookup table (PDF spec §D.2). 256 entries — most match
 * Latin-1 / Windows-1252 but a handful diverge (0x18-0x1F control range
 * remapped to common punctuation, 0x80-0x9F remapped to typographer
 * characters, 0xA0 = nbsp, 0xAD = soft hyphen as defined).
 *
 * Slots marked 0 are reserved/undefined per spec.
 */
const PDF_DOC_ENCODING: number[] = (() => {
  const t = new Array(256);
  // 0x00..0x17: same as Latin-1 (most control codes; we keep them raw).
  for (let i = 0; i < 0x18; i++) t[i] = i;
  // 0x18..0x1F: PDFDocEncoding-specific punctuation.
  t[0x18] = 0x02d8; // breve
  t[0x19] = 0x02c7; // caron
  t[0x1a] = 0x02c6; // circumflex
  t[0x1b] = 0x02d9; // dot above
  t[0x1c] = 0x02dd; // double acute
  t[0x1d] = 0x02db; // ogonek
  t[0x1e] = 0x02da; // ring above
  t[0x1f] = 0x02dc; // small tilde
  // 0x20..0x7E: ASCII.
  for (let i = 0x20; i < 0x7f; i++) t[i] = i;
  // 0x7F undefined.
  t[0x7f] = 0;
  // 0x80..0x9F: typographer characters.
  t[0x80] = 0x2022; // bullet
  t[0x81] = 0x2020; // dagger
  t[0x82] = 0x2021; // double dagger
  t[0x83] = 0x2026; // ellipsis
  t[0x84] = 0x2014; // em dash
  t[0x85] = 0x2013; // en dash
  t[0x86] = 0x0192; // florin
  t[0x87] = 0x2044; // fraction slash
  t[0x88] = 0x2039; // single left guillemet
  t[0x89] = 0x203a; // single right guillemet
  t[0x8a] = 0x2212; // minus
  t[0x8b] = 0x2030; // per mille
  t[0x8c] = 0x201e; // double low-9 quote
  t[0x8d] = 0x201c; // left double quote
  t[0x8e] = 0x201d; // right double quote
  t[0x8f] = 0x2018; // left single quote
  t[0x90] = 0x2019; // right single quote
  t[0x91] = 0x201a; // single low-9 quote
  t[0x92] = 0x2122; // trademark
  t[0x93] = 0xfb01; // fi ligature
  t[0x94] = 0xfb02; // fl ligature
  t[0x95] = 0x0141; // L stroke
  t[0x96] = 0x0152; // OE ligature
  t[0x97] = 0x0160; // S caron
  t[0x98] = 0x0178; // Y diaeresis
  t[0x99] = 0x017d; // Z caron
  t[0x9a] = 0x0131; // dotless i
  t[0x9b] = 0x0142; // l stroke
  t[0x9c] = 0x0153; // oe ligature
  t[0x9d] = 0x0161; // s caron
  t[0x9e] = 0x017e; // z caron
  t[0x9f] = 0;      // undefined
  // 0xA0..0xFF: same code points as Latin-1, with two exceptions reserved
  // (0xA1 = exclam-down: actually Latin-1; we keep it). 0xAD soft-hyphen
  // is undefined per PDFDocEncoding spec, but treating it as Latin-1 is
  // the lenient choice.
  for (let i = 0xa0; i < 0x100; i++) t[i] = i;
  return t;
})();

/**
 * Decode a PDF text string. Two encodings can appear:
 *   - UTF-16BE: starts with BOM bytes 0xFE 0xFF
 *   - PDFDocEncoding (PDF §D.2) — Latin-1-ish, but with the 0x18-0x1F
 *     and 0x80-0x9F slots remapped to typographic Unicode code points.
 */
function decodePdfString(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    // UTF-16BE after the BOM
    let s = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      s += String.fromCharCode((bytes[i]! << 8) | bytes[i + 1]!);
    }
    return s;
  }
  // PDFDocEncoding via the lookup table.
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    const cp = PDF_DOC_ENCODING[bytes[i]!] ?? 0;
    if (cp > 0) s += String.fromCharCode(cp);
  }
  return s;
}
