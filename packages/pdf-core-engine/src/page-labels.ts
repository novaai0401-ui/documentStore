/**
 * Page-text label extraction.
 *
 * AcroForm /T field names are usually internal identifiers
 * (`trueNameAddressAddress`, `i`, `ii`, `iii`, `principalOccupation`).
 * The human label users want to see ("Name:", "Address:", "(i) PCA
 * Principal is a 'swap dealer'…") is rendered as page-content text
 * positioned next to the widget rect — not stored as a field property.
 *
 * This module asks pdf.js for each page's text content, then for every
 * widget finds the best-matching label by looking in three positions:
 *
 *   1. LEFT   — same baseline, text ends within ~6px of widget's left
 *               edge. Pattern: "Name:" "Address:" "E-mail:"
 *   2. ABOVE  — text baseline 4-40px above widget top, X overlapping.
 *               Pattern: "What is PCA Principal's LEI/CICI?"   ← label
 *                        [ widget below ]
 *   3. RIGHT  — same baseline, text starts within ~30px of widget's
 *               right edge. Pattern (checkbox/radio):
 *               [☐] (i) PCA Principal is a "swap dealer"…
 *
 * For check / radio fields the LEFT and ABOVE searches are skipped (their
 * label is almost always to the right). For everything else all three are
 * scored and the longest reasonable hit wins.
 *
 * Coordinate system note: PDF user space has Y increasing UPWARD. Widget
 * rect [x1, y1, x2, y2] uses y1 = bottom, y2 = top. Text item transform[5]
 * is the baseline Y, also in user-space. Both are consistent — no flip
 * needed inside this file.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { FormFieldDescriptor } from './types.js';

interface TextItem {
  str: string;
  transform: number[]; // [a, b, c, d, e, f]
  width: number;
  height: number;
}

/**
 * For every supplied field, return a best-effort visible label pulled
 * from page text. Fields whose pages aren't found, or where no text
 * matched, simply don't get a key in the returned record — caller
 * should fall back to its existing label-derivation logic.
 */
export async function extractPageLabels(
  pdfjsDoc: PDFDocumentProxy,
  fields: FormFieldDescriptor[],
): Promise<Record<string, string>> {
  const byPage = new Map<number, FormFieldDescriptor[]>();
  for (const f of fields) {
    if (f.page > 0) {
      if (!byPage.has(f.page)) byPage.set(f.page, []);
      byPage.get(f.page)!.push(f);
    }
  }

  const labels: Record<string, string> = {};

  for (const [pageNum, pageFields] of byPage) {
    let items: TextItem[];
    try {
      const page = await pdfjsDoc.getPage(pageNum);
      const tc = await page.getTextContent();
      items = tc.items as TextItem[];
    } catch {
      continue;
    }

    for (const field of pageFields) {
      const label = findLabel(items, field);
      if (label) labels[field.id] = label;
    }
  }

  return labels;
}

// ─────────────────────────────────────────────────────────────────────────────
//   Per-field search
// ─────────────────────────────────────────────────────────────────────────────

function findLabel(items: TextItem[], field: FormFieldDescriptor): string | null {
  const [x1, y1, x2, y2] = field.rect;
  const widgetCenterY = (y1 + y2) / 2;
  const widgetHeight = y2 - y1;
  const widgetWidth = x2 - x1;

  const isToggle = field.type === 'checkbox' || field.type === 'radio';

  const candidates: Array<{ text: string; score: number }> = [];

  for (const item of items) {
    const text = item.str.trim();
    if (!text) continue;
    if (text.length < 1) continue;
    // Page numbers, ornamental dashes, etc. are noise.
    if (/^[\s\d.,;:\-—–_]+$/.test(text)) continue;

    const itemX1 = item.transform[4] ?? 0;
    const itemY = item.transform[5] ?? 0;
    const itemX2 = itemX1 + (item.width ?? 0);
    const itemHeight = item.height || Math.abs(item.transform[3] ?? 12);

    const sameBaseline = Math.abs(itemY - widgetCenterY) < Math.max(widgetHeight, 12);

    // ─── 3. RIGHT-of-widget — checkbox / radio labels ─────────────
    if (isToggle && sameBaseline && itemX1 >= x2 - 4 && itemX1 - x2 < 80) {
      // Score: prefer longer, closer, descriptive (penalize all-uppercase
      // marker text like "(i)" which is rarely the real label).
      const distancePenalty = (itemX1 - x2) / 80;     // 0..1
      const lengthBoost = Math.min(text.length, 80) / 80; // 0..1
      const markerPenalty = /^\([ivx]+\)|^[ivx]+\.$|^[a-z]\)/i.test(text) ? 0.4 : 0;
      const score = lengthBoost - distancePenalty * 0.3 - markerPenalty;
      candidates.push({ text, score });
      continue;
    }

    if (isToggle) continue; // skip left/above for toggles

    // ─── 1. LEFT-of-widget — same baseline, "Name:" style ─────────
    if (sameBaseline && itemX2 <= x1 + 4 && x1 - itemX2 < 120) {
      const distancePenalty = (x1 - itemX2) / 120;
      const lengthBoost = Math.min(text.length, 60) / 60;
      const colonBoost = /[:?]$/.test(text) ? 0.4 : 0;
      const score = lengthBoost - distancePenalty * 0.2 + colonBoost;
      candidates.push({ text, score });
      continue;
    }

    // ─── 2. ABOVE-widget — text baseline 4..40px above widget top ─
    const xOverlap = itemX2 > x1 - 20 && itemX1 < x2 + 20;
    const aboveDelta = itemY - y2;
    if (xOverlap && aboveDelta > 0 && aboveDelta < itemHeight * 3.5) {
      const distancePenalty = aboveDelta / (itemHeight * 3.5);
      const lengthBoost = Math.min(text.length, 80) / 80;
      const promptBoost = /[:?]$/.test(text) ? 0.3 : 0;
      const score = lengthBoost - distancePenalty * 0.4 + promptBoost;
      candidates.push({ text, score });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0]!;
  if (best.score < 0.1) return null;
  // Skip if it doesn't add information beyond the field id
  return cleanLabel(best.text);
}

function cleanLabel(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/[:.?]+$/, '')
    .trim();
}
