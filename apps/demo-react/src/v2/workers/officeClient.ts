/**
 * Client for the office build worker. Editors call `buildXlsx` / `buildPptx` and
 * get bytes back; the heavy work runs off the main thread. Where Worker isn't
 * available (unit tests, SSR, or an environment that fails to spawn one) it
 * transparently falls back to running the same pure builder inline — so callers
 * never need to care, and the result is identical.
 */
import { buildXlsxBytes, buildPptxBytes, type SheetInput, type Slide, type PptxTheme } from '../smart/officeBuild.js';
import type { OfficeJob, OfficeReply } from './office.worker.js';

let worker: Worker | null = null;
let spawnFailed = false;
let seq = 0;
const pending = new Map<number, { resolve: (b: Uint8Array) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (spawnFailed || typeof Worker === 'undefined') return null;
  if (!worker) {
    try {
      worker = new Worker(new URL('./office.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<OfficeReply>) => {
        const p = pending.get(e.data.id);
        if (!p) return;
        pending.delete(e.data.id);
        if ('error' in e.data) p.reject(new Error(e.data.error));
        else p.resolve(e.data.result);
      };
      worker.onerror = () => { /* errors surface per-job via reply; nothing global to do */ };
    } catch {
      // Some environments forbid module workers — degrade to inline.
      spawnFailed = true;
      worker = null;
    }
  }
  return worker;
}

function offload(job: Omit<OfficeJob, 'id'>, inline: () => Promise<Uint8Array>): Promise<Uint8Array> {
  const w = getWorker();
  if (!w) return inline();
  const id = ++seq;
  return new Promise<Uint8Array>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, ...job } as OfficeJob);
  }).catch(() => inline()); // if the worker dies mid-job, fall back rather than fail the export
}

export function buildXlsx(sheets: SheetInput[]): Promise<Uint8Array> {
  return offload({ kind: 'xlsx', payload: { sheets } }, () => buildXlsxBytes(sheets));
}

export function buildPptx(slides: Slide[], theme?: PptxTheme): Promise<Uint8Array> {
  return offload({ kind: 'pptx', payload: { slides, theme } }, async () => buildPptxBytes(slides, theme));
}
