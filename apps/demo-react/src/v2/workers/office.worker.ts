/**
 * Web Worker that builds office documents off the main thread. The editors post
 * a job ({ id, kind, payload }); the worker runs the matching pure builder and
 * posts back the resulting bytes (transferred, not copied). Keeping the heavy
 * SheetJS/zip work here means a big spreadsheet or deck export never janks the
 * UI. The builders are DOM-free by construction (see officeBuild.ts).
 */
import { buildXlsxBytes, buildPptxBytes, type SheetInput, type Slide, type PptxTheme } from '../smart/officeBuild.js';

export type OfficeJob =
  | { id: number; kind: 'xlsx'; payload: { sheets: SheetInput[] } }
  | { id: number; kind: 'pptx'; payload: { slides: Slide[]; theme?: PptxTheme } };

export type OfficeReply =
  | { id: number; result: Uint8Array }
  | { id: number; error: string };

self.onmessage = async (e: MessageEvent<OfficeJob>) => {
  const job = e.data;
  try {
    const result = job.kind === 'xlsx'
      ? await buildXlsxBytes(job.payload.sheets)
      : buildPptxBytes(job.payload.slides, job.payload.theme);
    (self as unknown as Worker).postMessage({ id: job.id, result } satisfies OfficeReply, [result.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: job.id, error: err instanceof Error ? err.message : String(err) } satisfies OfficeReply);
  }
};
