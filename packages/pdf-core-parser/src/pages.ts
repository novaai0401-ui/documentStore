import type { PdfDocument } from './document.js';
import type { PdfObject } from './types.js';

/**
 * Page organization — reorder, delete, rotate, and merge (append pages from
 * other PDFs) — via incremental update.
 *
 * Strategy: build a NEW flat /Pages node whose /Kids list the surviving
 * source pages (in the requested order) followed by deep-copied pages from
 * any appended documents, then point the catalog at it. Each kept page is
 * re-parented and has its inheritable attributes (/MediaBox, /Resources,
 * /CropBox, /Rotate) materialized onto the page dict first — reparenting
 * would otherwise sever attribute inheritance from the old tree.
 *
 * Appending copies each foreign page's entire object graph (resources,
 * fonts, content streams, annotations) into fresh object numbers, with a
 * memo table so shared resources copy once and reference cycles terminate.
 *
 * Notes:
 * - Deleted pages' objects remain as unreferenced garbage in the file
 *   (inherent to incremental update); viewers ignore them. AcroForm /Fields
 *   whose widgets lived ONLY on deleted pages are pruned from the catalog so
 *   no dangling field references survive (fields we can't place are kept).
 * - Appending FROM an encrypted source is rejected (copied streams would
 *   need per-object re-encryption for the target).
 * - Combine page ops with overlay/tagging passes in one save only if those
 *   passes ran first; the demo applies page ops as a standalone export.
 */

export interface PageOps {
  /** 1-based source page numbers to KEEP, in the new order. Omitted pages
   *  are deleted. Defaults to all pages in original order. */
  order?: number[];
  /** Absolute /Rotate (degrees, multiples of 90) per 1-based source page. */
  rotate?: Record<number, number>;
  /** Documents whose pages are appended after the source pages. */
  append?: PdfDocument[];
}

const INHERITABLE = ['Resources', 'MediaBox', 'CropBox', 'Rotate'] as const;

interface Leaf {
  ref: PdfObject & { kind: 'ref' };
  /** Inherited attribute values gathered walking down the tree. */
  inherited: Map<string, PdfObject>;
}

async function collectLeaves(doc: PdfDocument): Promise<Leaf[]> {
  const out: Leaf[] = [];
  if (!doc.root || doc.root.kind !== 'ref') return out;
  const catalog = await doc.resolveDict(doc.root);
  const pagesRef = catalog.get('Pages');
  if (!pagesRef) return out;
  await walk(pagesRef, new Map());
  return out;

  async function walk(r: PdfObject, inherited: Map<string, PdfObject>): Promise<void> {
    if (r.kind !== 'ref') return;
    const d = await doc.resolveDict(r);
    const next = new Map(inherited);
    for (const k of INHERITABLE) {
      const v = d.get(k);
      if (v) next.set(k, v);
    }
    const type = d.get('Type');
    if (type?.kind === 'name' && type.value === 'Page') {
      out.push({ ref: r, inherited });
      return;
    }
    const kids = d.get('Kids');
    if (kids?.kind === 'array') for (const k of kids.items) await walk(k, next);
  }
}

/**
 * Deep-copy `obj` from a foreign document into `updates` under fresh object
 * numbers. `memo` maps source object numbers → target numbers so shared
 * resources copy once and cycles (e.g. /Parent links inside annotations)
 * terminate.
 */
async function deepCopy(
  src: PdfDocument,
  obj: PdfObject,
  memo: Map<number, number>,
  updates: Map<number, PdfObject>,
  allocObjNum: () => number,
): Promise<PdfObject> {
  switch (obj.kind) {
    case 'ref': {
      const seen = memo.get(obj.objectNumber);
      if (seen !== undefined) return { kind: 'ref', objectNumber: seen, generation: 0 };
      const target = allocObjNum();
      memo.set(obj.objectNumber, target); // before recursing — breaks cycles
      const resolved = await src.resolve(obj);
      updates.set(target, await deepCopy(src, resolved, memo, updates, allocObjNum));
      return { kind: 'ref', objectNumber: target, generation: 0 };
    }
    case 'dict': {
      const entries = new Map<string, PdfObject>();
      for (const [k, v] of obj.entries) entries.set(k, await deepCopy(src, v, memo, updates, allocObjNum));
      return { kind: 'dict', entries };
    }
    case 'array': {
      const items: PdfObject[] = [];
      for (const it of obj.items) items.push(await deepCopy(src, it, memo, updates, allocObjNum));
      return { kind: 'array', items };
    }
    case 'stream': {
      const dict = new Map<string, PdfObject>();
      for (const [k, v] of obj.dict) dict.set(k, await deepCopy(src, v, memo, updates, allocObjNum));
      return { kind: 'stream', dict, raw: obj.raw };
    }
    default:
      return obj;
  }
}

