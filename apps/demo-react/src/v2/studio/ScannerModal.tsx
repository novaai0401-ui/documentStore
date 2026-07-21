/**
 * Document Scanner — capture pages from the device camera (or add photos),
 * enhance them like a scanner, reorder/rotate, and export a clean multi-page
 * PDF. 100% in the browser via getUserMedia + Canvas; PDF via imagesToPdf.
 * A private, no-upload replacement for CamScanner / the retiring MS Lens.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { TkxButton, TkxCheckbox, TkxSelect } from 'tekivex-ui';
import { t, useLang } from '../../i18n.js';
import { scanFilter, rotatedSize, moveItem, normalizeRotation, documentBounds, type ScanMode, type Bounds } from './scan.js';
import { warpToRect, outputSize, type Pt } from './perspective.js';
import { downloadBytes } from '../smart/util.js';

interface Page { id: string; src: string; rotation: number; corners?: Pt[] }
let uid = 0;

const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const el = new Image(); el.onload = () => res(el); el.onerror = () => rej(new Error('decode failed')); el.src = src; });

/** Full-resolution RGBA pixels for an image. */
function pixelsOf(img: HTMLImageElement): { data: Uint8ClampedArray; w: number; h: number } {
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const cx = c.getContext('2d', { willReadFrequently: true })!; cx.drawImage(img, 0, 0);
  const d = cx.getImageData(0, 0, c.width, c.height);
  return { data: d.data, w: c.width, h: c.height };
}

/** Detect the document rectangle and return TL,TR,BR,BL corners normalized to 0–1. */
export function detectCorners(img: HTMLImageElement): Pt[] {
  const SAMPLE = 400;
  const s = Math.min(1, SAMPLE / Math.max(img.naturalWidth, img.naturalHeight));
  const sw = Math.max(1, Math.round(img.naturalWidth * s)), sh = Math.max(1, Math.round(img.naturalHeight * s));
  const c = document.createElement('canvas'); c.width = sw; c.height = sh;
  const cx = c.getContext('2d', { willReadFrequently: true })!; cx.drawImage(img, 0, 0, sw, sh);
  const b: Bounds = documentBounds(cx.getImageData(0, 0, sw, sh).data, sw, sh);
  const x0 = b.x / sw, y0 = b.y / sh, x1 = (b.x + b.w) / sw, y1 = (b.y + b.h) / sh;
  // documentBounds is axis-aligned; if it returns the full frame, inset a touch so
  // the user has handles to drag onto the real (possibly skewed) corners.
  const full = b.x === 0 && b.y === 0 && b.w === sw && b.h === sh;
  const [a, bb] = full ? [0.06, 0.94] : [0, 1];
  const lerp = (lo: number, hi: number, t: number) => lo + (hi - lo) * t;
  const X0 = full ? a : x0, Y0 = full ? a : y0, X1 = full ? bb : x1, Y1 = full ? bb : y1;
  void lerp;
  return [{ x: X0, y: Y0 }, { x: X1, y: Y0 }, { x: X1, y: Y1 }, { x: X0, y: Y1 }];
}

