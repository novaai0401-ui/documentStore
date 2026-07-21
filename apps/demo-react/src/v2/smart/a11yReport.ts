/**
 * Accessibility compliance report — the "Deadline Machine".
 *
 * Audits a PDF's accessibility state against the criteria regulators actually
 * cite (EN 301 549 §10 → WCAG 2.1 AA, with PDF/UA as the implementation
 * standard for PDFs: EAA in the EU since June 2025, ADA Title II for US
 * state/local government from April 2027/2028, Section 508 federally), and
 * renders a filed-ready HTML report.
 *
 * Same philosophy as the redaction verifier: the report is generated from the
 * BYTES (re-parsed independently), so the "after remediation" report audits
 * the actual exported file, not the editor's in-memory intent. This module
 * checks what can be verified mechanically and says so — it does not claim
 * full PDF/UA conformance (e.g. alt-text quality and reading-order semantics
 * need human review, and the report states that plainly).
 */
import { PdfDocument, readAccessibilitySummary, extractFormFields } from '@pdfcraft/parser';

export interface A11yCriterion {
  id: string;
  /** Short name, e.g. "Document is tagged". */
  label: string;
  /** Regulatory reference, e.g. "WCAG 2.1 1.3.1 / PDF/UA §7.1". */
  ref: string;
  status: 'pass' | 'fail' | 'review';
  evidence: string;
}

export interface A11yComplianceReport {
  fileName: string;
  generatedAt: string;
  pageCount: number;
  criteria: A11yCriterion[];
  passCount: number;
  failCount: number;
  reviewCount: number;
  /** True when no machine-checkable criterion failed. */
  ok: boolean;
}

interface CollectInput {
  fileName: string;
  pageCount: number;
  /** Chars of extractable text per page (index 0 = page 1). */
  textCharsPerPage: number[];
  marked: boolean;
  hasStructTree: boolean;
  lang: string | null;
  title: string | null;
  displayDocTitle: boolean;
  /** AcroForm fields: total and how many have non-empty ids. */
  fieldCount: number;
  namedFieldCount: number;
  /** Detected heading count (visual heuristic) — informational. */
  headingCount: number;
}

/** Assemble the criteria list from collected facts. Pure — unit-testable. */
export function buildCriteria(input: CollectInput): A11yComplianceReport {
  const c: A11yCriterion[] = [];
  const pagesWithText = input.textCharsPerPage.filter((n) => n > 0).length;

  c.push({
    id: 'tagged',
    label: 'Document is marked as tagged',
    ref: 'PDF/UA §7.1 · WCAG 2.1 1.3.1 (Info and Relationships)',
    status: input.marked ? 'pass' : 'fail',
    evidence: input.marked ? '/MarkInfo <</Marked true>> present in catalog.' : 'No /MarkInfo — assistive technology treats the file as untagged.',
  });
  c.push({
    id: 'structure',
    label: 'Logical structure tree present',
    ref: 'PDF/UA §7.1 · WCAG 2.1 1.3.1',
    status: input.hasStructTree ? 'pass' : 'fail',
    evidence: input.hasStructTree ? '/StructTreeRoot present; content is bound to structure elements.' : 'No /StructTreeRoot in the catalog.',
  });
  c.push({
    id: 'text-layer',
    label: 'Machine-readable text on every page',
    ref: 'WCAG 2.1 1.1.1 (Non-text Content) · 1.4.5 (Images of Text)',
    status: pagesWithText === input.pageCount ? 'pass' : 'fail',
    evidence:
      pagesWithText === input.pageCount
        ? `All ${input.pageCount} page(s) expose extractable text.`
        : `${input.pageCount - pagesWithText} of ${input.pageCount} page(s) have no extractable text (likely scans — run OCR + embed a text layer).`,
  });
  c.push({
    id: 'lang',
    label: 'Document language declared',
    ref: 'WCAG 2.1 3.1.1 (Language of Page) · PDF/UA §7.2',
    status: input.lang ? 'pass' : 'fail',
    evidence: input.lang ? `Catalog /Lang = "${input.lang}".` : 'No /Lang — screen readers may use the wrong pronunciation rules.',
  });
  c.push({
    id: 'title',
    label: 'Document title set and displayed',
    ref: 'WCAG 2.1 2.4.2 (Page Titled) · PDF/UA §7.1',
    status: input.title && input.displayDocTitle ? 'pass' : 'fail',
    evidence:
      input.title && input.displayDocTitle
        ? `/Info /Title = "${input.title}" with /DisplayDocTitle true.`
        : !input.title
          ? 'No document title in /Info — readers announce the filename instead.'
          : 'Title present but /DisplayDocTitle is not set.',
  });
  if (input.fieldCount > 0) {
    c.push({
      id: 'fields',
      label: 'Form fields are named',
      ref: 'WCAG 2.1 3.3.2 (Labels or Instructions) · PDF/UA §7.18',
      status: input.namedFieldCount === input.fieldCount ? 'pass' : 'fail',
      evidence: `${input.namedFieldCount} of ${input.fieldCount} field(s) carry a name assistive technology can announce.`,
    });
  }
  c.push({
    id: 'headings',
    label: 'Heading structure (human review)',
    ref: 'WCAG 2.1 2.4.6 (Headings and Labels) · 1.3.1',
    status: 'review',
    evidence:
      input.headingCount > 0
        ? `${input.headingCount} visual heading(s) detected. Verify the heading hierarchy and reading order manually — semantic quality cannot be machine-certified.`
        : 'No clear visual headings detected. If the document has sections, add heading structure.',
  });
  c.push({
    id: 'alt-text',
    label: 'Alternative text for images (human review)',
    ref: 'WCAG 2.1 1.1.1 · PDF/UA §7.3',
    status: 'review',
    evidence: 'Image alt-text quality requires human judgement; review any figures/diagrams.',
  });

  const passCount = c.filter((x) => x.status === 'pass').length;
  const failCount = c.filter((x) => x.status === 'fail').length;
  const reviewCount = c.filter((x) => x.status === 'review').length;
  return {
    fileName: input.fileName,
    generatedAt: new Date().toISOString(),
    pageCount: input.pageCount,
    criteria: c,
    passCount,
    failCount,
    reviewCount,
    ok: failCount === 0,
  };
}