/** Stage page-organization changes into the incremental `updates` map. */
export async function applyPageOps(
  doc: PdfDocument,
  ops: PageOps,
  updates: Map<number, PdfObject>,
  allocObjNum: () => number,
): Promise<void> {
  if (!doc.root || doc.root.kind !== 'ref') throw new Error('applyPageOps: no catalog');
  const leaves = await collectLeaves(doc);
  const order = ops.order ?? leaves.map((_, i) => i + 1);
  if (order.length === 0 && !(ops.append?.length)) {
    throw new Error('applyPageOps: refusing to produce a PDF with zero pages');
  }
  for (const n of order) {
    if (!Number.isInteger(n) || n < 1 || n > leaves.length) throw new Error(`applyPageOps: page ${n} out of range 1..${leaves.length}`);
  }

  const newPagesNum = allocObjNum();
  const newPagesRef: PdfObject = { kind: 'ref', objectNumber: newPagesNum, generation: 0 };
  const kids: PdfObject[] = [];

  // 1) Kept source pages: materialize inherited attrs, reparent, rotate.
  for (const n of order) {
    const leaf = leaves[n - 1]!;
    const dict = new Map(await doc.resolveDict(leaf.ref));
    for (const k of INHERITABLE) {
      if (!dict.has(k) && leaf.inherited.has(k)) dict.set(k, leaf.inherited.get(k)!);
    }
    dict.set('Parent', newPagesRef);
    const rot = ops.rotate?.[n];
    if (rot !== undefined) {
      const norm = ((Math.round(rot / 90) * 90) % 360 + 360) % 360;
      if (norm === 0) dict.delete('Rotate');
      else dict.set('Rotate', { kind: 'num', value: norm });
    }
    updates.set(leaf.ref.objectNumber, { kind: 'dict', entries: dict });
    kids.push(leaf.ref);
  }

  // 2) Appended documents: deep-copy every page graph.
  for (const other of ops.append ?? []) {
    if (other.xref.trailer.get('Encrypt')) {
      throw new Error('applyPageOps: appending from an encrypted PDF is not supported');
    }
    const memo = new Map<number, number>();
    for (const leaf of await collectLeaves(other)) {
      const srcDict = await other.resolveDict(leaf.ref);
      const work = new Map(srcDict);
      work.delete('Parent'); // never drag the foreign page tree across
      for (const k of INHERITABLE) {
        if (!work.has(k) && leaf.inherited.has(k)) work.set(k, leaf.inherited.get(k)!);
      }
      const copied = await deepCopy(other, { kind: 'dict', entries: work }, memo, updates, allocObjNum);
      if (copied.kind !== 'dict') throw new Error('applyPageOps: page copy produced a non-dict');
      copied.entries.set('Parent', newPagesRef);
      const target = allocObjNum();
      updates.set(target, copied);
      kids.push({ kind: 'ref', objectNumber: target, generation: 0 });
    }
  }

  // 3) New flat /Pages node + catalog pointer (building on staged catalog).
  updates.set(newPagesNum, {
    kind: 'dict',
    entries: new Map<string, PdfObject>([
      ['Type', { kind: 'name', value: 'Pages' }],
      ['Kids', { kind: 'array', items: kids }],
      ['Count', { kind: 'num', value: kids.length }],
    ]),
  });
  const catalogRef = doc.root;
  const staged = updates.get(catalogRef.objectNumber);
  const baseCatalog = staged && staged.kind === 'dict' ? staged.entries : await doc.resolveDict(catalogRef);
  const newCatalog = new Map(baseCatalog);
  newCatalog.set('Pages', newPagesRef);

  // 4) Prune AcroForm /Fields whose widgets lived only on deleted pages, so
  //    deleting a page doesn't leave dangling field references (which strict
  //    PDF validators flag). Only runs when pages were actually dropped.
  const deleted = leaves.length - new Set(order).size;
  const afEntry = newCatalog.get('AcroForm');
  if (deleted > 0 && afEntry) {
    const keptPageObjNums = new Set(order.map((n) => leaves[n - 1]!.ref.objectNumber));
    const af = new Map(await doc.resolveDict(afEntry));
    const fields = af.get('Fields');
    if (fields?.kind === 'array') {
      const keep: PdfObject[] = [];
      for (const fref of fields.items) {
        if (await fieldTouchesKeptPage(doc, fref, keptPageObjNums)) keep.push(fref);
      }
      if (keep.length !== fields.items.length) {
        af.set('Fields', { kind: 'array', items: keep });
        // AcroForm may be inline or an indirect object; update accordingly.
        if (afEntry.kind === 'ref') {
          updates.set(afEntry.objectNumber, { kind: 'dict', entries: af });
        } else {
          newCatalog.set('AcroForm', { kind: 'dict', entries: af });
        }
      }
    }
  }

  updates.set(catalogRef.objectNumber, { kind: 'dict', entries: newCatalog });
}

/**
 * Does an AcroForm field have at least one widget on a kept page? A field is
 * kept when any of its widgets' /P refers to a surviving page — or when no /P
 * information is available anywhere (we never drop a field we can't place,
 * to avoid removing valid fields).
 */
async function fieldTouchesKeptPage(
  doc: PdfDocument,
  fieldRef: PdfObject,
  keptPageObjNums: Set<number>,
): Promise<boolean> {
  if (fieldRef.kind !== 'ref') return true;
  const dict = await doc.resolveDict(fieldRef);
  let sawAnyPage = false;
  const check = (p: PdfObject | undefined): boolean => {
    if (p && p.kind === 'ref') {
      sawAnyPage = true;
      return keptPageObjNums.has(p.objectNumber);
    }
    return false;
  };
  // Terminal field that is itself a widget.
  if (check(dict.get('P'))) return true;
  // Field with /Kids widgets.
  const kids = dict.get('Kids');
  if (kids?.kind === 'array') {
    for (const k of kids.items) {
      if (k.kind !== 'ref') continue;
      const kd = await doc.resolveDict(k);
      if (check(kd.get('P'))) return true;
    }
  }
  // No locatable widget → keep (can't prove it's orphaned).
  return !sawAnyPage;
}
