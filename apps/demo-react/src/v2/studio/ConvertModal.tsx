/**
 * Universal Converter — convert images between formats (incl. HEIC→JPG, the
 * every-iPhone-photo case) and combine images into a PDF, 100% in the browser.
 * Logic in convertFiles.ts; image→PDF reuses smart/convert.imagesToPdf.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { TkxButton, TkxSelect } from 'tekivex-ui';
import { t, useLang } from '../../i18n.js';
import { convertImage, isConvertibleImage, isHeic, IMG_TARGETS, type ImgTarget } from './convertFiles.js';
import { formatBytes } from './compress.js';
import { zipStore } from '../smart/zip.js';
import { downloadBytes, saveBlob } from '../smart/util.js';

type Target = ImgTarget | 'pdf';
interface Item { id: string; file: File; status: 'idle' | 'working' | 'done' | 'error'; outBlob?: Blob; outName?: string; note?: string }

let uid = 0;
const baseName = (n: string) => n.replace(/\.[^.]+$/, '') || 'image';
const blobBytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

export function ConvertModal({ onClose }: { onClose: () => void }) {
  const lang = useLang();
  const [items, setItems] = useState<Item[]>([]);
  const [target, setTarget] = useState<Target>('jpeg');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const folderRef = useRef<HTMLInputElement | null>(null);
  // webkitdirectory isn't a standard React prop; set it on the input directly.
  useEffect(() => { if (folderRef.current) { folderRef.current.setAttribute('webkitdirectory', ''); folderRef.current.setAttribute('directory', ''); } }, []);

  const add = useCallback((files: FileList | File[]) => {
    const next = [...files].filter((f) => isConvertibleImage(f.type, f.name)).map((file) => ({ id: `v${uid++}`, file, status: 'idle' as const }));
    const rejected = [...files].length - next.length;
    setItems((cur) => [...cur, ...next]);
    if (rejected > 0 && next.length === 0) setItems((cur) => [...cur, { id: `v${uid++}`, file: [...files][0]!, status: 'error', note: 'not a convertible image' }]);
  }, []);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      if (target === 'pdf') {
        // Combine all images into a single PDF (HEIC decoded first).
        const { imagesToPdf, toEmbeddableImage } = await import('../smart/convert.js');
        const imgs = [];
        for (const it of items) {
          setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, status: 'working' } : x)));
          try {
            let blob: Blob = it.file;
            let mime = it.file.type || 'image/jpeg';
            if (isHeic(it.file.type, it.file.name)) { const png = await convertImage(it.file, { target: 'png' }); blob = png.blob; mime = 'image/png'; }
            const emb = await toEmbeddableImage(new Uint8Array(await blob.arrayBuffer()), (mime.split('/')[1] || 'jpeg'), mime);
            if (emb) imgs.push(emb);
            setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, status: 'done' } : x)));
          } catch (e) { setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, status: 'error', note: e instanceof Error ? e.message : String(e) } : x))); }
        }
        if (imgs.length) { const { bytes } = await imagesToPdf(imgs); downloadBytes('converted.pdf', bytes, 'application/pdf'); }
        return;
      }
      for (const it of items) {
        if (it.status === 'done') continue;
        setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, status: 'working' } : x)));
        try {
          const out = await convertImage(it.file, { target });
          setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, status: 'done', outBlob: out.blob, outName: `${baseName(it.file.name)}.${out.ext}`, note: `${out.width}×${out.height}` } : x)));
        } catch (e) { setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, status: 'error', note: e instanceof Error ? e.message : String(e) } : x))); }
      }
    } finally { setBusy(false); }
  }, [items, target]);

  const downloadOne = (it: Item) => { if (it.outBlob && it.outName) void saveBlob(it.outName, it.outBlob); };
  const downloadAll = async () => {
    const done = items.filter((i) => i.status === 'done' && i.outBlob && i.outName);
    if (done.length === 1) { downloadOne(done[0]!); return; }
    const entries = await Promise.all(done.map(async (i) => ({ name: i.outName!, data: await blobBytes(i.outBlob!) })));
    downloadBytes('converted.zip', zipStore(entries), 'application/zip');
  };

  const doneCount = items.filter((i) => i.status === 'done' && i.outBlob).length;
  const hasHeic = items.some((i) => isHeic(i.file.type, i.file.name));

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner cmp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>🔄 {t('m_convert_title', lang)}</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <p className="studio-hint">{t('m_convert_desc', lang)}</p>

          <div
            className={'cmp-drop' + (drag ? ' cmp-drop--over' : '')}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) add(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            role="button" tabIndex={0}
          >
            <span className="cmp-drop-icon" aria-hidden>⬇</span>
            <span>{t('m_convert_drop', lang)} <strong>{t('act_browse', lang)}</strong>, or <button type="button" className="cmp-link-btn" onClick={(e) => { e.stopPropagation(); folderRef.current?.click(); }}>{t('act_add_folder', lang)}</button></span>
            <input ref={inputRef} type="file" multiple accept="image/*,.heic,.heif" style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.length) add(e.target.files); e.target.value = ''; }} />
            <input ref={folderRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.length) add(e.target.files); e.target.value = ''; }} />
          </div>

          <div className="cmp-controls">
            <label className="cmp-ctrl">Convert to
              <TkxSelect size="sm" value={target} options={[
                ...IMG_TARGETS.map((t) => ({ value: t, label: t === 'jpeg' ? 'JPG' : t.toUpperCase() })),
                { value: 'pdf', label: 'PDF (combine)' },
              ]} onChange={(v) => setTarget(v as Target)} />
            </label>
            {hasHeic && <span className="cmp-row-note">HEIC will be decoded locally first.</span>}
          </div>

          {items.length > 0 && (
            <div className="cmp-list">
              {items.map((it) => (
                <div key={it.id} className={'cmp-row cmp-row--' + it.status}>
                  <span className="cmp-row-ico" aria-hidden>{isHeic(it.file.type, it.file.name) ? '📱' : '🖼'}</span>
                  <span className="cmp-row-name" title={it.file.name}>{it.file.name}</span>
                  <span className="cmp-row-size">{formatBytes(it.file.size)}{it.status === 'done' && target !== 'pdf' && it.outBlob && <> → <strong>{formatBytes(it.outBlob.size)}</strong></>}</span>
                  {it.status === 'done' && <span className="cmp-row-badge">{target === 'pdf' ? 'added' : (target === 'jpeg' ? 'JPG' : target.toUpperCase())}</span>}
                  {it.status === 'working' && <span className="cmp-row-note">converting…</span>}
                  {it.status === 'error' && <span className="cmp-row-note cmp-row-note--warn">{it.note}</span>}
                  <span className="cmp-row-actions">
                    {it.status === 'done' && it.outBlob && <button className="cmp-row-dl" onClick={() => downloadOne(it)} title="Download">⤓</button>}
                    <button className="cmp-row-x" onClick={() => setItems((cur) => cur.filter((x) => x.id !== it.id))} aria-label="Remove" title="Remove">✕</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="resume-foot">
          <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy || items.length === 0} onClick={() => void run()}>{busy ? 'Converting…' : target === 'pdf' ? t('m_convert_pdf', lang) : `${t('act_convert_to', lang)} ${target === 'jpeg' ? 'JPG' : target.toUpperCase()}`}</TkxButton>
          {target !== 'pdf' && <TkxButton variant="outline" size="sm" disabled={doneCount === 0} onClick={() => void downloadAll()}>⤓ {t('act_download', lang)} {doneCount > 1 ? 'all (zip)' : ''}</TkxButton>}
          <TkxButton variant="ghost" size="sm" onClick={onClose}>{t('act_close', lang)}</TkxButton>
        </div>
      </div>
    </div>
  );
}
