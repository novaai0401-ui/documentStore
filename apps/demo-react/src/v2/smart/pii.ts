/**
 * PII detection + true redaction.
 *
 * Scans the document's text/OCR runs for sensitive patterns and turns each
 * match into a `redact` annotation. On save these go through the parser's
 * redaction overlay, which paints an opaque bar AND removes the covered text
 * from the content stream via incremental update — i.e. real redaction, not
 * a box you can select-through or copy under.
 *
 * Detection is offline-by-default (deterministic regex + Luhn for cards).
 * Names/addresses are intentionally NOT regex-guessed — that needs a model;
 * the Agentic tool can layer AI-found spans on top when a key is configured.
 */
import type { Annotation } from '../Annotations.js';
import { redactionAnnotation, spanBox, type PageRuns } from './util.js';

export type PiiType = 'email' | 'ssn' | 'phone' | 'credit-card' | 'iban' | 'ip' | 'date';

export interface PiiMatch {
  page: number;
  type: PiiType;
  value: string;
  /** Run index + char offsets, for building the redaction box. */
  runIndex: number;
  start: number;
  end: number;
}

export const PII_LABELS: Record<PiiType, string> = {
  email: 'Email addresses',
  ssn: 'Social security numbers',
  phone: 'Phone numbers',
  'credit-card': 'Credit-card numbers',
  iban: 'Bank accounts (IBAN)',
  ip: 'IP addresses',
  date: 'Dates',
};

// Each detector is a global regex over a single line of text. Order matters
// only for display; matches are independent.
const DETECTORS: Array<{ type: PiiType; re: RegExp; validate?: (s: string) => boolean }> = [
  { type: 'email', re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { type: 'ssn', re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: 'credit-card', re: /\b(?:\d[ -]?){13,16}\b/g, validate: luhnValid },
  { type: 'iban', re: /\b[A-Z]{2}\d{2}[ ]?(?:[A-Z0-9]{4}[ ]?){2,7}[A-Z0-9]{1,4}\b/g, validate: ibanValid },
  { type: 'phone', re: /(?:\+?\d{1,2}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
  { type: 'ip', re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g },
  {
    type: 'date',
    re: /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/gi,
  },
];

function luhnValid(raw: string): boolean {
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length < 13 || digits.length > 16) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/** IBAN check: 15–34 alphanumerics that pass the ISO 7064 mod-97 test. */
function ibanValid(raw: string): boolean {
  const s = raw.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  // Convert letters to numbers (A=10 … Z=35), then mod-97 in chunks to avoid bigint.
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch >= 'A' && ch <= 'Z' ? (ch.charCodeAt(0) - 55).toString() : ch;
    for (const d of code) remainder = (remainder * 10 + (d.charCodeAt(0) - 48)) % 97;
  }
  return remainder === 1;
}

/** Find all PII matches of the enabled `types` across the given pages. */
export function scanPii(pages: PageRuns[], types: Set<PiiType>): PiiMatch[] {
  const out: PiiMatch[] = [];
  for (const page of pages) {
    page.runs.forEach((run, runIndex) => {
      for (const det of DETECTORS) {
        if (!types.has(det.type)) continue;
        det.re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = det.re.exec(run.text)) !== null) {
          const value = m[0];
          // Skip near-empty / degenerate matches.
          if (value.replace(/\D/g, '').length < (det.type === 'phone' ? 7 : 1) && det.type !== 'email') {
            continue;
          }
          if (det.validate && !det.validate(value)) continue;
          out.push({
            page: page.page,
            type: det.type,
            value,
            runIndex,
            start: m.index,
            end: m.index + value.length,
          });
          if (m.index === det.re.lastIndex) det.re.lastIndex++; // avoid zero-width loop
        }
      }
    });
  }
  return out;
}

/** Turn matches into redaction annotations, keyed by page so we can size each
 *  box from its run. `selected` lets the UI redact a subset. */
export function piiToRedactions(
  pages: PageRuns[],
  matches: PiiMatch[],
  selected?: Set<number>,
): Annotation[] {
  const byPage = new Map(pages.map((p) => [p.page, p]));
  const out: Annotation[] = [];
  matches.forEach((match, i) => {
    if (selected && !selected.has(i)) return;
    const page = byPage.get(match.page);
    const run = page?.runs[match.runIndex];
    if (!page || !run) return;
    out.push(redactionAnnotation(page, spanBox(run, match.start, match.end)));
  });
  return out;
}
