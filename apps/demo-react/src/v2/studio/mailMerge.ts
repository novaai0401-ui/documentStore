/**
 * Mail-merge — pure, framework-free, and fully local. Parse a CSV of records,
 * then fill {{placeholder}} tokens in a design's text (or any string) per record
 * to produce one personalized copy each. The rendered batch is combined into a
 * single PDF by exportDesign.designsToPdf(). No network, nothing uploaded.
 */
import type { Design, Element } from './model.js';

export interface CsvData {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * A small but correct CSV parser: handles quoted fields, embedded commas and
 * newlines, and "" escaped quotes. The first row is treated as the header.
 */
export function parseCsv(text: string): CsvData {
  const rowsRaw: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  // Normalise line endings so CRLF and CR behave like LF.
  const s = text.replace(/\r\n?/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rowsRaw.push(row); field = ''; row = []; }
    else field += c;
  }
  // Flush the trailing field/row (file may not end with a newline).
  if (field.length > 0 || row.length > 0) { row.push(field); rowsRaw.push(row); }

  const nonEmpty = rowsRaw.filter((r) => r.some((c) => c.trim() !== ''));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const headers = nonEmpty[0]!.map((h) => h.trim());
  const rows = nonEmpty.slice(1).map((cells) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => { rec[h] = (cells[idx] ?? '').trim(); });
    return rec;
  });
  return { headers, rows };
}

const TOKEN = /\{\{\s*([\w.-]+)\s*\}\}/g;

/** Replace {{field}} tokens in `template` using `record`; unknown tokens → ''. */
export function fillTemplate(template: string, record: Record<string, string>): string {
  return template.replace(TOKEN, (_m, key: string) => record[key] ?? '');
}

/** The unique placeholder names referenced anywhere in `template`. */
export function templateFields(template: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(template)) !== null) out.add(m[1]!);
  return [...out];
}

/** All placeholder names used across every text element of a design. */
export function designFields(design: Design): string[] {
  const out = new Set<string>();
  for (const el of design.elements) {
    if (el.type === 'text') templateFields(el.text).forEach((f) => out.add(f));
  }
  return [...out];
}

/** A deep copy of `design` with every text element filled from `record`. */
export function mergeDesign(design: Design, record: Record<string, string>): Design {
  const elements: Element[] = design.elements.map((el) =>
    el.type === 'text' ? { ...el, text: fillTemplate(el.text, record) } : { ...el },
  );
  return { ...design, elements };
}

/** One filled design per CSV row — ready to combine into a single PDF. */
export function mergeDesigns(design: Design, data: CsvData): Design[] {
  return data.rows.map((rec) => mergeDesign(design, rec));
}
