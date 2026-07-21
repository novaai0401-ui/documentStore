/**
 * Universal Compressor — shrink images, PDFs (and route video to the Video
 * Studio) in a single batch, 100% in the browser. Quality slider + format +
 * max-dimension controls, live before→after sizes with a "% saved" badge, and
 * download-each or download-all-as-zip. Logic in compress.ts; PDFs reuse
 * smart/optimize.compressPdf.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { TkxButton, TkxSelect, TkxInput } from 'tekivex-ui';
import { t, useLang } from '../../i18n.js';
import {
  compressImage, compressImageToTarget, isCompressibleImage, formatBytes, percentSaved,
  type OutFormat,
} from './compress.js';
import { compressPdf } from '../smart/optimize.js';
import { zipStore } from '../smart/zip.js';
import { downloadBytes, saveBlob } from '../smart/util.js';

type Kind = 'image' | 'pdf' | 'video' | 'other';
interface Item {
  id: string;
  file: File;
  kind: Kind;
  origSize: number;
  status: 'idle' | 'working' | 'done' | 'skip' | 'error';
  outBlob?: Blob;
  outName?: string;
  outSize?: number;
  note?: string;
}

let uid = 0;
const kindOf = (f: File): Kind => {
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) return 'pdf';
  if (isCompressibleImage(f.type, f.name)) return 'image';
  if (f.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(f.name)) return 'video';
  return 'other';
};
const baseName = (n: string) => n.replace(/\.[^.]+$/, '') || 'file';
const blobBytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

// Quality slider → PDF rasterise DPI (image-heavy PDFs) by the size cap chosen.
const dpiForCap = (cap: number) => (cap === 0 || cap >= 4000 ? 150 : cap >= 2000 ? 120 : 96);

export function CompressModal({ onClose, onOpenVideo }: { onClose: () => void; onOpenVideo?: (file: File) => void }) {
  const lang = useLang();
  const [items, setItems] = useState<Item[]>([]);
  const [quality, setQuality] = useState(70);        // %
  const [format, setFormat] = useState<OutFormat>('keep');
  const [maxDim, setMaxDim] = useState(0);           // 0 = original
  const [mode, setMode] = useState<'quality' | 'target'>('quality');
  const [targetKb, setTargetKb] = useState(200);     // target size in KB
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const add = useCallback((files: FileList | File[]) => {
    const next: Item[] = [...files].map((file) => ({ id: `c${uid++}`, file, kind: kindOf(file), origSize: file.size, status: 'idle' as const }));
    setItems((cur) => [...cur, ...next]);
  }, []);

  const compressOne = useCallback(async (it: Item, q: number, fmt: OutFormat, cap: number): Promise<Item> => {
    try {
      if (it.kind === 'image') {
        const out = mode === 'target'
          ? await compressImageToTarget(it.file, { format: fmt, targetBytes: targetKb * 1024, maxDimension: cap })
          : await compressImage(it.file, { format: fmt, quality: q / 100, maxDimension: cap });
        const name = `${baseName(it.file.name)}.${out.ext}`;
        // If we somehow made it bigger (e.g. re-encoding an already-tiny PNG), keep the original.
        if (out.blob.size >= it.origSize) return { ...it, status: 'done', outBlob: it.file, outName: it.file.name, outSize: it.origSize, note: 'already optimal — kept original' };
        const hitTarget = mode === 'target' ? (out.blob.size <= targetKb * 1024 ? ' · ✓ target' : ' · smallest possible') : '';
        return { ...it, status: 'done', outBlob: out.blob, outName: name, outSize: out.blob.size, note: `${out.width}×${out.height} · ${out.mime.split('/')[1]!.toUpperCase()}${hitTarget}` };
      }
      if (it.kind === 'pdf') {
        const bytes = new Uint8Array(await it.file.arrayBuffer());
        const r = await compressPdf(bytes, { dpi: dpiForCap(cap), quality: q / 100 });
        if (r.newSize >= r.originalSize) return { ...it, status: 'done', outBlob: new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }), outName: it.file.name, outSize: r.originalSize, note: 'already optimal — kept original' };
        return { ...it, status: 'done', outBlob: new Blob([r.bytes as unknown as BlobPart], { type: 'application/pdf' }), outName: `${baseName(it.file.name)}.pdf`, outSize: r.newSize, note: `${r.pageCount} page${r.pageCount === 1 ? '' : 's'}` };
      }
      if (it.kind === 'video') return { ...it, status: 'skip', note: 'open in Video Studio to compress' };
      return { ...it, status: 'skip', note: 'unsupported type' };
    } catch (e) {
      return { ...it, status: 'error', note: e instanceof Error ? e.message : String(e) };
    }
  }, [mode, targetKb]);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      // Process sequentially so the UI stays responsive and memory stays bounded.
      for (const it of items) {
        if (it.status === 'done') continue;
        setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, status: 'working' } : x)));
        const done = await compressOne(it, quality, format, maxDim);
        setItems((cur) => cur.map((x) => (x.id === it.id ? done : x)));
      }
    } finally {
      setBusy(false);
    }
  }, [items, quality, format, maxDim, compressOne]);

  const downloadOne = (it: Item) => { if (it.outBlob && it.outName) void saveBlob(it.outName, it.outBlob); };
  const downloadAll = async () => {
    const done = items.filter((i) => i.status === 'done' && i.outBlob && i.outName);
    if (done.length === 1) { downloadOne(done[0]!); return; }
    const entries = await Promise.all(done.map(async (i) => ({ name: i.outName!, data: await blobBytes(i.outBlob!) })));
    downloadBytes('compressed.zip', zipStore(entries), 'application/zip');
  };

  const totals = useMemo(() => {
    const done = items.filter((i) => i.status === 'done');
    const orig = done.reduce((s, i) => s + i.origSize, 0);
    const out = done.reduce((s, i) => s + (i.outSize ?? i.origSize), 0);
    return { count: done.length, orig, out, saved: percentSaved(orig, out) };
  }, [items]);

  const compressible = items.some((i) => i.kind === 'image' || i.kind === 'pdf');

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner cmp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>🗜️ {t('m_compress_title', lang)}</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <p className="studio-hint">{t('m_compress_desc', lang)}</p>

          <div
            className={'cmp-drop' + (drag ? ' cmp-drop--over' : '')}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) add(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
          >
            <span className="cmp-drop-icon" aria-hidden>⬇</span>
            <span>{t('m_compress_drop', lang)} <strong>{t('act_browse', lang)}</strong></span>
            <input ref={inputRef} type="file" multiple accept="image/*,application/pdf,video/*" style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.length) add(e.target.files); e.target.value = ''; }} />
          </div>

          <div className="cmp-controls">
            <label className="cmp-ctrl">{t('ctl_mode', lang)}
              <TkxSelect size="sm" value={mode} options={[{ value: 'quality', label: 'By quality' }, { value: 'target', label: 'Target size' }]} onChange={(v) => setMode(v as 'quality' | 'target')} />
            </label>
            {mode === 'quality' ? (
              <label className="cmp-ctrl cmp-ctrl--wide">
                <span>{t('ctl_quality', lang)} <strong>{quality}%</strong></span>
                <input type="range" min={20} max={95} value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
              </label>
            ) : (
              <div className="cmp-ctrl">
                <span className="cmp-target-input"><TkxInput label="Target size" type="number" min={10} max={20000} value={targetKb} onChange={(e) => setTargetKb(Math.max(10, Number(e.target.value) || 10))} /> KB</span>
              </div>
            )}
            <label className="cmp-ctrl">{t('ctl_format', lang)}
              <TkxSelect size="sm" value={format} options={[
                { value: 'keep', label: 'Keep format' },
                { value: 'jpeg', label: 'JPEG' },
                { value: 'webp', label: 'WebP (smaller)' },
                { value: 'avif', label: 'AVIF (smallest)' },
                { value: 'png', label: 'PNG (lossless)' },
              ]} onChange={(v) => setFormat(v as OutFormat)} />
            </label>
            <label className="cmp-ctrl">{t('ctl_maxsize', lang)}
              <TkxSelect size="sm" value={String(maxDim)} options={[
                { value: '0', label: 'Original' },
                { value: '4000', label: '4000 px' },
                { value: '2000', label: '2000 px' },
                { value: '1280', label: '1280 px' },
                { value: '1024', label: '1024 px' },
              ]} onChange={(v) => setMaxDim(Number(v))} />
            </label>
          </div>

          {items.length > 0 && (
            <div className="cmp-list">
              {items.map((it) => (
                <div key={it.id} className={'cmp-row cmp-row--' + it.status}>
                  <span className="cmp-row-ico" aria-hidden>{it.kind === 'pdf' ? '📕' : it.kind === 'image' ? '🖼' : it.kind === 'video' ? '🎬' : '📄'}</span>
                  <span className="cmp-row-name" title={it.file.name}>{it.file.name}</span>
                  <span className="cmp-row-size">
                    {formatBytes(it.origSize)}
                    {it.status === 'done' && it.outSize != null && <> → <strong>{formatBytes(it.outSize)}</strong></>}
                  </span>
                  {it.status === 'done' && it.outSize != null && it.outSize < it.origSize && (
                    <span className="cmp-row-badge">−{percentSaved(it.origSize, it.outSize)}%</span>
                  )}
                  {it.status === 'working' && <span className="cmp-row-note">compressing…</span>}
                  {(it.status === 'skip' || it.status === 'error') && <span className="cmp-row-note cmp-row-note--warn">{it.note}</span>}
                  {it.status === 'done' && it.note && <span className="cmp-row-note">{it.note}</span>}
                  <span className="cmp-row-actions">
                    {it.status === 'done' && <button className="cmp-row-dl" onClick={() => downloadOne(it)} title="Download">⤓</button>}
                    {it.kind === 'video' && onOpenVideo && <button className="cmp-row-dl" onClick={() => onOpenVideo(it.file)} title="Open in Video Studio">🎬</button>}
                    <button className="cmp-row-x" onClick={() => setItems((cur) => cur.filter((x) => x.id !== it.id))} aria-label="Remove" title="Remove">✕</button>
                  </span>
                </div>
              ))}
            </div>
          )}

          {totals.count > 0 && (
            <div className="cmp-total">
              Compressed <strong>{totals.count}</strong> file{totals.count === 1 ? '' : 's'}: {formatBytes(totals.orig)} → <strong>{formatBytes(totals.out)}</strong>
              {totals.saved > 0 && <span className="cmp-total-badge">saved {totals.saved}%</span>}
            </div>
          )}
        </div>
        <div className="resume-foot">
          <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy || !compressible} onClick={() => void run()}>{busy ? 'Compressing…' : t('m_compress_run', lang)}</TkxButton>
          <TkxButton variant="outline" size="sm" disabled={totals.count === 0} onClick={() => void downloadAll()}>⤓ {t('act_download', lang)} {totals.count > 1 ? 'all (zip)' : ''}</TkxButton>
          <TkxButton variant="ghost" size="sm" onClick={onClose}>{t('act_close', lang)}</TkxButton>
        </div>
      </div>
    </div>
  );
}
