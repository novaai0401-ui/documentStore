/**
 * Pure, DOM-free office-document builders. They take plain data (sheet rows,
 * slide objects) and return file bytes with no reliance on `document`, canvas, or
 * any browser global — which is exactly what lets them run inside a Web Worker
 * (see office.worker.ts) so a large export doesn't freeze the UI. Being pure they
 * also run unchanged on the main thread (the worker's fallback) and under Node in
 * tests.
 */
import { pagesToPptx, type PptxTheme } from './pptxExport.js';
import type { Slide } from './convert.js';

export interface SheetInput { name: string; rows: string[][] }

/** Build an .xlsx workbook (all sheets) via SheetJS. */
export async function buildXlsxBytes(sheets: SheetInput[]): Promise<Uint8Array> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const sh of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sh.rows), (sh.name || 'Sheet').slice(0, 31));
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

/** Build a .pptx deck. (Thin wrapper so the worker has a single import surface.) */
export function buildPptxBytes(slides: Slide[], theme?: PptxTheme): Uint8Array {
  return pagesToPptx(slides, theme);
}

export type { Slide, PptxTheme };
