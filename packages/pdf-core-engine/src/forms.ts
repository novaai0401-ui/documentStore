import {
  PdfDocument,
  saveFieldValues,
  extractOutline,
  readInfo,
  type Overlay,
  type NewFieldDescriptor,
  type OutlineNode,
  type PdfInfo,
  type A11yTagOptions,
} from '@pdfcraft/parser';
import { getInternalState } from './loader.js';
import type { FormFieldDescriptor, PdfDocumentHandle } from './types.js';

export type { Overlay, NewFieldDescriptor, NewFieldType, OutlineNode, PdfInfo, A11yTagOptions, A11yHeading } from '@pdfcraft/parser';

/**
 * Read the document's /Info metadata (title, author, subject, keywords,
 * creator, producer, dates). Empty object when no /Info entry exists.
 */
export async function readDocumentInfo(handle: PdfDocumentHandle): Promise<PdfInfo> {
  const { ownDoc } = getInternalState(handle);
  return readInfo(ownDoc);
}

/**
 * Pull the document outline (bookmarks) as a tree. Empty array when the
 * PDF has no /Outlines entry.
 */
export async function listOutline(handle: PdfDocumentHandle): Promise<OutlineNode[]> {
  const { ownDoc } = getInternalState(handle);
  return extractOutline(ownDoc);
}

/**
 * Enumerate every AcroForm field. Pulled from the parser's cached list
 * (built once on load) — strips the parser's internal objectNumber so
 * the public API stays implementation-agnostic.
 */
export async function listFormFields(handle: PdfDocumentHandle): Promise<FormFieldDescriptor[]> {
  const { fields } = getInternalState(handle);
  return fields.map(({ objectNumber: _on, ...rest }) => {
    void _on;
    return rest as FormFieldDescriptor;
  });
}

/**
 * Buffer field edits. Nothing is written until saveDocument(); this lets
 * callers batch updates without re-serializing each time.
 */
export async function writeFormFields(
  handle: PdfDocumentHandle,
  values: Record<string, string | boolean | string[]>,
): Promise<void> {
  const state = getInternalState(handle);
  for (const [k, v] of Object.entries(values)) state.pendingValues[k] = v;
}

/**
 * Pull edits from pdf.js's AnnotationStorage (typed directly on the
 * rendered PDF widgets) and merge them with buffered writeFormFields
 * calls. Source-of-truth precedence: explicit writeFormFields wins, then
 * AnnotationStorage. Returns a flat {fieldName: value} map.
 */
export function collectFormStorage(handle: PdfDocumentHandle): Record<string, string | boolean | string[]> {
  const { pdfjsDoc } = getInternalState(handle);
  const storage = pdfjsDoc.annotationStorage as unknown as {
    getAll?: () => Record<string, { value?: unknown; fieldName?: string }>;
  };
  const all = storage.getAll?.() ?? {};
  const out: Record<string, string | boolean | string[]> = {};
  for (const entry of Object.values(all)) {
    const fieldName = entry?.fieldName;
    const value = entry?.value;
    if (!fieldName || value === undefined || value === null) continue;
    if (typeof value === 'string' || typeof value === 'boolean') out[fieldName] = value;
    else if (Array.isArray(value)) out[fieldName] = value.map(String);
  }
  return out;
}

/**
 * Push {fieldName: value} into pdf.js's AnnotationStorage so the next
 * render shows the values on the page. Used when the user edits via
 * the dynamic form view and flips back to the direct-edit PDF view.
 */
export async function applyValuesToStorage(
  handle: PdfDocumentHandle,
  values: Record<string, string | boolean | string[]>,
): Promise<void> {
  const { pdfjsDoc } = getInternalState(handle);
  const storage = pdfjsDoc.annotationStorage as unknown as {
    setValue: (id: string, entry: { value: unknown }) => void;
  };
  // Map fieldName -> annotation id(s) by walking each page's annotations.
  const fieldToIds: Record<string, string[]> = {};
  for (let p = 1; p <= pdfjsDoc.numPages; p++) {
    const page = await pdfjsDoc.getPage(p);
    const annots = await page.getAnnotations({ intent: 'display' });
    for (const a of annots) {
      const fn = (a as { fieldName?: string }).fieldName;
      const id = (a as { id?: string }).id;
      if (!fn || !id) continue;
      (fieldToIds[fn] ??= []).push(id);
    }
  }
  for (const [fn, value] of Object.entries(values)) {
    const ids = fieldToIds[fn];
    if (!ids) continue;
    for (const id of ids) storage.setValue(id, { value: value as unknown });
  }
}

/**
 * Serialize the document. Pulls any AnnotationStorage edits, merges
 * with buffered writeFormFields, runs our incremental-update writer,
 * returns the new bytes. Zero pdf-lib in the runtime path.
 */
export async function saveDocument(
  handle: PdfDocumentHandle,
  opts: {
    overlays?: Overlay[];
    newFields?: NewFieldDescriptor[];
    /** Document-metadata patch applied to /Info on save. */
    info?: PdfInfo;
    /** Accessibility/PDF-UA structure tagging written into the catalog. */
    a11y?: A11yTagOptions;
    /** Page organization: keep/reorder (1-based), absolute rotations, and
     *  raw bytes of PDFs whose pages are appended (merge). */
    pages?: { order?: number[]; rotate?: Record<number, number>; appendPdfBytes?: Uint8Array[] };
  } = {},
): Promise<Uint8Array> {
  const state = getInternalState(handle);
  const fromLayer = collectFormStorage(handle);
  const merged: Record<string, string | boolean | string[]> = {
    ...fromLayer,
    ...state.pendingValues, // explicit calls override layer state
  };
  const overlays = opts.overlays ?? [];
  const newFields = opts.newFields ?? [];
  const info = opts.info ?? {};
  const a11y = opts.a11y;
  if (
    Object.keys(merged).length === 0 &&
    overlays.length === 0 &&
    newFields.length === 0 &&
    Object.keys(info).length === 0 &&
    !a11y &&
    !opts.pages
  ) {
    return state.ownDoc.sourceBytes;
  }
  let pages;
  if (opts.pages) {
    const append = [];
    for (const bytes of opts.pages.appendPdfBytes ?? []) append.push(await PdfDocument.load(bytes));
    pages = { order: opts.pages.order, rotate: opts.pages.rotate, append };
  }
  return saveFieldValues(state.ownDoc, state.fields, merged, overlays, newFields, info, a11y, pages);
}