// Render a page through optional dewarp / auto-crop + enhance + rotation to a JPEG.
async function renderPage(page: Page, mode: ScanMode, autoCrop: boolean): Promise<Uint8Array> {
  const img = await loadImg(page.src);
  const rot = normalizeRotation(page.rotation);

  // Source surface to enhance+rotate: either the perspective-dewarped quad, or
  // the original image (optionally auto-cropped to the detected document box).
  let source: CanvasImageSource;
  let baseW: number, baseH: number;
  if (page.corners) {
    const { data, w, h } = pixelsOf(img);
    const cpx = page.corners.map((c) => ({ x: c.x * w, y: c.y * h }));
    let { w: ow, h: oh } = outputSize(cpx);
    const cap = 2000; const k = Math.min(1, cap / Math.max(ow, oh)); // bound the warp loop
    ow = Math.max(1, Math.round(ow * k)); oh = Math.max(1, Math.round(oh * k));
    const warped = warpToRect(data, w, h, cpx, ow, oh);
    const tmp = document.createElement('canvas'); tmp.width = ow; tmp.height = oh;
    const tctx = tmp.getContext('2d')!;
    const id = tctx.createImageData(ow, oh); id.data.set(warped); tctx.putImageData(id, 0, 0);
    source = tmp; baseW = ow; baseH = oh;
  } else if (autoCrop) {
    const b = (() => { const { data, w, h } = sampleBounds(img); return { ...documentBounds(data, w, h), sw: w, sh: h }; })();
    const sx = (b.x / b.sw) * img.naturalWidth, sy = (b.y / b.sh) * img.naturalHeight;
    const cw = (b.w / b.sw) * img.naturalWidth, ch = (b.h / b.sh) * img.naturalHeight;
    const tmp = document.createElement('canvas'); tmp.width = Math.round(cw); tmp.height = Math.round(ch);
    tmp.getContext('2d')!.drawImage(img, sx, sy, cw, ch, 0, 0, tmp.width, tmp.height);
    source = tmp; baseW = tmp.width; baseH = tmp.height;
  } else { source = img; baseW = img.naturalWidth; baseH = img.naturalHeight; }

  const { w, h } = rotatedSize(baseW, baseH, rot);
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.filter = scanFilter(mode);
  ctx.translate(w / 2, h / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(source, -baseW / 2, -baseH / 2, baseW, baseH);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  return new Uint8Array(await (blob ?? new Blob()).arrayBuffer());
}

/** Downscaled RGBA sample for auto-crop bounds detection. */
function sampleBounds(img: HTMLImageElement): { data: Uint8ClampedArray; w: number; h: number } {
  const SAMPLE = 400; const s = Math.min(1, SAMPLE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true })!; cx.drawImage(img, 0, 0, w, h);
  return { data: cx.getImageData(0, 0, w, h).data, w, h };
}

