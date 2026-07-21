/**
 * Best-effort table extraction from text/OCR runs.
 *
 * Runs are line fragments positioned in scale-1 space. We cluster them into
 * rows (by vertical position) and columns (by the x-position of each cell),
 * then read out a grid that can be exported to CSV / JSON.
 *
 * This is a geometric heuristic, not a layout engine: it shines on tables
 * whose columns are visually separated (the common case), and degrades on
 * dense tables where adjacent cells were already merged into one run. We
 * surface a confidence note rather than pretending every PDF is clean.
 */
import { csvCell, type PageRuns } from './util.js';
import type { TextRun } from '../pdfText.js';

export interface ExtractedTable {
  page: number;
  rows: string[][];
  /** 0..1 — share of body rows that filled every detected column. */
  confidence: number;
}

/** Group a page's runs into visual rows (top-to-bottom). */
function toRows(runs: TextRun[]): TextRun[][] {
  if (runs.length === 0) return [];
  const sorted = [...runs].sort((a, b) => a.y - b.y || a.x - b.x);
  const medianH = median(sorted.map((r) => r.height)) || 10;
  const rows: TextRun[][] = [];
  let cur: TextRun[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i]!;
    const prev = cur[cur.length - 1]!;
    // Same row when baselines sit within ~60% of a line height.
    if (Math.abs(r.y - prev.y) <= medianH * 0.6) cur.push(r);
    else {
      rows.push(cur.sort((a, b) => a.x - b.x));
      cur = [r];
    }
  }
  rows.push(cur.sort((a, b) => a.x - b.x));
  return rows;
}

/** Derive column x-anchors by clustering cell left-edges across all rows. */
function columnAnchors(rows: TextRun[][], tol: number): number[] {
  const xs = rows.flatMap((row) => row.map((r) => r.x)).sort((a, b) => a - b);
  const anchors: number[] = [];
  for (const x of xs) {
    if (anchors.length === 0 || x - anchors[anchors.length - 1]! > tol) anchors.push(x);
  }
  return anchors;
}

/**
 * Detect tables on a single page. Returns the most table-like region only
 * when there's real 2-D structure (≥2 columns, ≥2 multi-column rows).
 */
export function extractTables(page: PageRuns): ExtractedTable[] {
  const rows = toRows(page.runs).filter((r) => r.length > 0);
  if (rows.length < 2) return [];

  const medianH = median(page.runs.map((r) => r.height)) || 10;
  const anchors = columnAnchors(rows, medianH * 1.5);
  if (anchors.length < 2) return [];

  const grid: string[][] = [];
  let multiColRows = 0;
  for (const row of rows) {
    const cells = new Array<string>(anchors.length).fill('');
    let filledCols = 0;
    for (const run of row) {
      // Snap each run to its nearest column anchor at/left of its x.
      let col = 0;
      for (let c = anchors.length - 1; c >= 0; c--) {
        if (run.x >= anchors[c]! - medianH) {
          col = c;
          break;
        }
      }
      cells[col] = cells[col] ? cells[col] + ' ' + run.text : run.text;
    }
    filledCols = cells.filter((c) => c.trim()).length;
    if (filledCols >= 2) multiColRows++;
    grid.push(cells);
  }

  if (multiColRows < 2) return [];
  const confidence = multiColRows / grid.length;
  // Trim leading/trailing rows that are entirely single-column (titles, notes).
  const trimmed = grid.filter((r) => r.filter((c) => c.trim()).length >= 1);
  return [{ page: page.page, rows: trimmed, confidence }];
}

export function tableToCsv(table: ExtractedTable): string {
  return table.rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

/** JSON as array of objects, using the first row as keys when it looks like a
 *  header (all cells non-empty); otherwise column indices. */
export function tableToJson(table: ExtractedTable): string {
  if (table.rows.length === 0) return '[]';
  const [first, ...rest] = table.rows;
  const headerLike = first!.every((c) => c.trim().length > 0);
  const keys = headerLike ? first!.map((c) => c.trim()) : first!.map((_, i) => `col${i + 1}`);
  const body = headerLike ? rest : table.rows;
  const objs = body.map((row) => {
    const o: Record<string, string> = {};
    keys.forEach((k, i) => {
      o[k || `col${i + 1}`] = (row[i] ?? '').trim();
    });
    return o;
  });
  return JSON.stringify(objs, null, 2);
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
