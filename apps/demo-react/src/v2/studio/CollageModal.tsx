/**
 * Photo Collage — drop several photos, arrange them in a grid, and download a
 * single image. 100% in the browser via Canvas; layout helpers in collage.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TkxButton, TkxSelect } from 'tekivex-ui';
import { t, useLang } from '../../i18n.js';
import { autoColumns, coverCrop, presetCells, COLLAGE_PRESETS, type CollagePreset } from './collage.js';

interface Photo { id: string; src: string }
let uid = 0;
const RATIOS: Record<string, { w: number; h: number }> = {
  square: { w: 1200, h: 1200 }, portrait: { w: 1080, h: 1350 }, landscape: { w: 1350, h: 1080 }, story: { w: 1080, h: 1920 },
};

export function CollageModal({ onClose }: { onClose: () => void }) {
  const lang = useLang();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [preset, setPreset] = useState<CollagePreset>('grid');
  const [cols, setCols] = useState(0);   // 0 = auto
  const [gap, setGap] = useState(16);
  const [bg, setBg] = useState('#ffffff');
  const [ratio, setRatio] = useState('square');
  const [radius, setRadius] = useState(12);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const add = useCallback((files: FileList | File[]) => {
    for (const f of files) { if (!f.type.startsWith('image/')) continue; const rd = new FileReader(); rd.onload = () => setPhotos((p) => [...p, { id: `g${uid++}`, src: String(rd.result) }]); rd.readAsDataURL(f); }
  }, []);

  const effectiveCols = cols || autoColumns(photos.length || 1);
  const size = RATIOS[ratio]!;

  const render = useCallback(async () => {
    if (!photos.length) { setPreview(null); return; }
    const canvas = canvasRef.current ?? document.createElement('canvas');
    canvas.width = size.w; canvas.height = size.h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, size.w, size.h);
    const cells = presetCells(preset, photos.length, size.w, size.h, gap, effectiveCols);
    const imgs = await Promise.all(photos.map((p) => new Promise<HTMLImageElement>((res) => { const im = new Image(); im.onload = () => res(im); im.src = p.src; })));
    imgs.forEach((im, i) => {
      const cell = cells[i]!; if (!cell || cell.w <= 0 || cell.h <= 0) return;
      const { sx, sy, sw, sh } = coverCrop(im.naturalWidth, im.naturalHeight, cell.w, cell.h);
      ctx.save();
      // rounded clip
      const r = Math.min(radius, cell.w / 2, cell.h / 2);
      ctx.beginPath();
      ctx.moveTo(cell.x + r, cell.y);
      ctx.arcTo(cell.x + cell.w, cell.y, cell.x + cell.w, cell.y + cell.h, r);
      ctx.arcTo(cell.x + cell.w, cell.y + cell.h, cell.x, cell.y + cell.h, r);
      ctx.arcTo(cell.x, cell.y + cell.h, cell.x, cell.y, r);
      ctx.arcTo(cell.x, cell.y, cell.x + cell.w, cell.y, r);
      ctx.closePath(); ctx.clip();
      ctx.drawImage(im, sx, sy, sw, sh, cell.x, cell.y, cell.w, cell.h);
      ctx.restore();
    });
    setPreview(canvas.toDataURL('image/png'));
  }, [photos, preset, effectiveCols, gap, bg, size, radius]);

  useEffect(() => { void render(); }, [render]);

  const download = async () => {
    if (!preview) return;
    setBusy(true);
    try { const { saveBlob } = await import('../smart/util.js'); await saveBlob('collage.png', await (await fetch(preview)).blob()); }
    finally { setBusy(false); }
  };

  const downloadPdf = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const { PDFDocument } = await import('pdf-lib');
      const png = new Uint8Array(await (await fetch(preview)).arrayBuffer());
      const pdf = await PDFDocument.create();
      const img = await pdf.embedPng(png);
      const page = pdf.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      const { downloadBytes } = await import('../smart/util.js');
      downloadBytes('collage.pdf', await pdf.save(), 'application/pdf');
    } finally { setBusy(false); }
  };

  const move = (i: number, d: -1 | 1) => setPhotos((p) => { const n = p.slice(); const j = i + d; if (j < 0 || j >= n.length) return p; [n[i], n[j]] = [n[j]!, n[i]!]; return n; });
  // Drag-to-reorder: pull the dragged photo out and insert it at the drop index.
  const reorder = (from: number, to: number) => setPhotos((p) => { if (from === to || from < 0 || to < 0 || from >= p.length || to >= p.length) return p; const n = p.slice(); const [it] = n.splice(from, 1); n.splice(to, 0, it!); return n; });
  const remove = (id: string) => setPhotos((p) => p.filter((x) => x.id !== id));

  const ratioOpts = useMemo(() => [{ value: 'square', label: 'Square 1:1' }, { value: 'portrait', label: 'Portrait 4:5' }, { value: 'landscape', label: 'Landscape 5:4' }, { value: 'story', label: 'Story 9:16' }], []);

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner cmp-modal vid-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>🖼 {t('m_collage_title', lang)}</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <p className="studio-hint">{t('m_collage_desc', lang)}</p>

          <div
            className={'cmp-drop' + (drag ? ' cmp-drop--over' : '')}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) add(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()} role="button" tabIndex={0}
          >
            <span className="cmp-drop-icon" aria-hidden>⬇</span>
            <span>{t('m_collage_drop', lang)} <strong>{t('act_browse', lang)}</strong></span>
            <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.length) add(e.target.files); e.target.value = ''; }} />
          </div>

          {photos.length > 0 && (
            <>
              <div className="cmp-controls">
                <label className="cmp-ctrl">Layout<TkxSelect size="sm" value={preset} options={COLLAGE_PRESETS} onChange={(v) => setPreset(v as CollagePreset)} /></label>
                <label className="cmp-ctrl">Shape<TkxSelect size="sm" value={ratio} options={ratioOpts} onChange={(v) => setRatio(v as string)} /></label>
                {preset === 'grid' && <label className="cmp-ctrl">Columns<TkxSelect size="sm" value={String(cols)} options={[{ value: '0', label: 'Auto' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }]} onChange={(v) => setCols(Number(v))} /></label>}
                <label className="cmp-ctrl cmp-ctrl--wide"><span>{t('ctl_spacing', lang)} <strong>{gap}px</strong></span><input type="range" min={0} max={48} value={gap} onChange={(e) => setGap(Number(e.target.value))} /></label>
                <label className="cmp-ctrl cmp-ctrl--wide"><span>{t('ctl_rounding', lang)} <strong>{radius}px</strong></span><input type="range" min={0} max={60} value={radius} onChange={(e) => setRadius(Number(e.target.value))} /></label>
                <label className="cmp-ctrl">Background<input type="color" value={bg} onChange={(e) => setBg(e.target.value)} style={{ width: 44, height: 30, padding: 0, border: 'none', background: 'none' }} /></label>
              </div>

              <div className="clg-strip">
                {photos.map((p, i) => (
                  <div
                    key={p.id}
                    className={'clg-thumb' + (dragIdx === i ? ' clg-thumb--dragging' : '') + (overIdx === i && dragIdx !== null && dragIdx !== i ? ' clg-thumb--over' : '')}
                    draggable
                    onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragOver={(e) => { e.preventDefault(); if (overIdx !== i) setOverIdx(i); }}
                    onDrop={(e) => { e.preventDefault(); if (dragIdx !== null) reorder(dragIdx, i); setDragIdx(null); setOverIdx(null); }}
                    onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                    title="Drag to reorder"
                  >
                    <img src={p.src} alt={`Photo ${i + 1}`} draggable={false} />
                    <div className="clg-thumb-tools">
                      <button onClick={() => move(i, -1)} disabled={i === 0} title="Move left">←</button>
                      <button onClick={() => move(i, 1)} disabled={i === photos.length - 1} title="Move right">→</button>
                      <button onClick={() => remove(p.id)} title="Remove">✕</button>
                    </div>
                  </div>
                ))}
              </div>

              {preview && <div className="vid-result"><img className="scan-video" src={preview} alt="Collage preview" /></div>}
            </>
          )}
        </div>
        <div className="resume-foot">
          <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy || !preview} onClick={() => void download()}>⤓ {t('act_download_png', lang)}</TkxButton>
          <TkxButton variant="outline" size="sm" disabled={busy || !preview} onClick={() => void downloadPdf()}>⤓ PDF</TkxButton>
          <TkxButton variant="ghost" size="sm" onClick={onClose}>{t('act_close', lang)}</TkxButton>
        </div>
      </div>
    </div>
  );
}
