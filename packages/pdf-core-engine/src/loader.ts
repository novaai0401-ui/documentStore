import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  PdfDocument as OwnPdfDocument,
  extractFormFields as ownExtractFields,
  EncryptedPdfError,
  type FormFieldDescriptor as OwnFieldDescriptor,
} from '@pdfcraft/parser';
import type { PdfDocumentHandle, FormFieldDescriptor } from './types.js';
import { extractPageLabels } from './page-labels.js';

export { EncryptedPdfError };

export interface LoadDocumentOptions {
  /** Password for encrypted PDFs. Tried as user password first, then owner. */
  password?: string;
}

export interface InternalState {
  pdfjsDoc: PDFDocumentProxy;
  /** Our from-scratch parser document — used for AcroForm read + save.
   *  pdf-lib is no longer in the runtime path. */
  ownDoc: OwnPdfDocument;
  /** Cached field descriptors so we don't re-walk on every list call. */
  fields: OwnFieldDescriptor[];
  /** Buffered field edits, flushed on saveDocument. */
  pendingValues: Record<string, string | boolean | string[]>;
  /** Password used to load (kept for save-time re-encryption). undefined when not encrypted. */
  password?: string;
}

let workerConfigured = false;

/** Override the pdf.js worker source. Call once before loadDocument if
 *  you want to host the worker yourself instead of using the CDN default. */
export function configureWorker(workerSrc: string): void {
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  workerConfigured = true;
}

function ensureWorker(): void {
  if (workerConfigured) return;
  // Privacy-first default: never reach out to a third-party CDN. If the host app
  // hasn't self-hosted the worker via configureWorker(), fall back to the
  // main-thread "fake worker" (slower, but nothing leaves the device). Apps
  // should call configureWorker() with a bundled worker URL for full speed.
  pdfjs.GlobalWorkerOptions.workerSrc = '';
  if (typeof console !== 'undefined') {
    console.warn('[pdfcraft] pdf.js worker not configured; running on the main thread. Call configureWorker() with a self-hosted worker URL for best performance.');
  }
  workerConfigured = true;
}

/**
 * Load a PDF from raw bytes. The engine keeps two parallel reps:
 *   - pdf.js  → rendering (canvas + AnnotationLayer)
 *   - @pdfcraft/parser → AcroForm read + incremental write
 *
 * No third-party PDF read/write library in the runtime path anymore.
 */
export async function loadDocument(
  bytes: Uint8Array,
  opts: LoadDocumentOptions = {},
): Promise<PdfDocumentHandle> {
  ensureWorker();
  // pdf.js detaches the input buffer; give it a copy so our parser
  // (and a future save) keep the canonical bytes intact.
  //
  // EncryptedPdfError bubbles up untouched — the UI catches it, prompts
  // for a password, and retries.
  const ownDoc = await OwnPdfDocument.load(bytes.slice(), { password: opts.password });
  const pdfjsDoc = await pdfjs.getDocument({
    data: bytes.slice(),
    password: opts.password,
  }).promise;
  const rawFields = await ownExtractFields(ownDoc, (diag) => {
    if (diag.emittedDescriptorCount === 0) {
      // Surface why so consumers (or you, in DevTools) can tell apart
      // "no form", "XFA form", and "we walked but skipped everything".
      // eslint-disable-next-line no-console
      console.warn('[pdf-core/engine] extractFormFields returned 0 fields:', diag);
    }
  });

  // Pull visible labels from page text (via pdf.js getTextContent) and
  // attach them as `pageLabel`. Form-schema's deriveLabel prefers this
  // over the raw /T id, so users see "Address" instead of
  // "trueNameAddressAddress" and the actual checkbox prompt instead of
  // a roman numeral.
  let labelMap: Record<string, string> = {};
  try {
    labelMap = await extractPageLabels(pdfjsDoc, rawFields as unknown as FormFieldDescriptor[]);
  } catch (e) {
    // Don't fail the whole load — the form view is still functional with
    // /T-derived labels if page-text extraction throws.
    // eslint-disable-next-line no-console
    console.warn('[pdf-core/engine] extractPageLabels failed:', e);
  }
  const fields = rawFields.map((f) => {
    const lbl = labelMap[f.id];
    return lbl ? { ...f, pageLabel: lbl } : f;
  }) as OwnFieldDescriptor[];

  const internal: InternalState = {
    pdfjsDoc,
    ownDoc,
    fields,
    pendingValues: {},
    password: opts.password,
  };
  return {
    pageCount: pdfjsDoc.numPages,
    sourceBytes: bytes,
    _internal: internal,
  };
}

export function getInternalState(handle: PdfDocumentHandle): InternalState {
  return handle._internal as InternalState;
}

/**
 * Public accessor for the underlying pdf.js document. The handle's internal
 * field is property-mangled in the built engine (tsup `mangleProps: /^_/`),
 * so consumers MUST NOT reach for `handle._internal` by name across the
 * package boundary — that string no longer exists at runtime. Use this
 * instead to get the live PDFDocumentProxy for text extraction, metadata, etc.
 */
export function getPdfjsDocument(handle: PdfDocumentHandle): PDFDocumentProxy {
  return getInternalState(handle).pdfjsDoc;
}
