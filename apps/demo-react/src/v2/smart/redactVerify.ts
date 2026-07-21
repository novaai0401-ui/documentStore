/**
 * Redaction verifier — "Prove it's gone."
 *
 * True redaction strips the text from the content stream (see the parser's
 * redact.ts). But a redaction tool must never be trusted on its own word: the
 * famous failures (Manafort 2019, DOJ Epstein files 2025) all *looked*
 * redacted. So after exporting, we independently re-extract text from the
 * SAVED bytes with pdf.js and assert that every redaction region is empty. If
 * any extractable text remains under a box, we report FAIL and refuse to
 * certify — the opposite of a false sense of security.
 *
 * Coordinates are normalized to page fractions so the check is robust to
 * whatever CSS scale the redaction boxes were drawn at.
 */

export interface RedactBox {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  pageCssWidth: number;
  pageCssHeight: number;
}

export interface RegionResult {
  page: number;
  clean: boolean;
  /** Any text still extractable inside the region (should be empty). */
  leaked: string;
}

export interface RedactReport {
  ok: boolean;
  total: number;
  cleanCount: number;
  regions: RegionResult[];
  /** When ok, a short certificate string the UI can show/download. */
  certificate?: string;
}

interface PdfItem { str?: string; transform?: number[]; width?: number; height?: number }

/**
 * Verify that no text remains under any redaction box in `bytes`.
 */
export async function verifyRedactions(bytes: Uint8Array, boxes: RedactBox[]): Promise<RedactReport> {
  if (boxes.length === 0) {
    return { ok: true, total: 0, cleanCount: 0, regions: [] };
  }
  // Lazy-load the engine (pulls pdf.js) only when verifying.
  const { loadDocument, getPdfjsDocument } = await import('@pdfcraft/engine');
  const handle = await loadDocument(bytes);
  const pdfjsDoc = getPdfjsDocument(handle) as unknown as {
    getPage: (n: number) => Promise<{
      getViewport: (o: { scale: number }) => { width: number; height: number };
      getTextContent: () => Promise<{ items: PdfItem[] }>;
    }>;
  };

  const byPage = new Map<number, RedactBox[]>();
  for (const b of boxes) (byPage.get(b.page) ?? byPage.set(b.page, []).get(b.page)!).push(b);

  const regions: RegionResult[] = [];
  for (const [pageNo, group] of byPage) {
    const page = await pdfjsDoc.getPage(pageNo);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();

    // Pre-compute each text item's box as page fractions (top-left origin).
    const items = tc.items
      .filter((it) => (it.str ?? '').trim().length > 0)
      .map((it) => {
        const t = it.transform ?? [1, 0, 0, 1, 0, 0];
        const x = t[4] ?? 0;
        const yBaseline = t[5] ?? 0;
        const w = it.width ?? 0;
        const h = it.height ?? Math.hypot(t[2] ?? 0, t[3] ?? 0) ?? 8;
        return {
          str: it.str ?? '',
          fx0: x / vp.width,
          fx1: (x + w) / vp.width,
          fyTop: (vp.height - (yBaseline + h)) / vp.height,
          fyBot: (vp.height - yBaseline) / vp.height,
        };
      });

    for (const box of group) {
      const rx0 = box.x / box.pageCssWidth;
      const rx1 = (box.x + box.width) / box.pageCssWidth;
      const ry0 = box.y / box.pageCssHeight;
      const ry1 = (box.y + box.height) / box.pageCssHeight;
      let leaked = '';
      for (const it of items) {
        const overlap = it.fx1 >= rx0 && it.fx0 <= rx1 && it.fyBot >= ry0 && it.fyTop <= ry1;
        if (overlap) leaked += (leaked ? ' ' : '') + it.str;
      }
      regions.push({ page: pageNo, clean: leaked.trim().length === 0, leaked: leaked.trim() });
    }
  }

  const cleanCount = regions.filter((r) => r.clean).length;
  const ok = cleanCount === regions.length;
  return {
    ok,
    total: regions.length,
    cleanCount,
    regions,
    certificate: ok
      ? `pdfcraft redaction certificate — ${regions.length} region(s) verified clean (no extractable text) on ${new Date().toISOString()}.`
      : undefined,
  };
}
