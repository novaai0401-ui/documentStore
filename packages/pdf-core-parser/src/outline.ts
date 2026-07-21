/**
 * Document outline (bookmarks) extraction.
 *
 * The outline lives at /Root/Outlines as a singly-linked list of
 * sibling nodes joined by /Next, each potentially having /First (the
 * first child). Each node carries:
 *   /Title — text string (PDFDocEncoding or UTF-16BE)
 *   /Dest  — explicit destination (array starting with a page ref)
 *            or a name that resolves through /Names/Dests
 *   /A     — action dict (often /S /GoTo + /D = the same /Dest array)
 *   /First — first child (recurse)
 *   /Count — total descendants (negative = collapsed by default)
 *
 * We resolve /Dest to a 1-based page number by walking the document's
 * page-ref index once.
 */
import type { PdfDocument } from './document.js';
import type { PdfObject } from './types.js';

export interface OutlineNode {
  /** Visible label. */
  title: string;
  /** 1-based page number, when the destination resolves to a known page.
   *  0 when the target is external/non-page (uri actions, named dests
   *  we don't follow, etc). */
  targetPage: number;
  /** Producer-suggested initial state — when |count| > 0 and negative,
   *  collapse this node by default. */
  collapsed: boolean;
  /** Child nodes — empty array means leaf. */
  children: OutlineNode[];
}

/**
 * Extract the document outline. Returns an empty array when the PDF
 * has no /Outlines entry or it's malformed.
 */
export async function extractOutline(doc: PdfDocument): Promise<OutlineNode[]> {
  if (!doc.root || doc.root.kind !== 'ref') return [];
  const catalog = await doc.resolveDict(doc.root);
  const outlinesEntry = catalog.get('Outlines');
  if (!outlinesEntry) return [];

  let outlinesDict: Map<string, PdfObject>;
  try {
    outlinesDict = outlinesEntry.kind === 'ref'
      ? await doc.resolveDict(outlinesEntry)
      : (outlinesEntry.kind === 'dict' ? outlinesEntry.entries : new Map());
  } catch {
    return [];
  }

  const first = outlinesDict.get('First');
  if (!first || first.kind !== 'ref') return [];

  const pageIndex = await buildPageIndex(doc);
  return await walkSiblings(doc, first, pageIndex, new Set());
}

async function walkSiblings(
  doc: PdfDocument,
  startRef: PdfObject & { kind: 'ref' },
  pageIndex: Map<number, number>,
  seen: Set<number>,
): Promise<OutlineNode[]> {
  const out: OutlineNode[] = [];
  let cur: PdfObject = startRef;

  // Loop over the /Next chain. A cycle would hang us forever, so we
  // bail out the first time we revisit a node.
  while (cur && cur.kind === 'ref') {
    if (seen.has(cur.objectNumber)) break;
    seen.add(cur.objectNumber);

    let node: Map<string, PdfObject>;
    try {
      node = await doc.resolveDict(cur);
    } catch {
      break;
    }

    const titleObj = node.get('Title');
    const title = titleObj && titleObj.kind === 'string' ? decodeString(titleObj.value) : '';

    const targetPage = await resolveDestination(doc, node, pageIndex);

    const countObj = node.get('Count');
    const collapsed = countObj && countObj.kind === 'num' ? countObj.value < 0 : false;

    let children: OutlineNode[] = [];
    const firstChild = node.get('First');
    if (firstChild && firstChild.kind === 'ref') {
      children = await walkSiblings(doc, firstChild, pageIndex, seen);
    }

    out.push({ title, targetPage, collapsed, children });

    const next = node.get('Next');
    cur = next && next.kind === 'ref' ? next : { kind: 'null' };
  }
  return out;
}

/**
 * Map an outline node to a 1-based page number.
 *
 *   /Dest = [pageRef, /Fit, ...] or [pageRef, /XYZ, x, y, zoom] or
 *           [pageNumber, /Fit, ...] (rare)
 *   /A    = << /S /GoTo /D <Dest array> >>
 *
 * Returns 0 when we can't resolve (named dest, URI, page not in tree).
 */
async function resolveDestination(
  doc: PdfDocument,
  node: Map<string, PdfObject>,
  pageIndex: Map<number, number>,
): Promise<number> {
  // Try /Dest first.
  let dest = node.get('Dest');

  // If /Dest is missing or a name, also try /A → /D.
  if (!dest || dest.kind === 'name' || dest.kind === 'string') {
    const action = node.get('A');
    if (action && action.kind === 'ref') {
      try {
        const aDict = await doc.resolveDict(action);
        const aType = aDict.get('S');
        if (aType && aType.kind === 'name' && aType.value === 'GoTo') {
          dest = aDict.get('D');
        }
      } catch { /* swallow */ }
    } else if (action && action.kind === 'dict') {
      const aType = action.entries.get('S');
      if (aType && aType.kind === 'name' && aType.value === 'GoTo') {
        dest = action.entries.get('D');
      }
    }
  }

  if (!dest) return 0;
  if (dest.kind === 'ref') {
    try { dest = await doc.resolve(dest); } catch { return 0; }
  }
  if (dest.kind !== 'array' || dest.items.length === 0) return 0;

  const target = dest.items[0]!;
  if (target.kind === 'ref') {
    return pageIndex.get(target.objectNumber) ?? 0;
  }
  if (target.kind === 'num') {
    // Already a page number (0-based in PDF spec sometimes — bump if so).
    const n = Math.floor(target.value);
    return n >= 0 ? n + 1 : 0;
  }
  return 0;
}

/**
 * Build an objectNumber → 1-based page number map by walking the
 * /Pages tree. Cached for the duration of extractOutline.
 */
async function buildPageIndex(doc: PdfDocument): Promise<Map<number, number>> {
  const index = new Map<number, number>();
  if (!doc.root || doc.root.kind !== 'ref') return index;
  const catalog = await doc.resolveDict(doc.root);
  const pagesRef = catalog.get('Pages');
  if (!pagesRef) return index;
  let pageNum = 0;
  await walk(pagesRef);
  return index;

  async function walk(ref: PdfObject): Promise<void> {
    if (ref.kind !== 'ref') return;
    let dict: Map<string, PdfObject>;
    try {
      dict = await doc.resolveDict(ref);
    } catch { return; }
    const type = dict.get('Type');
    if (type && type.kind === 'name' && type.value === 'Page') {
      pageNum++;
      index.set(ref.objectNumber, pageNum);
      return;
    }
    const kids = dict.get('Kids');
    if (kids && kids.kind === 'array') {
      for (const k of kids.items) await walk(k);
    }
  }
}

/**
 * Decode a PDF text-string byte array (UTF-16BE-with-BOM or
 * PDFDocEncoding-ish). Mirrors forms.ts's decoder — duplicated here to
 * avoid a cyclic import.
 */
function decodeString(bytes: Uint8Array): string {
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
