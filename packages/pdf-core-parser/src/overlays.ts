/**
 * Overlay → PDF content-stream burn-in.
 *
 * The user's drawing tools (Add Text, Highlight, Draw, Shapes, Eraser,
 * Redact, Crop, Hyperlink, Stamp, Sign, Image) produce in-app overlay
 * state — these only live in the app until save. This module takes that
 * state and burns it into the saved PDF as real page content, so the
 * result renders identically in every viewer.
 *
 * Coordinate model:
 *   - Each overlay carries x/y/w/h in CSS pixels of the page render the
 *     user was looking at, plus the CSS-pixel page dimensions at that
 *     scale, plus the page number.
 *   - We convert to PDF user-space coords (origin bottom-left, page-
 *     dimensioned via /MediaBox) before emitting content-stream ops.
 *
 * Output:
 *   - Visible drawings → new /Contents stream appended to each touched
 *     page.
 *   - Hyperlinks → /Link annotations appended to each touched page's
 *     /Annots.
 *   - Images / signatures → /XObject /Image stream + Do op in content;
 *     XObject referenced from the page /Resources.
 */
import type { PdfDocument } from './document.js';
import { encodeStringForTj, fontBaseName } from './appearance.js';
import type { PdfObject } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
//   Overlay descriptors — mirror the demo's Annotation type but pruned to
//   just what the burn-in needs.
// ─────────────────────────────────────────────────────────────────────────────

export interface OverlayBase {
  /** Page number (1-based). */
  page: number;
  /** CSS-pixel position relative to the page's top-left. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** CSS-pixel dimensions of the rendered page at the user's scale. */
  pageCssWidth: number;
  pageCssHeight: number;
}

export type Overlay =
  | (OverlayBase & {
      kind: 'text';
      text: string;
      fontSize: number;
      color: string;
      /** When true, draw with text-render-mode 3 (invisible) and stretch to
       *  the box width — an OCR/searchable text layer over a scanned image:
       *  selectable & searchable, but not visually painted. */
      invisible?: boolean;
      /** Counter-clockwise rotation in degrees about the text origin (for
       *  diagonal watermarks). */
      rotate?: number;
      /** Fill opacity 0..1 (for translucent watermarks). */
      opacity?: number;
    })
  | (OverlayBase & { kind: 'highlight'; color: string; alpha: number })
  | (OverlayBase & { kind: 'eraser' })
  | (OverlayBase & { kind: 'redact' })
  | (OverlayBase & { kind: 'crop' })
  | (OverlayBase & { kind: 'hyperlink'; url: string; label: string })
  | (OverlayBase & { kind: 'stamp'; text: string; color: string })
  | (OverlayBase & { kind: 'sign' | 'image'; jpegBytes: Uint8Array; imgWidth: number; imgHeight: number })
  | (OverlayBase & { kind: 'shape'; shape: 'rect' | 'ellipse'; stroke: string; strokeWidth: number })
  | (OverlayBase & {
      kind: 'draw';
      /** Points in CSS pixels (page-relative). */
      points: Array<[number, number]>;
      stroke: string;
      strokeWidth: number;
    });

// ─────────────────────────────────────────────────────────────────────────────
//   Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Walk every overlay, group by page, and emit the PDF objects required
 * to render them. Mutates the shared `updates` map (incremental writer
 * picks it up) and uses `allocObjNum` to reserve fresh indirect-object
 * numbers for new content streams, /Link annotations, and image
 * XObjects.
 */