export function ScannerModal({ onClose, onOpenInPdf }: { onClose: () => void; onOpenInPdf?: (bytes: Uint8Array, name: string) => void }) {
  const lang = useLang();
  const [pages, setPages] = useState<Page[]>([]);
  const [mode, setMode] = useState<ScanMode>('color');
  const [autoCrop, setAutoCrop] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const editingPage = pages.find((p) => p.id === editing) ?? null;
  const applyCorners = (corners: Pt[] | null) => { if (editing) setPages((p) => p.map((x) => (x.id === editing ? { ...x, corners: corners ?? undefined } : x))); setEditing(null); };
  const dewarpAll = useCallback(async () => {
    setBusy(true);
    try {
      const next = await Promise.all(pages.map(async (pg) => { try { return { ...pg, corners: detectCorners(await loadImg(pg.src)) }; } catch { return pg; } }));
      setPages(next);
    } finally { setBusy(false); }
  }, [pages]);
  const [camOn, setCamOn] = useState(false);
  const [camErr, setCamErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const captureRef = useRef<HTMLInputElement | null>(null);

  const stopCam = useCallback(() => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setCamOn(false); }, []);
  useEffect(() => () => stopCam(), [stopCam]);

  const startCam = useCallback(async () => {
    setCamErr(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCamErr('Live camera isn’t available here — use “Take photo” instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } }, audio: false });
      streamRef.current = stream;
      setCamOn(true);
      // Attach after the <video> mounts (camOn flips the render).
      requestAnimationFrame(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.muted = true; void videoRef.current.play().catch(() => {}); } });
    } catch {
      // iOS Safari frequently blocks getUserMedia (non-top frame, permissions, etc.) — the capture input always works.
      setCamErr('Live camera was blocked — tap “Take photo” to use your camera directly.');
    }
  }, []);

  const capture = useCallback(() => {
    const v = videoRef.current; if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth; canvas.height = v.videoHeight;
    canvas.getContext('2d')!.drawImage(v, 0, 0);
    setPages((p) => [...p, { id: `p${uid++}`, src: canvas.toDataURL('image/jpeg', 0.92), rotation: 0 }]);
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      const rd = new FileReader();
      rd.onload = () => setPages((p) => [...p, { id: `p${uid++}`, src: String(rd.result), rotation: 0 }]);
      rd.readAsDataURL(f);
    }
  }, []);

  const rotate = (id: string) => setPages((p) => p.map((x) => (x.id === id ? { ...x, rotation: normalizeRotation(x.rotation + 90) } : x)));
  const remove = (id: string) => setPages((p) => p.filter((x) => x.id !== id));
  const move = (i: number, d: -1 | 1) => setPages((p) => moveItem(p, i, i + d));

  const buildPdf = useCallback(async (): Promise<Uint8Array | null> => {
    if (!pages.length) return null;
    const { imagesToPdf, toEmbeddableImage } = await import('../smart/convert.js');
    const imgs = [];
    for (const pg of pages) {
      const jpeg = await renderPage(pg, mode, autoCrop);
      const emb = await toEmbeddableImage(jpeg, 'jpeg', 'image/jpeg');
      if (emb) imgs.push(emb);
    }
    if (!imgs.length) return null;
    return (await imagesToPdf(imgs)).bytes;
  }, [pages, mode, autoCrop]);

  const exportPdf = useCallback(async () => {
    setBusy(true);
    try { const bytes = await buildPdf(); if (bytes) downloadBytes('scan.pdf', bytes, 'application/pdf'); }
    finally { setBusy(false); }
  }, [buildPdf]);

  const editInPdf = useCallback(async () => {
    setBusy(true);
    try { const bytes = await buildPdf(); if (bytes && onOpenInPdf) { stopCam(); onClose(); onOpenInPdf(bytes, 'scan'); } }
    finally { setBusy(false); }
  }, [buildPdf, onOpenInPdf, onClose, stopCam]);

  return (
    <div className="v2-modal" onClick={() => { stopCam(); onClose(); }}>
      <div className="v2-modal__inner cmp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>📸 {t('m_scan_title', lang)}</strong><button className="brand-x" onClick={() => { stopCam(); onClose(); }} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <p className="studio-hint">Scan pages with your camera or add photos, then export a clean multi-page PDF — entirely in your browser, nothing uploaded.</p>

          <div className="scan-capture">
            {camOn ? (
              <div className="scan-cam">
                <video ref={videoRef} className="scan-video" playsInline muted />
                <div className="scan-cam-bar">
                  <TkxButton variant="solid" colorScheme="primary" size="sm" onClick={capture}>◉ Capture page</TkxButton>
                  <TkxButton variant="ghost" size="sm" onClick={stopCam}>Stop camera</TkxButton>
                </div>
              </div>
            ) : (
              <div className="scan-start">
                <TkxButton variant="solid" colorScheme="primary" size="sm" onClick={() => captureRef.current?.click()}>📸 Take photo</TkxButton>
                <TkxButton variant="outline" size="sm" onClick={() => void startCam()}>🎥 Live camera</TkxButton>
                <TkxButton variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>🖼 Add photos</TkxButton>
                {/* `capture` opens the device camera directly — the reliable path on iOS Safari, where getUserMedia is often blocked. */}
                <input ref={captureRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }} />
                <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }} />
                {camErr && <span className="cmp-row-note cmp-row-note--warn">{camErr}</span>}
              </div>
            )}
          </div>

          {pages.length > 0 && (
            <>
              <div className="cmp-controls">
                <label className="cmp-ctrl">Enhance
                  <TkxSelect size="sm" value={mode} options={[
                    { value: 'color', label: 'Color' },
                    { value: 'grayscale', label: 'Grayscale' },
                    { value: 'bw', label: 'Black and white' },
                  ]} onChange={(v) => setMode(v as ScanMode)} />
                </label>
                <TkxCheckbox label="Auto-crop to document" checked={autoCrop} onChange={(e) => setAutoCrop(e.target.checked)} />
                <TkxButton variant="outline" size="sm" disabled={busy} onClick={() => void dewarpAll()} title="Auto-detect document corners and perspective-correct every page">⊞ Dewarp all</TkxButton>
                <span className="cmp-row-note">{pages.length} page{pages.length === 1 ? '' : 's'}</span>
              </div>
              <div className="scan-pages">
                {pages.map((pg, i) => (
                  <div key={pg.id} className="scan-page">
                    <img className="scan-thumb" src={pg.src} alt={`Page ${i + 1}`} style={{ filter: scanFilter(mode), transform: `rotate(${pg.rotation}deg)` }} />
                    <span className="scan-page-n">{i + 1}</span>
                    {pg.corners && <span className="scan-page-badge" title="Perspective-corrected">⊞</span>}
                    <div className="scan-page-tools">
                      <button onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</button>
                      <button onClick={() => move(i, 1)} disabled={i === pages.length - 1} title="Move down">↓</button>
                      <button onClick={() => rotate(pg.id)} title="Rotate">⟳</button>
                      <button onClick={() => setEditing(pg.id)} title="Adjust corners (perspective dewarp)">⊞</button>
                      <button onClick={() => remove(pg.id)} title="Delete">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="resume-foot">
          <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy || pages.length === 0} onClick={() => void exportPdf()}>{busy ? 'Building…' : '⤓ Export PDF'}</TkxButton>
          {onOpenInPdf && <TkxButton variant="outline" size="sm" disabled={busy || pages.length === 0} onClick={() => void editInPdf()}>Edit in PDF editor</TkxButton>}
          <TkxButton variant="ghost" size="sm" onClick={() => { stopCam(); onClose(); }}>{t('act_close', lang)}</TkxButton>
        </div>
      </div>
      {editingPage && <CornerEditor page={editingPage} onApply={applyCorners} onCancel={() => setEditing(null)} />}
    </div>
  );
}

/** Full-bleed editor with four draggable handles to mark the document corners. */
function CornerEditor({ page, onApply, onCancel }: { page: Page; onApply: (c: Pt[] | null) => void; onCancel: () => void }) {
  const [corners, setCorners] = useState<Pt[] | null>(page.corners ?? null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<number | null>(null);

  const onImgLoad = () => {
    if (!corners && imgRef.current) setCorners(detectCorners(imgRef.current));
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const idx = dragRef.current; const img = imgRef.current;
      if (idx === null || !img) return;
      const r = img.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      setCorners((c) => (c ? c.map((p, i) => (i === idx ? { x, y } : p)) : c));
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, []);

  const labels = ['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left'];
  return (
    <div className="v2-modal ce-modal" onClick={onCancel}>
      <div className="ce-inner" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>⊞ Adjust document corners</strong><button className="brand-x" onClick={onCancel} aria-label="Close">✕</button></div>
        <p className="studio-hint" style={{ padding: '0 16px' }}>Drag the four handles onto the document’s corners — the page will be flattened (dewarped) to a clean rectangle.</p>
        <div className="ce-stage">
          <div className="ce-imgwrap">
            <img ref={imgRef} className="ce-img" src={page.src} alt="Page to adjust" onLoad={onImgLoad} draggable={false} />
            {corners && (
              <>
                <svg className="ce-svg" viewBox="0 0 1 1" preserveAspectRatio="none">
                  <polygon points={corners.map((c) => `${c.x},${c.y}`).join(' ')} fill="rgba(46,91,255,0.12)" stroke="#2e5bff" strokeWidth={0.004} />
                </svg>
                {corners.map((c, i) => (
                  <button
                    key={i}
                    className="ce-handle"
                    style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
                    aria-label={labels[i]}
                    title={labels[i]}
                    onPointerDown={(e) => { e.preventDefault(); dragRef.current = i; }}
                  />
                ))}
              </>
            )}
          </div>
        </div>
        <div className="resume-foot">
          <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={!corners} onClick={() => onApply(corners)}>Apply dewarp</TkxButton>
          <TkxButton variant="outline" size="sm" onClick={() => onApply(null)}>Reset (no crop)</TkxButton>
          <TkxButton variant="ghost" size="sm" onClick={onCancel}>Cancel</TkxButton>
        </div>
      </div>
    </div>
  );
}
