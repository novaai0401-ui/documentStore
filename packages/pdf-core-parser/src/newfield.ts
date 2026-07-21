/**
 * Create new AcroForm fields and stitch them into an existing PDF.
 *
 * Public input: an array of NewFieldDescriptor (type, name, page, rect-in-CSS,
 * default value, options if applicable).
 *
 * Output side-effects (via the shared `updates` map the incremental writer
 * consumes):
 *   - One new indirect object per field — the /Widget annotation dict
 *   - One /XObject /Form per field — the /AP/N appearance stream
 *   - Modified page dict with the widget ref appended to /Annots
 *   - Modified /AcroForm dict (or freshly-created one) with the widget
 *     ref appended to /Fields, plus /NeedAppearances=true
 *   - Modified catalog dict when /AcroForm needed to be created
 *
 * Coordinate model mirrors overlays.ts: the caller passes CSS-pixel coords
 * relative to the page's top-left plus the CSS dimensions at render time;
 * we convert to PDF user space (origin bottom-left) using /MediaBox.
 */
import type { PdfDocument } from './document.js';
import {
  buildAppearanceXObject,
  buildTextAppearanceContent,
  parseDA,
} from './appearance.js';
import { makeTextString } from './writer.js';
import type { PdfObject } from './types.js';

export type NewFieldType = 'text' | 'multiline' | 'checkbox' | 'dropdown' | 'listbox' | 'signature' | 'date';

export interface NewFieldDescriptor {
  /** AcroForm field type. */
  type: NewFieldType;
  /** Field name shown in the form (/T entry). Must be unique per AcroForm. */
  name: string;
  /** 1-based page number. */
  page: number;
  /** Rect in CSS pixels relative to page top-left. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Page render dimensions in CSS pixels at the time the rect was captured. */
  pageCssWidth: number;
  pageCssHeight: number;
  /** Optional default value. */
  defaultValue?: string | boolean | string[];
  /** Choice options (dropdown / listbox). */
  options?: string[];
  /** Required flag — sets bit 2 of /Ff. */
  required?: boolean;
  /** Read-only flag — sets bit 1 of /Ff. */
  readOnly?: boolean;
}

/**
 * Add the supplied fields to the document. Returns the new widget object
 * numbers in input order so the caller can immediately reference them.
 *
 * Caller workflow:
 *   const widgetNums = await addNewFields(doc, fields, updates, alloc);
 *   // … rest of save: buildIncrementalUpdate(doc, updates)
 */
export async function addNewFields(
  doc: PdfDocument,
  fields: NewFieldDescriptor[],
  updates: Map<number, PdfObject>,
  allocObjNum: () => number,
): Promise<number[]> {
  if (fields.length === 0) return [];

  const pageRefs = await findPageRefs(doc);
  if (!doc.root || doc.root.kind !== 'ref') {
    throw new Error('addNewFields: catalog /Root is not a ref');
  }
  const catalogRef = doc.root;
  const catalog = await doc.resolveDict(catalogRef);

  // Resolve or create /AcroForm.
  const acroFormResult = await resolveOrCreateAcroForm(doc, catalog, catalogRef, updates, allocObjNum);
  const acroFormDict = acroFormResult.dict;
  const fieldsArray = await readFieldsArray(doc, acroFormDict);

  const newWidgetNums: number[] = [];

  for (const f of fields) {
    const widgetObjNum = allocObjNum();
    const pageRef = pageRefs[f.page - 1];
    if (!pageRef) {
      // Skip silently — caller probably has stale page numbers.
      // eslint-disable-next-line no-console
      console.warn(`addNewFields: page ${f.page} not found, skipping field "${f.name}"`);
      continue;
    }

    // CSS → PDF user-space conversion.
    const pdfRect = await cssRectToPdfRect(doc, pageRef, f);

    // Build appearance stream first so we have its ref for /AP/N.
    const apRef = await buildFieldAppearance(f, pdfRect, updates, allocObjNum);

    // The widget annotation dict — /Type Annot + /Subtype Widget + /FT + /T + /V + /Rect + /AP + /F.
    const widgetDict = buildWidgetDict(f, pdfRect, pageRef, apRef);
    updates.set(widgetObjNum, { kind: 'dict', entries: widgetDict });

    // Append to /AcroForm/Fields
    fieldsArray.push({ kind: 'ref', objectNumber: widgetObjNum, generation: 0 });

    // Append to target page's /Annots
    await appendToPageAnnots(doc, pageRef, widgetObjNum, updates);

    newWidgetNums.push(widgetObjNum);
  }

  // Write back the /Fields array on the AcroForm.
  acroFormDict.set('Fields', { kind: 'array', items: fieldsArray });
  acroFormDict.set('NeedAppearances', { kind: 'bool', value: true });
  if (acroFormResult.isRef) {
    updates.set(acroFormResult.objNum!, { kind: 'dict', entries: acroFormDict });
  } else {
    // Inline AcroForm — update the catalog.
    const newCatalog = new Map(catalog);
    newCatalog.set('AcroForm', { kind: 'dict', entries: acroFormDict });
    updates.set(catalogRef.objectNumber, { kind: 'dict', entries: newCatalog });
  }

  return newWidgetNums;
}