export async function burnOverlays(
  doc: PdfDocument,
  overlays: Overlay[],
  updates: Map<number, PdfObject>,
  allocObjNum: () => number,
): Promise<void> {
  if (overlays.length === 0) return;

  // Group by page
  const byPage = new Map<number, Overlay[]>();
  for (const o of overlays) {
    if (!byPage.has(o.page)) byPage.set(o.page, []);
    byPage.get(o.page)!.push(o);
  }

  // Find page references via the catalog's /Pages tree
  const pageRefs = await findPageRefs(doc);

  for (const [pageNum, pageOverlays] of byPage) {
    const pageRef = pageRefs[pageNum - 1];
    if (!pageRef) continue;
    await burnOverlaysToPage(doc, pageRef, pageOverlays, updates, allocObjNum);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//   Single-page burn
// ─────────────────────────────────────────────────────────────────────────────

interface PageCtx {
  /** PDF user-space origin (typically 0,0). */
  llx: number;
  lly: number;
  /** PDF user-space page dimensions. */
  pdfWidth: number;
  pdfHeight: number;
  /** CSS → PDF scale. */
  scale: number;
}

async function burnOverlaysToPage(
  doc: PdfDocument,
  pageRef: PdfObject & { kind: 'ref' },
  overlays: Overlay[],
  updates: Map<number, PdfObject>,
  allocObjNum: () => number,
): Promise<void> {
  const pageDict = await doc.resolveDict(pageRef);
  const mediaBox = pageDict.get('MediaBox') ?? pageDict.get('CropBox');
  if (!mediaBox || mediaBox.kind !== 'array' || mediaBox.items.length < 4) return;
  const [llx, lly, urx, ury] = mediaBox.items.map((it) => (it.kind === 'num' ? it.value : 0));
  const pdfWidth = (urx ?? 0) - (llx ?? 0);
  const pdfHeight = (ury ?? 0) - (lly ?? 0);
  const pageCssWidth = overlays[0]!.pageCssWidth || pdfWidth;
  const scale = pdfWidth / pageCssWidth;
  const ctx: PageCtx = { llx: llx ?? 0, lly: lly ?? 0, pdfWidth, pdfHeight, scale };

  const ops: string[] = [];
  const newAnnotRefs: PdfObject[] = [];
  const xobjectRegistry: Map<string, { ref: PdfObject; name: string }> = new Map();
  const extGStateRegistry: Map<string, { dict: PdfObject; name: string }> = new Map();
  let xobjCounter = 0;
  let gsCounter = 0;

  for (const o of overlays) {
    const emitted = emitOverlay(o, ctx, () => `Im${xobjCounter++}`, () => `GS${gsCounter++}`);
    if (emitted.ops.length) ops.push(...emitted.ops);
    if (emitted.linkAnnot) {
      const ref = allocAndStore(emitted.linkAnnot, allocObjNum, updates);
      newAnnotRefs.push(ref);
    }
    if (emitted.xobject) {
      const xObjRef = allocAndStore(emitted.xobject.stream, allocObjNum, updates);
      xobjectRegistry.set(emitted.xobject.name, { ref: xObjRef, name: emitted.xobject.name });
    }
    if (emitted.extGState) {
      extGStateRegistry.set(emitted.extGState.name, {
        dict: emitted.extGState.dict,
        name: emitted.extGState.name,
      });
    }
  }

  if (ops.length === 0 && newAnnotRefs.length === 0) return;

  const pageCopy = new Map(pageDict);

  // 1) Append our content stream to /Contents (wrap whatever was there
  //    in a save-state to keep our drawing isolated from the page's
  //    existing graphics).
  if (ops.length > 0) {
    const wrappedOps = ['q', ...ops, 'Q'];
    const content = new TextEncoder().encode(wrappedOps.join('\n'));
    const contentStream: PdfObject = {
      kind: 'stream',
      dict: new Map<string, PdfObject>([['Length', { kind: 'num', value: content.length }]]),
      raw: content,
    };
    const csRef = allocAndStore(contentStream, allocObjNum, updates);

    const existing = pageDict.get('Contents');
    let next: PdfObject;
    if (!existing) {
      next = csRef;
    } else if (existing.kind === 'array') {
      next = { kind: 'array', items: [...existing.items, csRef] };
    } else {
      // Single ref or inline stream — wrap as array.
      next = { kind: 'array', items: [existing, csRef] };
    }
    pageCopy.set('Contents', next);
  }

  // 2) Append /Link annotations to /Annots.
  if (newAnnotRefs.length > 0) {
    const existing = pageDict.get('Annots');
    let next: PdfObject;
    let resolved = existing;
    if (resolved && resolved.kind === 'ref') resolved = await doc.resolve(resolved);
    if (!resolved || resolved.kind !== 'array') {
      next = { kind: 'array', items: newAnnotRefs };
    } else {
      next = { kind: 'array', items: [...resolved.items, ...newAnnotRefs] };
    }
    pageCopy.set('Annots', next);
  }

  // 3) Merge XObject + ExtGState into page /Resources.
  if (xobjectRegistry.size > 0 || extGStateRegistry.size > 0) {
    const newResources = await mergeResources(
      doc, pageCopy.get('Resources'),
      xobjectRegistry, extGStateRegistry,
    );
    pageCopy.set('Resources', newResources);
  }

  updates.set(pageRef.objectNumber, { kind: 'dict', entries: pageCopy });
}

function allocAndStore(
  obj: PdfObject,
  allocObjNum: () => number,
  updates: Map<number, PdfObject>,
): PdfObject & { kind: 'ref' } {
  const objNum = allocObjNum();
  updates.set(objNum, obj);
  return { kind: 'ref', objectNumber: objNum, generation: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
//   Per-kind overlay emission
// ─────────────────────────────────────────────────────────────────────────────

interface EmittedOverlay {
  /** PDF content-stream ops to draw the visible part. */
  ops: string[];
  /** /Link annotation if this is a hyperlink. */
  linkAnnot?: PdfObject;
  /** Image XObject if this is sign/image. The name is what we reference
   *  from the page's /Resources/XObject dict and from the Do op. */
  xobject?: { stream: PdfObject; name: string };
  /** ExtGState if we need transparency. */
  extGState?: { dict: PdfObject; name: string };
}

function emitOverlay(
  o: Overlay,
  ctx: PageCtx,
  nextXObjName: () => string,
  nextGSName: () => string,
): EmittedOverlay {
  // Convert CSS-pixel rect to PDF user-space rect.
  // CSS coords: origin top-left, +Y down.
  // PDF coords: origin bottom-left, +Y up. We flip Y.
  const xPdf = ctx.llx + o.x * ctx.scale;
  const wPdf = o.width * ctx.scale;
  const hPdf = o.height * ctx.scale;
  // y is the top of the rect in CSS; the rect's bottom in PDF coords is
  // page-bottom - (top + height_in_css).
  const yPdf = ctx.lly + ctx.pdfHeight - (o.y + o.height) * ctx.scale;

  switch (o.kind) {
    case 'text':
      return emitText(o, xPdf, yPdf, wPdf, hPdf, ctx);
    case 'highlight':
      return emitHighlight(o, xPdf, yPdf, wPdf, hPdf, nextGSName);
    case 'eraser':
      return { ops: emitFilledRect(xPdf, yPdf, wPdf, hPdf, '1 1 1') };
    case 'redact':
      return { ops: emitFilledRect(xPdf, yPdf, wPdf, hPdf, '0 0 0') };
    case 'crop':
      return { ops: emitDashedRect(xPdf, yPdf, wPdf, hPdf) };
    case 'hyperlink':
      return emitHyperlink(o, xPdf, yPdf, wPdf, hPdf);
    case 'stamp':
      return emitStamp(o, xPdf, yPdf, wPdf, hPdf, ctx);
    case 'shape':
      return emitShape(o, xPdf, yPdf, wPdf, hPdf);
    case 'draw':
      return emitDraw(o, ctx);
    case 'sign':
    case 'image':
      return emitImage(o, xPdf, yPdf, wPdf, hPdf, nextXObjName);
  }
}

// ─── Text ────────────────────────────────────────────────────────────────────

function emitText(
  o: Extract<Overlay, { kind: 'text' }>,
  x: number, y: number, _w: number, h: number,
  ctx: PageCtx,
): EmittedOverlay {
  const fontSize = (o.fontSize || 14) * ctx.scale;
  const baselineY = num(y + (h - fontSize) / 2 + fontSize * 0.2);

  if (o.invisible) {
    // Searchable text layer: render mode 3 (invisible). Stretch horizontally
    // (Tz) so the selectable text spans the box width, lining up with the
    // scanned glyphs underneath for accurate select/search/AT reading.
    const natural = Math.max(1, o.text.length * fontSize * 0.5);
    const tz = Math.max(10, Math.min(1000, ((_w || natural) / natural) * 100));
    return {
      ops: [
        'q',
        'BT',
        '3 Tr',
        `/HelvOv ${num(fontSize)} Tf`,
        `${num(tz)} Tz`,
        `${num(x)} ${baselineY} Td`,
        `${encodeStringForTj(o.text)} Tj`,
        'ET',
        'Q',
      ],
      xobject: undefined,
    };
  }

  const color = parseColorForRg(o.color);

  // Rotated and/or translucent text (watermarks). Rotation is about the text
  // box centre via a text matrix; opacity via a fill-alpha ExtGState.
  if (o.rotate || (o.opacity !== undefined && o.opacity < 1)) {
    const rad = ((o.rotate ?? 0) * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const cx = x + _w / 2;
    const cy = y + h / 2;
    const ops = ['q', `${color} rg`];
    let extGState: EmittedOverlay['extGState'];
    if (o.opacity !== undefined && o.opacity < 1) {
      const gsName = 'GSwm';
      ops.push(`/${gsName} gs`);
      extGState = { name: gsName, dict: { kind: 'dict', entries: new Map([['ca', { kind: 'num', value: o.opacity }], ['CA', { kind: 'num', value: o.opacity }]]) } };
    }
    ops.push(
      'BT',
      `/HelvOv ${num(fontSize)} Tf`,
      // Tm: rotate about origin, translate to centre.
      `${num(cos)} ${num(sin)} ${num(-sin)} ${num(cos)} ${num(cx)} ${num(cy)} Tm`,
      // Centre the text on the origin: shift left by half its width, down by ~⅓ cap height.
      `${num(-(o.text.length * fontSize * 0.45) / 2)} ${num(-fontSize * 0.33)} Td`,
      `${encodeStringForTj(o.text)} Tj`,
      'ET',
      'Q',
    );
    return { ops, xobject: undefined, extGState };
  }

  return {
    ops: [
      'q',
      `${color} rg`,
      'BT',
      `/HelvOv ${num(fontSize)} Tf`,
      `${num(x + 2)} ${baselineY} Td`,
      `${encodeStringForTj(o.text)} Tj`,
      'ET',
      'Q',
    ],
    xobject: undefined,
  };
}

// ─── Highlight (semi-transparent rect via ExtGState) ─────────────────────────

function emitHighlight(
  o: Extract<Overlay, { kind: 'highlight' }>,
  x: number, y: number, w: number, h: number,
  nextGSName: () => string,
): EmittedOverlay {
  const color = parseColorForRg(o.color);
  const gsName = nextGSName();
  return {
    ops: [
      'q',
      `/${gsName} gs`,
      `${color} rg`,
      `${num(x)} ${num(y)} ${num(w)} ${num(h)} re f`,
      'Q',
    ],
    extGState: {
      name: gsName,
      dict: {
        kind: 'dict',
        entries: new Map<string, PdfObject>([
          ['Type', { kind: 'name', value: 'ExtGState' }],
          ['ca', { kind: 'num', value: o.alpha ?? 0.4 }],
          ['CA', { kind: 'num', value: o.alpha ?? 0.4 }],
        ]),
      },
    },
  };
}

// ─── Filled rect ─────────────────────────────────────────────────────────────

function emitFilledRect(x: number, y: number, w: number, h: number, rgb: string): string[] {
  return ['q', `${rgb} rg`, `${num(x)} ${num(y)} ${num(w)} ${num(h)} re f`, 'Q'];
}

// ─── Dashed-border rect (crop preview) ───────────────────────────────────────

function emitDashedRect(x: number, y: number, w: number, h: number): string[] {
  return [
    'q',
    '0.18 0.36 1 RG',
    '2 w',
    '[4 3] 0 d',
    `${num(x)} ${num(y)} ${num(w)} ${num(h)} re S`,
    'Q',
  ];
}

// ─── Hyperlink (visible underlined text + /Link annotation) ──────────────────

function emitHyperlink(
  o: Extract<Overlay, { kind: 'hyperlink' }>,
  x: number, y: number, w: number, h: number,
): EmittedOverlay {
  const fontSize = Math.min(h * 0.85, 14);
  const ops = [
    'q',
    '0.18 0.36 1 rg',
    'BT',
    `/HelvOv ${num(fontSize)} Tf`,
    `${num(x + 2)} ${num(y + (h - fontSize) / 2 + fontSize * 0.2)} Td`,
    `${encodeStringForTj(o.label)} Tj`,
    'ET',
    'Q',
  ];

  // /Link annotation: rect in PDF coords, URI action.
  const linkAnnot: PdfObject = {
    kind: 'dict',
    entries: new Map<string, PdfObject>([
      ['Type', { kind: 'name', value: 'Annot' }],
      ['Subtype', { kind: 'name', value: 'Link' }],
      ['Rect', {
        kind: 'array',
        items: [
          { kind: 'num', value: x },
          { kind: 'num', value: y },
          { kind: 'num', value: x + w },
          { kind: 'num', value: y + h },
        ],
      }],
      ['Border', { kind: 'array', items: [
        { kind: 'num', value: 0 }, { kind: 'num', value: 0 }, { kind: 'num', value: 0 },
      ]}],
      ['A', { kind: 'dict', entries: new Map<string, PdfObject>([
        ['Type', { kind: 'name', value: 'Action' }],
        ['S', { kind: 'name', value: 'URI' }],
        ['URI', { kind: 'string', literal: false, value: encodeUriBytes(o.url) }],
      ])}],
    ]),
  };

  return { ops, linkAnnot };
}

function encodeUriBytes(url: string): Uint8Array {
  const bytes = new Uint8Array(url.length);
  for (let i = 0; i < url.length; i++) bytes[i] = url.charCodeAt(i) & 0xff;
  return bytes;
}

// ─── Stamp (rotated outlined text badge) ─────────────────────────────────────

function emitStamp(
  o: Extract<Overlay, { kind: 'stamp' }>,
  x: number, y: number, w: number, h: number,
  ctx: PageCtx,
): EmittedOverlay {
  const angleRad = (-8 * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const color = parseColorForRg(o.color);
  const fontSize = Math.min(h * 0.55, 18) * ctx.scale;
  return {
    ops: [
      'q',
      // Translate to center of the stamp, rotate, translate back.
      `1 0 0 1 ${num(x + w / 2)} ${num(y + h / 2)} cm`,
      `${num(cos)} ${num(sin)} ${num(-sin)} ${num(cos)} 0 0 cm`,
      `1 0 0 1 ${num(-w / 2)} ${num(-h / 2)} cm`,
      // Border
      `${color} RG`,
      '2 w',
      `0 0 ${num(w)} ${num(h)} re S`,
      // Text centered
      `${color} rg`,
      'BT',
      `/HelvOv ${num(fontSize)} Tf`,
      `${num((w - o.text.length * fontSize * 0.55) / 2)} ${num((h - fontSize) / 2 + fontSize * 0.2)} Td`,
      `${encodeStringForTj(o.text)} Tj`,
      'ET',
      'Q',
    ],
  };
}

// ─── Shape (rect or ellipse stroke) ──────────────────────────────────────────

function emitShape(
  o: Extract<Overlay, { kind: 'shape' }>,
  x: number, y: number, w: number, h: number,
): EmittedOverlay {
  const color = parseColorForRg(o.stroke);
  if (o.shape === 'rect') {
    return {
      ops: [
        'q', `${color} RG`, `${num(o.strokeWidth)} w`,
        `${num(x)} ${num(y)} ${num(w)} ${num(h)} re S`,
        'Q',
      ],
    };
  }
  // Ellipse via 4 cubic Bezier curves.
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const k = 0.5522847498; // magic constant for circle-from-cubic-beziers
  const kx = rx * k;
  const ky = ry * k;
  return {
    ops: [
      'q', `${color} RG`, `${num(o.strokeWidth)} w`,
      `${num(cx - rx)} ${num(cy)} m`,
      `${num(cx - rx)} ${num(cy + ky)} ${num(cx - kx)} ${num(cy + ry)} ${num(cx)} ${num(cy + ry)} c`,
      `${num(cx + kx)} ${num(cy + ry)} ${num(cx + rx)} ${num(cy + ky)} ${num(cx + rx)} ${num(cy)} c`,
      `${num(cx + rx)} ${num(cy - ky)} ${num(cx + kx)} ${num(cy - ry)} ${num(cx)} ${num(cy - ry)} c`,
      `${num(cx - kx)} ${num(cy - ry)} ${num(cx - rx)} ${num(cy - ky)} ${num(cx - rx)} ${num(cy)} c`,
      'S',
      'Q',
    ],
  };
}

// ─── Draw (polyline path) ────────────────────────────────────────────────────

function emitDraw(o: Extract<Overlay, { kind: 'draw' }>, ctx: PageCtx): EmittedOverlay {
  if (o.points.length < 2) return { ops: [] };
  const color = parseColorForRg(o.stroke);
  const toPdf = (p: [number, number]): [number, number] => [
    ctx.llx + p[0] * ctx.scale,
    ctx.lly + ctx.pdfHeight - p[1] * ctx.scale,
  ];
  const ops = [
    'q',
    `${color} RG`,
    `${num(o.strokeWidth)} w`,
    '1 J 1 j', // round caps + joins
  ];
  const [x0, y0] = toPdf(o.points[0]!);
  ops.push(`${num(x0)} ${num(y0)} m`);
  for (let i = 1; i < o.points.length; i++) {
    const [px, py] = toPdf(o.points[i]!);
    ops.push(`${num(px)} ${num(py)} l`);
  }
  ops.push('S', 'Q');
  return { ops };
}

// ─── Image / signature (image XObject + Do op) ───────────────────────────────

function emitImage(
  o: Extract<Overlay, { kind: 'image' | 'sign' }>,
  x: number, y: number, w: number, h: number,
  nextXObjName: () => string,
): EmittedOverlay {
  const name = nextXObjName();
  const imgStream: PdfObject = {
    kind: 'stream',
    dict: new Map<string, PdfObject>([
      ['Type', { kind: 'name', value: 'XObject' }],
      ['Subtype', { kind: 'name', value: 'Image' }],
      ['Width', { kind: 'num', value: o.imgWidth }],
      ['Height', { kind: 'num', value: o.imgHeight }],
      ['ColorSpace', { kind: 'name', value: 'DeviceRGB' }],
      ['BitsPerComponent', { kind: 'num', value: 8 }],
      ['Filter', { kind: 'name', value: 'DCTDecode' }],
      ['Length', { kind: 'num', value: o.jpegBytes.length }],
    ]),
    raw: o.jpegBytes,
  };
  return {
    ops: [
      'q',
      `${num(w)} 0 0 ${num(h)} ${num(x)} ${num(y)} cm`,
      `/${name} Do`,
      'Q',
    ],
    xobject: { stream: imgStream, name },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//   Resource-dict merge — add our XObjects/ExtGStates without dropping any
//   resources the page already had.
// ─────────────────────────────────────────────────────────────────────────────

async function mergeResources(
  doc: PdfDocument,
  existing: PdfObject | undefined,
  xobjects: Map<string, { ref: PdfObject; name: string }>,
  extGStates: Map<string, { dict: PdfObject; name: string }>,
): Promise<PdfObject> {
  let baseDict: Map<string, PdfObject> = new Map();
  if (existing) {
    let resolved = existing;
    if (resolved.kind === 'ref') resolved = await doc.resolve(resolved);
    if (resolved.kind === 'dict') baseDict = new Map(resolved.entries);
  }

  // Always make sure we have a Font entry for HelvOv (used by text overlays).
  let fontDict: PdfObject;
  const existingFont = baseDict.get('Font');
  if (existingFont && existingFont.kind === 'dict') {
    const fontEntries = new Map(existingFont.entries);
    fontEntries.set('HelvOv', helveticaFontDict());
    fontDict = { kind: 'dict', entries: fontEntries };
  } else if (existingFont && existingFont.kind === 'ref') {
    const resolved = await doc.resolveDict(existingFont);
    const fontEntries = new Map(resolved);
    fontEntries.set('HelvOv', helveticaFontDict());
    fontDict = { kind: 'dict', entries: fontEntries };
  } else {
    fontDict = {
      kind: 'dict',
      entries: new Map<string, PdfObject>([['HelvOv', helveticaFontDict()]]),
    };
  }
  baseDict.set('Font', fontDict);

  // XObject merge.
  if (xobjects.size > 0) {
    const existingXObj = baseDict.get('XObject');
    let xobjEntries = new Map<string, PdfObject>();
    if (existingXObj && existingXObj.kind === 'dict') {
      xobjEntries = new Map(existingXObj.entries);
    } else if (existingXObj && existingXObj.kind === 'ref') {
      const resolved = await doc.resolveDict(existingXObj);
      xobjEntries = new Map(resolved);
    }
    for (const { ref, name } of xobjects.values()) xobjEntries.set(name, ref);
    baseDict.set('XObject', { kind: 'dict', entries: xobjEntries });
  }

  // ExtGState merge.
  if (extGStates.size > 0) {
    const existingGS = baseDict.get('ExtGState');
    let gsEntries = new Map<string, PdfObject>();
    if (existingGS && existingGS.kind === 'dict') {
      gsEntries = new Map(existingGS.entries);
    } else if (existingGS && existingGS.kind === 'ref') {
      const resolved = await doc.resolveDict(existingGS);
      gsEntries = new Map(resolved);
    }
    for (const { dict, name } of extGStates.values()) gsEntries.set(name, dict);
    baseDict.set('ExtGState', { kind: 'dict', entries: gsEntries });
  }

  return { kind: 'dict', entries: baseDict };
}

function helveticaFontDict(): PdfObject {
  return {
    kind: 'dict',
    entries: new Map<string, PdfObject>([
      ['Type', { kind: 'name', value: 'Font' }],
      ['Subtype', { kind: 'name', value: 'Type1' }],
      ['BaseFont', { kind: 'name', value: fontBaseName('Helv') }],
      ['Encoding', { kind: 'name', value: 'WinAnsiEncoding' }],
    ]),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//   Page tree walk
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
//   Color + number helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Convert a CSS-ish color string into "r g b" components for rg / RG. */
function parseColorForRg(color: string): string {
  // hex (#rrggbb or #rgb)
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    return `${num(r)} ${num(g)} ${num(b)}`;
  }
  // rgb(R,G,B) or rgba(R,G,B,A)
  const m = /^rgba?\(([^)]+)\)$/i.exec(color);
  if (m) {
    const parts = m[1]!.split(',').map((s) => parseFloat(s));
    const r = (parts[0] ?? 0) / 255;
    const g = (parts[1] ?? 0) / 255;
    const b = (parts[2] ?? 0) / 255;
    return `${num(r)} ${num(g)} ${num(b)}`;
  }
  // Named fallbacks for the few colors our tool defaults use.
  if (color === 'black' || color === '#000') return '0 0 0';
  if (color === 'white' || color === '#fff') return '1 1 1';
  return '0 0 0';
}

function num(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}