/** Collect the facts from actual PDF bytes (independent re-parse). */
export async function auditPdfBytes(
  bytes: Uint8Array,
  fileName: string,
  headingCount: number,
): Promise<A11yComplianceReport> {
  // Catalog-level facts via the parser.
  const doc = await PdfDocument.load(bytes);
  const summary = await readAccessibilitySummary(doc);
  const fields = await extractFormFields(doc);
  const info = await readTitle(doc);

  // Per-page text via pdf.js (lazy — pulls the engine only when auditing).
  const { loadDocument, getPdfjsDocument } = await import('@pdfcraft/engine');
  const handle = await loadDocument(bytes);
  const pdfjsDoc = getPdfjsDocument(handle) as unknown as {
    getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string }> }> }>;
  };
  const textCharsPerPage: number[] = [];
  for (let p = 1; p <= handle.pageCount; p++) {
    const tc = await (await pdfjsDoc.getPage(p)).getTextContent();
    textCharsPerPage.push(tc.items.reduce((n, it) => n + (it.str?.trim().length ?? 0), 0));
  }

  return buildCriteria({
    fileName,
    pageCount: handle.pageCount,
    textCharsPerPage,
    marked: summary.marked,
    hasStructTree: summary.hasStructTree,
    lang: summary.lang,
    title: info,
    displayDocTitle: summary.displayDocTitle,
    fieldCount: fields.length,
    namedFieldCount: fields.filter((f) => !!f.id?.trim()).length,
    headingCount,
  });
}

async function readTitle(doc: PdfDocument): Promise<string | null> {
  try {
    const { readInfo } = await import('@pdfcraft/parser');
    const info = await readInfo(doc);
    return (info as { title?: string }).title?.trim() || null;
  } catch {
    return null;
  }
}

/** Render the report as a self-contained, printable HTML document. Pure. */
export function renderReportHtml(r: A11yComplianceReport, note?: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const badge = (s: A11yCriterion['status']) =>
    s === 'pass' ? '<span class="b pass">PASS</span>' : s === 'fail' ? '<span class="b fail">FAIL</span>' : '<span class="b rev">REVIEW</span>';
  const rows = r.criteria
    .map((c) => `<tr><td>${badge(c.status)}</td><td><strong>${esc(c.label)}</strong><br><small>${esc(c.ref)}</small></td><td>${esc(c.evidence)}</td></tr>`)
    .join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Accessibility report — ${esc(r.fileName)}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:880px;margin:40px auto;padding:0 20px;color:#1f2933}
h1{font-size:22px} .sub{color:#64748b;font-size:13px}
.summary{display:flex;gap:18px;margin:18px 0;font-size:15px}
.b{display:inline-block;padding:2px 8px;border-radius:5px;font-size:11px;font-weight:700}
.pass{background:#dcfce7;color:#166534}.fail{background:#fee2e2;color:#b91c1c}.rev{background:#fef9c3;color:#854d0e}
table{border-collapse:collapse;width:100%;font-size:13px}
td{border:1px solid #e2e8f0;padding:10px;vertical-align:top}
.note{margin-top:18px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;color:#475569}
.verdict{font-size:16px;font-weight:700;color:${r.ok ? '#166534' : '#b91c1c'}}
</style></head><body>
<h1>PDF Accessibility Compliance Report</h1>
<p class="sub">File: <strong>${esc(r.fileName)}</strong> · ${r.pageCount} page(s) · Generated ${esc(r.generatedAt)} · pdfcraft (client-side audit — the document never left the device)</p>
<div class="summary">
  <span class="verdict">${r.ok ? '✓ No machine-checkable failures' : `✕ ${r.failCount} failure(s)`}</span>
  <span>${r.passCount} pass</span><span>${r.failCount} fail</span><span>${r.reviewCount} need human review</span>
</div>
<table><tbody>${rows}</tbody></table>
${note ? `<div class="note">${esc(note)}</div>` : ''}
<div class="note">Scope: machine-verifiable criteria of EN 301 549 §10 / WCAG 2.1 AA / PDF/UA as applicable to PDF documents (tagging markers, structure tree, text layer, language, title, field naming). Items marked REVIEW require human judgement and are not certified by this tool. This report is generated technical evidence, not legal advice.</div>
</body></html>`;
}
