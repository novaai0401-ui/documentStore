/**
 * OCR for image-only ("scanned") PDFs.
 *
 * Digital PDFs carry a text layer that pdf.js exposes directly (see
 * pdfText.ts). Pure scans don't — the page is just a picture of text, so
 * there is nothing to click into and edit, and nothing for the AI to read.
 * This module renders a page to a canvas and runs Tesseract over it to
 * recover line-level text with bounding boxes, which we feed back into the
 * same TextRun cache that powers Word-like editing and AI context.
 *
 * Tesseract is loaded lazily (dynamic import) so its wasm core never lands
 * in the initial bundle — it's only fetched the first time a user OCRs a
 * page. The worker is a session singleton.
 */
import type { TextRun } from './pdfText.js';

// Minimal structural types — we avoid importing tesseract.js types at the
// top level so the dependency stays fully dynamic.
interface Bbox { x0: number; y0: number; x1: number; y1: number }
interface OcrLine { text: string; bbox: Bbox }
interface OcrBlock { paragraphs?: Array<{ lines?: OcrLine[] }> }
interface OcrWorker {
  recognize: (
    image: HTMLCanvasElement | OffscreenCanvas,
    options?: unknown,
    output?: Record<string, boolean>,
  ) => Promise<{ data: { text: string; blocks?: OcrBlock[] | null } }>;
}

/**
 * Where Tesseract loads its worker script, wasm core, and language model.
 * Unset → tesseract.js defaults (jsDelivr CDN), which is fine for the demo.
 * For offline / air-gapped / enterprise deployments, self-host the assets and
 * point these at your own origin (same pattern as self-hosting the pdf.js
 * worker). Call `configureOcr({...})` once at startup, before any OCR.
 */
export interface OcrAssetConfig {
  /** Tesseract worker script URL (tesseract.js `worker.min.js`). */
  workerPath?: string;
  /** Tesseract wasm core directory or file URL (tesseract-core). */
  corePath?: string;
  /** Directory holding `<lang>.traineddata(.gz)` models. */
  langPath?: string;
  /** Language code(s), default 'eng'. */
  language?: string;
}

let ocrConfig: OcrAssetConfig = {};

export function configureOcr(cfg: OcrAssetConfig): void {
  ocrConfig = { ...ocrConfig, ...cfg };
  // A language change must rebuild the worker (it's loaded with its models).
  if (cfg.language !== undefined && cfg.language !== loadedLang) workerPromise = null;
}

/** Recognition languages offered in the UI. Tesseract combines them with '+'
 *  (e.g. 'eng+spa'); the first run downloads each chosen model. */
export const OCR_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'eng', label: 'English' },
  { code: 'spa', label: 'Spanish' },
  { code: 'fra', label: 'French' },
  { code: 'deu', label: 'German' },
  { code: 'ita', label: 'Italian' },
  { code: 'por', label: 'Portuguese' },
  { code: 'nld', label: 'Dutch' },
  { code: 'rus', label: 'Russian' },
  { code: 'ara', label: 'Arabic' },
  { code: 'hin', label: 'Hindi' },
  { code: 'chi_sim', label: 'Chinese (Simplified)' },
  { code: 'jpn', label: 'Japanese' },
  { code: 'kor', label: 'Korean' },
];

/** Set the OCR recognition language(s), e.g. "eng" or "eng+spa". Rebuilds the
 *  worker on the next OCR if the language changed. */
export function setOcrLanguage(language: string): void {
  if (language && language !== ocrConfig.language) {
    ocrConfig.language = language;
    if (language !== loadedLang) workerPromise = null;
  }
}

let workerPromise: Promise<OcrWorker> | null = null;
/** Language the live worker was built with (for change detection). */
let loadedLang = '';

async function getWorker(): Promise<OcrWorker> {
  if (!workerPromise) {
    const lang = ocrConfig.language ?? 'eng';
    loadedLang = lang;
    workerPromise = import('tesseract.js').then((m) => {
      const opts: Record<string, string> = {};
      if (ocrConfig.workerPath) opts.workerPath = ocrConfig.workerPath;
      if (ocrConfig.corePath) opts.corePath = ocrConfig.corePath;
      if (ocrConfig.langPath) opts.langPath = ocrConfig.langPath;
      const create = m.createWorker as (
        lang: string,
        oem?: number,
        options?: Record<string, string>,
      ) => Promise<OcrWorker>;
      return create(lang, undefined, Object.keys(opts).length ? opts : undefined);
    });
  }
  return workerPromise;
}

/** True once OCR has been attempted at least once (so the UI can warn that
 *  the first run downloads the language model). */
export function ocrEngineLoaded(): boolean {
  return workerPromise !== null;
}

/**
 * OCR a rendered page canvas into line-runs, normalized to scale = 1 CSS px
 * (top-left origin) so they slot straight into the TextRun cache. `ocrScale`
 * is the scale the canvas was rendered at relative to the page's scale-1
 * viewport — we divide bboxes by it to get back to scale-1 coordinates.
 */
export async function ocrCanvasToRuns(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  ocrScale: number,
): Promise<TextRun[]> {
  const worker = await getWorker();
  const { data } = await worker.recognize(canvas, undefined, { text: true, blocks: true });

  const lines: OcrLine[] = [];
  for (const block of data.blocks ?? []) {
    for (const par of block.paragraphs ?? []) {
      for (const ln of par.lines ?? []) lines.push(ln);
    }
  }

  const runs: TextRun[] = [];
  for (const ln of lines) {
    const text = (ln.text ?? '').replace(/\s+/g, ' ').trim();
    if (!text || !ln.bbox) continue;
    const x = ln.bbox.x0 / ocrScale;
    const y = ln.bbox.y0 / ocrScale;
    const width = (ln.bbox.x1 - ln.bbox.x0) / ocrScale;
    const height = (ln.bbox.y1 - ln.bbox.y0) / ocrScale;
    runs.push({
      text,
      x,
      y,
      width,
      // Bbox height spans ascenders→descenders; ~0.8 of it approximates the
      // visible cap height / font size for redraw-on-save sizing.
      height,
      fontSize: Math.max(8, height * 0.8),
    });
  }
  return runs;
}
