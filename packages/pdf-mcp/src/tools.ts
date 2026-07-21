/**
 * pdfcraft document operations, as plain async functions over PDF bytes.
 * The MCP server (index.ts) wraps these as agent tools; keeping them pure
 * makes them unit-testable in Node without an MCP client.
 *
 * Everything runs locally — no network, no upload — which is the whole point:
 * an agent can redact/tag/fill a sensitive PDF without the document ever
 * leaving the machine.
 */
import { createRequire } from 'node:module';

// Node < 22 lacks Promise.withResolvers (ES2024), which pdf.js's modern build
// calls at import/getDocument time. Polyfill it so the MCP server (a Node
// process) runs on Node 18/20 as well — observed as a CI failure on Node 20.
type WithResolvers = <T>() => {
  promise: Promise<T>;
  resolve: (v: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};
const P = Promise as unknown as { withResolvers?: WithResolvers };
if (typeof P.withResolvers !== 'function') {
  P.withResolvers = <T,>() => {
    let resolve!: (v: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}
import { PdfDocument, extractFormFields, saveFieldValues, type Overlay } from '@pdfcraft/parser';
import { configureWorker, loadDocument, getPdfjsDocument } from '@pdfcraft/engine';

// ── pdf.js worker (Node) ────────────────────────────────────────────────────
let workerReady = false;
function ensureWorker(): void {
  if (workerReady) return;
  const require = createRequire(import.meta.url);
  const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  configureWorker('file://' + workerPath);
  workerReady = true;
}

interface PdfjsItem { str?: string; transform?: number[]; width?: number; height?: number }
interface PdfjsPage {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  getTextContent: () => Promise<{ items: PdfjsItem[] }>;
}

async function pdfjsPages(bytes: Uint8Array): Promise<PdfjsPage[]> {
  ensureWorker();
  const handle = await loadDocument(bytes);
  const doc = getPdfjsDocument(handle) as unknown as { numPages: number; getPage: (n: number) => Promise<PdfjsPage> };
  const pages: PdfjsPage[] = [];
  for (let p = 1; p <= handle.pageCount; p++) pages.push(await doc.getPage(p));
  return pages;
}

// ── form fields ─────────────────────────────────────────────────────────────
export interface FieldInfo { id: string; type: string; value: unknown; required: boolean }

export async function listFormFields(bytes: Uint8Array): Promise<FieldInfo[]> {
  const doc = await PdfDocument.load(bytes);
  const fields = await extractFormFields(doc);
  return fields.map((f) => ({ id: f.id, type: f.type, value: f.value ?? null, required: !!f.required }));
}

export async function fillForm(
  bytes: Uint8Array,
  values: Record<string, string | boolean | string[]>,
): Promise<Uint8Array> {
  const doc = await PdfDocument.load(bytes);
  const fields = await extractFormFields(doc);
  return saveFieldValues(doc, fields, values, [], [], {});
}

// ── accessibility tagging ─────────────────────────────────────────────────────
export async function tagAccessibilityPdf(
  bytes: Uint8Array,
  opts: { lang?: string; title?: string } = {},
): Promise<Uint8Array> {
  const doc = await PdfDocument.load(bytes);
  const fields = await extractFormFields(doc);
  return saveFieldValues(doc, fields, {}, [], [], opts.title ? { title: opts.title } : {}, {
    lang: opts.lang ?? 'en-US',
  });
}

// ── text extraction ───────────────────────────────────────────────────────────
export async function extractText(bytes: Uint8Array): Promise<Array<{ page: number; text: string }>> {
  const pages = await pdfjsPages(bytes);
  const out: Array<{ page: number; text: string }> = [];
  for (let i = 0; i < pages.length; i++) {
    const tc = await pages[i]!.getTextContent();
    out.push({ page: i + 1, text: tc.items.map((it) => it.str ?? '').join(' ').replace(/\s+/g, ' ').trim() });
  }
  return out;
}

// ── redact by search term (TRUE redaction + verification) ──────────────────────
export interface RedactResult {
  pdf: Uint8Array;
  matched: number;
  verified: boolean;
  leaks: Array<{ page: number; text: string }>;
}

/**
 * Redact every occurrence of any `needles` term, then independently verify the
 * terms are gone from the output. Matches are at the text-item granularity
 * (an item whose text contains a needle) — robust for tokens like emails,
 * IDs, and single words; multi-token phrases that pdf.js splits across items
 * may need per-token terms.
 */
export async function redactMatches(
  bytes: Uint8Array,
  needles: string[],
  opts: { caseSensitive?: boolean } = {},
): Promise<RedactResult> {
  const terms = needles.map((n) => (opts.caseSensitive ? n : n.toLowerCase())).filter(Boolean);
  const pages = await pdfjsPages(bytes);

  const overlays: Overlay[] = [];
  let matched = 0;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      const s = it.str ?? '';
      const hay = opts.caseSensitive ? s : s.toLowerCase();
      if (!s.trim() || !terms.some((t) => hay.includes(t))) continue;
      const tr = it.transform ?? [1, 0, 0, 1, 0, 0];
      const x = tr[4] ?? 0;
      const baseline = tr[5] ?? 0;
      const w = it.width ?? 0;
      const h = it.height ?? Math.hypot(tr[2] ?? 0, tr[3] ?? 0) ?? 8;
      // CSS top-left box, with pageCssWidth = scale-1 viewport (== PDF points).
      overlays.push({
        kind: 'redact',
        page: i + 1,
        x: x - 1,
        y: vp.height - (baseline + h) - 1,
        width: w + 2,
        height: h + 2,
        pageCssWidth: vp.width,
        pageCssHeight: vp.height,
      });
      matched++;
    }
  }

  const doc = await PdfDocument.load(bytes);
  const fields = await extractFormFields(doc);
  const pdf = await saveFieldValues(doc, fields, {}, overlays, [], {});

  // Independent verification: re-extract and confirm the terms are gone.
  const after = await extractText(pdf);
  const leaks: Array<{ page: number; text: string }> = [];
  for (const pg of after) {
    const hay = opts.caseSensitive ? pg.text : pg.text.toLowerCase();
    const hit = terms.filter((t) => hay.includes(t));
    if (hit.length) leaks.push({ page: pg.page, text: hit.join(', ') });
  }

  return { pdf, matched, verified: leaks.length === 0, leaks };
}
