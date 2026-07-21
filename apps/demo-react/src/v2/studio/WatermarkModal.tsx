/**
 * Batch Watermark — stamp text across PDFs and images (single or tiled,
 * adjustable opacity / angle / colour), 100% in the browser. Logic in
 * watermark.ts. Download each or all as a zip.
 */
import { useCallback, useRef, useState } from 'react';
import { TkxButton, TkxInput, TkxCheckbox } from 'tekivex-ui';
import { t, useLang } from '../../i18n.js';
import { watermarkPdf, watermarkImage, type WatermarkOpts } from './watermark.js';
import { formatBytes } from './compress.js';
import { zipStore } from '../smart/zip.js';
import { downloadBytes, saveBlob } from '../smart/util.js';

type Kind = 'pdf' | 'image' | 'other';
interface Item { id: string; file: File; kind: Kind; status: 'idle' | 'working' | 'done' | 'error'; outBlob?: Blob; outName?: string; note?: string }

let uid = 0;
const kindOf = (f: File): Kind => (f.type === 'application/pdf' || /\.pdf$/i.test(f.name) ? 'pdf' : f.type.startsWith('image/') ? 'image' : 'other');
const baseName = (n: string) => n.replace(/\.[^.]+$/, '') || 'file';
const blobBytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

export function WatermarkModal({ onClose }: { onClose: () => void }) {
  const lang = useLang();
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState('CONFIDENTIAL');
  const [opacity, setOpacity] = useState(18);
  const [rotation, setRotation] = useState(45);
  const [color, setColor] = useState('#888888');
  const [tile, setTile] = useState(true);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const add = useCallback((files: FileList | File[]) => {
    setItems((cur) => [...cur, ...[...files].map((file) => ({ id: `w${uid++}`, file, kind: kindOf(file), status: 'idle' as const }))]);
  }, []);

  const opts = useCallback((): WatermarkOpts => ({ text, opacity: opacity / 100, rotation, color, tile }), [text, opacity, rotation, color, tile]);

  const run = useCallback(async () => {
    setBusy(true);
    const o = opts();
    try {
      for (const it of items) {
        if (it.status === 'done') continue;
        setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, status: 'working' } : x)));
        try {
          if (it.kind === 'pdf') {
            const out = await watermarkPdf(new Uint8Array(await it.file.arrayBuffer()), o);
            setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, status: 'done', outBlob: new Blob([out as unknown as BlobPart], { type: 'application/pdf' }), outName: `${baseName(it.file.name)}-watermarked.pdf` } : x)));
          } else if (it.kind === 'image') {
            const blob = await watermarkImage(it.file, o);
            const ext = /png/i.test(it.file.type) ? 'png' : 'jpg';
            setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, status: 'done', outBlob: blob, outName: `${baseName(it.file.name)}-watermarked.${ext}` } : x)));
          } else {
            setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, status: 'error', note: 'PDF or image only' } : x)));
          }
        } catch (e) { setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, status: 'error', note: e instanceof Error ? e.message : String(e) } : x))); }
      }
    } finally { setBusy(false); }
  }, [items, opts]);

  const downloadOne = (it: Item) => { if (it.outBlob && it.outName) void saveBlob(it.outName, it.outBlob); };
  const downloadAll = async () => {
    const done = items.filter((i) => i.status === 'done' && i.outBlob && i.outName);
    if (done.length === 1) { downloadOne(done[0]!); return; }
    const entries = await Promise.all(done.map(async (i) => ({ name: i.outName!, data: await blobBytes(i.outBlob!) })));
    downloadBytes('watermarked.zip', zipStore(entries), 'application/zip');
  };

  const doneCount = items.filter((i) => i.status === 'done' && i.outBlob).length;

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner cmp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>🅦 {t('m_watermark_title', lang)}</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <p className="studio-hint">{t('m_watermark_desc', lang)}</p>

          <div
            className={'cmp-drop' + (drag ? ' cmp-drop--over' : '')}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) add(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()} role="button" tabIndex={0}
          >
            <span className="cmp-drop-icon" aria-hidden>⬇</span>
            <span>{t('m_watermark_drop', lang)} <strong>{t('act_browse', lang)}</strong></span>
            <input ref={inputRef} type="file" multiple accept="application/pdf,image/*" style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.length) add(e.target.files); e.target.value = ''; }} />
          </div>

          <TkxInput className="ai-field" style={{ marginTop: 12 }} label={t('m_watermark_title', lang)} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. CONFIDENTIAL · DRAFT · your name" />
          <div className="cmp-controls">
            <label className="cmp-ctrl cmp-ctrl--wide"><span>{t('ctl_opacity', lang)} <strong>{opacity}%</strong></span><input type="range" min={5} max={60} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} /></label>
            <label className="cmp-ctrl cmp-ctrl--wide"><span>{t('ctl_angle', lang)} <strong>{rotation}°</strong></span><input type="range" min={-90} max={90} value={rotation} onChange={(e) => setRotation(Number(e.target.value))} /></label>
            <label className="cmp-ctrl">{t('ctl_colour', lang)}<input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 44, height: 30, padding: 0, border: 'none', background: 'none' }} /></label>
            <TkxCheckbox className="cmp-row-note" label={t('ctl_tile', lang)} checked={tile} onChange={(e) => setTile(e.target.checked)} />
          </div>

          {items.length > 0 && (
            <div className="cmp-list">
              {items.map((it) => (
                <div key={it.id} className={'cmp-row cmp-row--' + it.status}>
                  <span className="cmp-row-ico" aria-hidden>{it.kind === 'pdf' ? '📕' : it.kind === 'image' ? '🖼' : '📄'}</span>
                  <span className="cmp-row-name" title={it.file.name}>{it.file.name}</span>
                  <span className="cmp-row-size">{formatBytes(it.file.size)}</span>
                  {it.status === 'done' && <span className="cmp-row-badge">stamped</span>}
                  {it.status === 'working' && <span className="cmp-row-note">stamping…</span>}
                  {it.status === 'error' && <span className="cmp-row-note cmp-row-note--warn">{it.note}</span>}
                  <span className="cmp-row-actions">
                    {it.status === 'done' && <button className="cmp-row-dl" onClick={() => downloadOne(it)} title="Download">⤓</button>}
                    <button className="cmp-row-x" onClick={() => setItems((cur) => cur.filter((x) => x.id !== it.id))} aria-label="Remove" title="Remove">✕</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="resume-foot">
          <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy || items.length === 0 || !text.trim()} onClick={() => void run()}>{busy ? 'Stamping…' : t('m_watermark_apply', lang)}</TkxButton>
          <TkxButton variant="outline" size="sm" disabled={doneCount === 0} onClick={() => void downloadAll()}>⤓ {t('act_download', lang)} {doneCount > 1 ? 'all (zip)' : ''}</TkxButton>
          <TkxButton variant="ghost" size="sm" onClick={onClose}>{t('act_close', lang)}</TkxButton>
        </div>
      </div>
    </div>
  );
}