// ─────────────────────────────────────────────────────────────────────────────
//   AcroForm resolution / creation
// ─────────────────────────────────────────────────────────────────────────────

interface AcroFormResult {
  dict: Map<string, PdfObject>;
  isRef: boolean;
  /** Set when isRef === true — the object number of the AcroForm dict. */
  objNum: number | null;
}

async function resolveOrCreateAcroForm(
  doc: PdfDocument,
  catalog: Map<string, PdfObject>,
  catalogRef: PdfObject & { kind: 'ref' },
  updates: Map<number, PdfObject>,
  allocObjNum: () => number,
): Promise<AcroFormResult> {
  const af = catalog.get('AcroForm');
  if (!af) {
    // No AcroForm — create one as an inline dict on the catalog so we
    // don't have to allocate two objects when one will do.
    return { dict: new Map(), isRef: false, objNum: null };
  }
  if (af.kind === 'ref') {
    const dict = new Map(await doc.resolveDict(af));
    return { dict, isRef: true, objNum: af.objectNumber };
  }
  if (af.kind === 'dict') {
    return { dict: new Map(af.entries), isRef: false, objNum: null };
  }
  throw new Error('addNewFields: /AcroForm is neither ref nor dict');
}

async function readFieldsArray(
  doc: PdfDocument,
  af: Map<string, PdfObject>,
): Promise<PdfObject[]> {
  const entry = af.get('Fields');
  if (!entry) return [];
  if (entry.kind === 'array') return [...entry.items];
  if (entry.kind === 'ref') {
    const resolved = await doc.resolve(entry);
    if (resolved.kind === 'array') return [...resolved.items];
  }
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
//   Widget dict construction
// ─────────────────────────────────────────────────────────────────────────────

function buildWidgetDict(
  f: NewFieldDescriptor,
  pdfRect: [number, number, number, number],
  pageRef: PdfObject & { kind: 'ref' },
  apRef: PdfObject & { kind: 'ref' } | null,
): Map<string, PdfObject> {
  const widget = new Map<string, PdfObject>();
  widget.set('Type', { kind: 'name', value: 'Annot' });
  widget.set('Subtype', { kind: 'name', value: 'Widget' });
  widget.set('FT', { kind: 'name', value: ftFromType(f.type) });
  widget.set('T', makeTextString(f.name));
  widget.set('Rect', {
    kind: 'array',
    items: pdfRect.map((n) => ({ kind: 'num' as const, value: n })),
  });
  widget.set('P', pageRef);
  // /F 4 = print flag set, all others clear — matches what every PDF
  // editor emits for ordinary visible widgets.
  widget.set('F', { kind: 'num', value: 4 });
  // Default appearance — Helvetica 12pt black.
  widget.set('DA', strLit('/Helv 12 Tf 0 0 0 rg'));

  // /Ff field flags
  let ff = 0;
  if (f.readOnly) ff |= 1 << 0;
  if (f.required) ff |= 1 << 1;
  if (f.type === 'multiline') ff |= 1 << 12;
  if (f.type === 'dropdown') ff |= 1 << 17; // /Ff bit 18: combo (one-line popup)
  // listbox: omit combo bit, /FT = Ch keeps it as list
  if (ff !== 0) widget.set('Ff', { kind: 'num', value: ff });

  // Type-specific entries
  switch (f.type) {
    case 'text':
    case 'multiline':
      widget.set('V', makeTextString(typeof f.defaultValue === 'string' ? f.defaultValue : ''));
      break;
    case 'date':
      // /AA dictionary triggers a date picker in Acrobat; for now we
      // just store as a plain text field — the widget /AA is the
      // pickier route and viewers vary.
      widget.set('V', makeTextString(typeof f.defaultValue === 'string' ? f.defaultValue : ''));
      break;
    case 'checkbox':
      widget.set('V', { kind: 'name', value: f.defaultValue === true ? 'Yes' : 'Off' });
      widget.set('AS', { kind: 'name', value: f.defaultValue === true ? 'Yes' : 'Off' });
      break;
    case 'dropdown':
    case 'listbox': {
      const opts = f.options ?? [];
      widget.set('Opt', {
        kind: 'array',
        items: opts.map((o) => makeTextString(o)),
      });
      const def = typeof f.defaultValue === 'string' ? f.defaultValue : '';
      widget.set('V', makeTextString(def));
      break;
    }
    case 'signature':
      // /Lock + /SV omitted — empty signature field, user can sign later.
      break;
  }

  if (apRef) {
    const apDict = new Map<string, PdfObject>();
    apDict.set('N', apRef);
    widget.set('AP', { kind: 'dict', entries: apDict });
  }
  return widget;
}

function ftFromType(t: NewFieldType): string {
  if (t === 'text' || t === 'multiline' || t === 'date') return 'Tx';
  if (t === 'checkbox') return 'Btn';
  if (t === 'dropdown' || t === 'listbox') return 'Ch';
  if (t === 'signature') return 'Sig';
  return 'Tx';
}

// ─────────────────────────────────────────────────────────────────────────────
//   Appearance stream — reuse appearance.ts helpers
// ─────────────────────────────────────────────────────────────────────────────

async function buildFieldAppearance(
  f: NewFieldDescriptor,
  pdfRect: [number, number, number, number],
  updates: Map<number, PdfObject>,
  allocObjNum: () => number,
): Promise<(PdfObject & { kind: 'ref' }) | null> {
  // Signatures get an empty /AP — Acrobat draws its own placeholder.
  if (f.type === 'signature') return null;

  const w = pdfRect[2] - pdfRect[0];
  const h = pdfRect[3] - pdfRect[1];
  if (w <= 0 || h <= 0) return null;

  let displayText = '';
  if (f.type === 'checkbox') {
    // Render a check glyph when default = true; else empty box.
    displayText = f.defaultValue === true ? '✓' : '';
  } else if (typeof f.defaultValue === 'string') {
    displayText = f.defaultValue;
  } else if (Array.isArray(f.defaultValue)) {
    displayText = f.defaultValue.join('\n');
  }

  const da = '/Helv 12 Tf 0 0 0 rg';
  const content = buildTextAppearanceContent({
    width: w,
    height: h,
    text: displayText,
    da,
    alignment: 0,
    multiline: f.type === 'multiline' || f.type === 'listbox',
  });
  const xobj = buildAppearanceXObject(content, w, h, parseDA(da).fontName);
  const objNum = allocObjNum();
  updates.set(objNum, xobj);
  return { kind: 'ref', objectNumber: objNum, generation: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
//   Page /Annots append
// ─────────────────────────────────────────────────────────────────────────────

async function appendToPageAnnots(
  doc: PdfDocument,
  pageRef: PdfObject & { kind: 'ref' },
  widgetObjNum: number,
  updates: Map<number, PdfObject>,
): Promise<void> {
  // If we've already modified this page in this save, build on that.
  let pageDict: Map<string, PdfObject>;
  const staged = updates.get(pageRef.objectNumber);
  if (staged && staged.kind === 'dict') {
    pageDict = new Map(staged.entries);
  } else {
    pageDict = new Map(await doc.resolveDict(pageRef));
  }

  const ann = pageDict.get('Annots');
  let items: PdfObject[] = [];
  if (ann && ann.kind === 'array') items = [...ann.items];
  else if (ann && ann.kind === 'ref') {
    const a = await doc.resolve(ann);
    if (a.kind === 'array') items = [...a.items];
  }
  items.push({ kind: 'ref', objectNumber: widgetObjNum, generation: 0 });
  pageDict.set('Annots', { kind: 'array', items });
  updates.set(pageRef.objectNumber, { kind: 'dict', entries: pageDict });
}

// ─────────────────────────────────────────────────────────────────────────────
//   CSS → PDF user-space rect
// ─────────────────────────────────────────────────────────────────────────────

async function cssRectToPdfRect(
  doc: PdfDocument,
  pageRef: PdfObject & { kind: 'ref' },
  f: NewFieldDescriptor,
): Promise<[number, number, number, number]> {
  const pageDict = await doc.resolveDict(pageRef);
  const mb = await resolveMediaBox(doc, pageDict);
  const [llx, lly, urx, ury] = mb;
  const pdfWidth = urx - llx;
  const pdfHeight = ury - lly;

  const scale = pdfWidth / f.pageCssWidth;
  // PDF Y axis is bottom-up; CSS Y axis is top-down.
  const xPdf1 = llx + f.x * scale;
  const xPdf2 = llx + (f.x + f.width) * scale;
  const yPdf1 = lly + pdfHeight - (f.y + f.height) * scale;
  const yPdf2 = lly + pdfHeight - f.y * scale;
  return [xPdf1, yPdf1, xPdf2, yPdf2];
}

async function resolveMediaBox(
  doc: PdfDocument,
  pageDict: Map<string, PdfObject>,
): Promise<[number, number, number, number]> {
  const mb = pageDict.get('MediaBox');
  if (mb && mb.kind === 'array' && mb.items.length >= 4) {
    return mb.items.slice(0, 4).map((i) =>
      i.kind === 'num' ? i.value : 0,
    ) as [number, number, number, number];
  }
  // Walk parents until we find one — MediaBox is inheritable.
  const parent = pageDict.get('Parent');
  if (parent && parent.kind === 'ref') {
    return resolveMediaBox(doc, await doc.resolveDict(parent));
  }
  // Default to US Letter if utterly missing.
  return [0, 0, 612, 792];
}

// ─────────────────────────────────────────────────────────────────────────────
//   Page tree walk — duplicate of overlays.ts's helper, intentionally small
//   so we don't cross-import private internals.
// ─────────────────────────────────────────────────────────────────────────────

async function findPageRefs(doc: PdfDocument): Promise<Array<PdfObject & { kind: 'ref' }>> {
  const refs: Array<PdfObject & { kind: 'ref' }> = [];
  if (!doc.root || doc.root.kind !== 'ref') return refs;
  const catalog = await doc.resolveDict(doc.root);
  const pagesRef = catalog.get('Pages');
  if (!pagesRef) return refs;
  await walk(pagesRef);
  return refs;

  async function walk(ref: PdfObject): Promise<void> {
    if (ref.kind !== 'ref') return;
    const dict = await doc.resolveDict(ref);
    const type = dict.get('Type');
    if (type && type.kind === 'name' && type.value === 'Page') {
      refs.push(ref);
      return;
    }
    const kids = dict.get('Kids');
    if (kids && kids.kind === 'array') {
      for (const k of kids.items) await walk(k);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//   Mini helpers
// ─────────────────────────────────────────────────────────────────────────────

function strLit(s: string): PdfObject {
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
  return { kind: 'string', value: bytes, literal: true };
}
