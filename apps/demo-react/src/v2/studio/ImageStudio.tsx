/**
 * Image toolkit — crop, rotate, resize, filter, and format-convert an image,
 * all in the browser. Works two ways: standalone (download the result or send it
 * to the PDF editor) and as a modal launched from the Design Studio to edit an
 * image already on the canvas (returns the edited data URL via `onApply`).
 */
import { useEffect, useRef, useState } from 'react';
import { TkxButton, TkxSelect } from 'tekivex-ui';
import {
  type Filters, type ImageEdit, type ImageFormat, type Rect,
  NEUTRAL_FILTERS, defaultEdit, filterString, isNeutral, clampCrop, extFor, mimeFor,
} from './imageOps.js';
import { imageSize, editToDataUrl, editToBytes, loadImage } from './imageRender.js';
import { removeBackground } from './bgRemove.js';
import { inpaintRect } from './imageInpaint.js';
import { matteBackground } from './matting.js';
import { downloadBytes } from '../smart/util.js';
import { newElId, type Design } from './model.js';

interface Props {
  src: string;
  name?: string;
  onClose: () => void;
  /** Modal mode (from the Studio): apply the edited image back to the canvas. */
  onApply?: (dataUrl: string, w: number, h: number) => void;
  /** Standalone mode: hand the result to the PDF editor. */
  onOpenInPdf?: (bytes: Uint8Array, name: string) => void;
  /** Open cut-out + scenery as SEPARATE draggable layers in the design studio. */
  onOpenInStudio?: (design: Design, name: string) => void;
}

const PRESETS: { id: string; name: string; f: Partial<Filters> }[] = [
  { id: 'none', name: 'Original', f: {} },
  { id: 'bw', name: 'B&W', f: { grayscale: 100, contrast: 110 } },
  { id: 'vintage', name: 'Vintage', f: { sepia: 55, contrast: 95, saturate: 85, brightness: 105 } },
  { id: 'cool', name: 'Cool', f: { hue: 200, saturate: 115 } },
  { id: 'warm', name: 'Warm', f: { sepia: 25, saturate: 120, brightness: 105 } },
  { id: 'vivid', name: 'Vivid', f: { saturate: 160, contrast: 115 } },
];

const SLIDERS: { key: keyof Filters; label: string; min: number; max: number }[] = [
  { key: 'brightness', label: 'Brightness', min: 0, max: 200 },
  { key: 'contrast', label: 'Contrast', min: 0, max: 200 },
  { key: 'saturate', label: 'Saturation', min: 0, max: 200 },
  { key: 'grayscale', label: 'Grayscale', min: 0, max: 100 },
  { key: 'sepia', label: 'Sepia', min: 0, max: 100 },
  { key: 'blur', label: 'Blur', min: 0, max: 20 },
  { key: 'hue', label: 'Hue', min: 0, max: 360 },
];

export function ImageStudio({ src, name = 'image', onClose, onApply, onOpenInPdf, onOpenInStudio }: Props) {
  const [edit, setEdit] = useState<ImageEdit>(defaultEdit());
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);
  // The editable base image; background removal bakes a new (transparent) image here.
  const [workingSrc, setWorkingSrc] = useState(src);
  const [bgTol, setBgTol] = useState(48);
  const [matStatus, setMatStatus] = useState<string | null>(null);
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { setWorkingSrc(src); }, [src]);
  useEffect(() => { void imageSize(workingSrc).then(setSize).catch(() => setSize({ w: 0, h: 0 })); }, [workingSrc]);

  const setFilter = (k: keyof Filters, v: number) => setEdit((e) => ({ ...e, filters: { ...e.filters, [k]: v } }));
  const applyPreset = (f: Partial<Filters>) => setEdit((e) => ({ ...e, filters: { ...NEUTRAL_FILTERS, ...f } }));
  const rotate = (delta: number) => setEdit((e) => ({ ...e, rotate: (e.rotate + delta + 360) % 360 }));

  // Crop selection (only meaningful with no rotation, so mapping is direct).
  const toImg = (clientX: number, clientY: number) => {
    const r = overlayRef.current!.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * (size?.w ?? 1), y: ((clientY - r.top) / r.height) * (size?.h ?? 1) };
  };
  const startCrop = (e: React.PointerEvent) => {
    if (edit.rotate !== 0 || !size) return;
    const p = toImg(e.clientX, e.clientY);
    dragRef.current = p;
    setEdit((ed) => ({ ...ed, crop: { x: p.x, y: p.y, w: 1, h: 1 } }));
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const s = dragRef.current;
      if (!s || !size) return;
      const p = toImg(e.clientX, e.clientY);
      const crop: Rect = { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) };
      setEdit((ed) => ({ ...ed, crop: clampCrop(crop, size.w, size.h) }));
    };
    const up = () => { dragRef.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [size]);

  const reset = () => setEdit(defaultEdit());

  const outName = `${name}-edited`;
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const onDownload = () => run(async () => { const bytes = await editToBytes(workingSrc, edit); downloadBytes(`${outName}.${extFor(edit.format)}`, bytes, mimeFor(edit.format)); });
  const onPdf = () => run(async () => { if (!onOpenInPdf) return; const bytes = await editToBytes(workingSrc, { ...edit, format: 'png' }); onOpenInPdf(bytes, outName); });
  const onApplyBack = () => run(async () => { if (!onApply) return; const { dataUrl, w, h } = await editToDataUrl(workingSrc, edit); onApply(dataUrl, w, h); });

  // Remove the background on-device (edge flood-fill) and bake the result so the
  // rest of the edits compose on top of the cut-out.
  const removeBg = () => run(async () => {
    const img = await loadImage(workingSrc);
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const id = ctx.getImageData(0, 0, w, h);
    const out = ctx.createImageData(w, h);
    out.data.set(removeBackground(id.data, w, h, bgTol));
    ctx.putImageData(out, 0, 0);
    setWorkingSrc(canvas.toDataURL('image/png'));
    setEdit((e) => ({ ...e, crop: undefined, format: 'png' })); // alpha needs PNG; crop coords reset
  });

  // New background behind a cut-out — a solid colour, or ANY picture (your own
  // scenery photo, cover-fitted). Composites under the current working image,
  // so run one of the background removers first for a person-on-scenery look.
  /** The current image as a canvas with a TRANSPARENT background. If the user
   *  hasn't cut the background out yet (fully opaque image), do it for them —
   *  otherwise a new scenery would sit invisibly behind the photo and the
   *  button would seem to "do nothing". */
  const cutoutCanvas = async (): Promise<HTMLCanvasElement> => {
    const img = await loadImage(workingSrc);
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, w, h).data;
    let transparent = false;
    for (let p = 3; p < d.length; p += 64) { if (d[p]! < 250) { transparent = true; break; } }
    if (!transparent) {
      const id = ctx.getImageData(0, 0, w, h);
      const out = ctx.createImageData(w, h);
      out.data.set(removeBackground(id.data, w, h, bgTol));
      ctx.putImageData(out, 0, 0);
      setMatStatus('The background was cut out automatically first. If too much (or too little) was removed, press Restore, use ✂/✨ yourself, then pick the scenery again.');
    }
    return c;
  };
  const applyBgColor = (color: string) => run(async () => {
    const fg = await cutoutCanvas();
    const c = document.createElement('canvas'); c.width = fg.width; c.height = fg.height;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = color; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(fg, 0, 0);
    setWorkingSrc(c.toDataURL('image/png'));
    setEdit((e) => ({ ...e, format: 'png' }));
  });
  const applyBgImage = (file: File) => run(async () => {
    const fg = await cutoutCanvas();
    const w = fg.width, h = fg.height;
    const url = URL.createObjectURL(file);
    try {
      const bg = await loadImage(url);
      const bw = bg.naturalWidth || bg.width, bh = bg.naturalHeight || bg.height;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d')!;
      const s = Math.max(w / bw, h / bh); // cover-fit the scenery
      ctx.drawImage(bg, (w - bw * s) / 2, (h - bh * s) / 2, bw * s, bh * s);
      ctx.drawImage(fg, 0, 0);
      setWorkingSrc(c.toDataURL('image/png'));
      setEdit((e) => ({ ...e, format: 'png' }));
    } finally { URL.revokeObjectURL(url); }
  });

  // Person + scenery as SEPARATE layers in the design studio: the cut-out and
  // the background stay independent objects you can move, resize, rotate,
  // reshape, fade and re-order — not one baked-together picture.
  const openAsLayers = (sceneryFile: File | null) => run(async () => {
    if (!onOpenInStudio) return;
    const fg = await cutoutCanvas();
    const W = 1600, H = 1200;
    const elements: Design['elements'] = [];
    if (sceneryFile) {
      const bgUrl = await new Promise<string>((resolve, reject) => {
        const rd = new FileReader();
        rd.onload = () => resolve(String(rd.result));
        rd.onerror = () => reject(new Error('Could not read the scenery picture.'));
        rd.readAsDataURL(sceneryFile);
      });
      const bg = await loadImage(bgUrl);
      const bw = bg.naturalWidth || bg.width, bh = bg.naturalHeight || bg.height;
      const s = Math.max(W / bw, H / bh); // cover the canvas
      elements.push({ id: newElId(), type: 'image', href: bgUrl, x: (W - bw * s) / 2, y: (H - bh * s) / 2, w: bw * s, h: bh * s, name: 'Scenery (background)' });
    }
    const r = Math.min((W * 0.6) / fg.width, (H * 0.8) / fg.height, 1.5);
    elements.push({ id: newElId(), type: 'image', href: fg.toDataURL('image/png'), x: (W - fg.width * r) / 2, y: (H - fg.height * r) / 2, w: fg.width * r, h: fg.height * r, name: 'Cut-out (front)' });
    onOpenInStudio({ w: W, h: H, background: '#eef2f7', elements }, `${name}-layers`);
  });

  // Magic eraser: inpaint the selected crop region (object removal), on-device.
  const eraseRegion = () => run(async () => {
    if (!edit.crop) return;
    const img = await loadImage(workingSrc);
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const id = ctx.getImageData(0, 0, w, h);
    const out = ctx.createImageData(w, h);
    out.data.set(inpaintRect(id.data, w, h, edit.crop));
    ctx.putImageData(out, 0, 0);
    setWorkingSrc(canvas.toDataURL('image/png'));
    setEdit((e) => ({ ...e, crop: undefined }));
  });

  // Opt-in ML matting for busy/photo backgrounds (lazy-loaded; local inference).
  const hdCutout = () => run(async () => {
    setMatStatus('Loading model (first use downloads it)…');
    try {
      const out = await matteBackground(workingSrc, (f) => setMatStatus(`Cutting out… ${Math.round(f * 100)}%`));
      setWorkingSrc(out);
      setEdit((e) => ({ ...e, crop: undefined, format: 'png' }));
      setMatStatus(null);
    } catch (e) {
      setMatStatus(`AI cutout failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  const previewW = edit.crop ? edit.crop.w : size?.w ?? 0;
  const previewH = edit.crop ? edit.crop.h : size?.h ?? 0;

  return (
    <div className="imgstudio">
      <div className="imgstudio-bar">
        <strong>Edit image</strong>
        <span className="imgstudio-dim">{size ? `${Math.round(previewW * edit.scale)}×${Math.round(previewH * edit.scale)} px · ${edit.format.toUpperCase()}` : '…'}</span>
        <span className="studio-spacer" />
        <TkxButton variant="ghost" size="sm" onClick={reset}>Reset</TkxButton>
        {onApply
          ? <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy} onClick={onApplyBack}>Apply to design</TkxButton>
          : <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy} onClick={onDownload}>Download</TkxButton>}
        {onOpenInPdf && <TkxButton variant="outline" size="sm" disabled={busy} onClick={onPdf}>Open in PDF editor</TkxButton>}
        <TkxButton variant="ghost" size="sm" onClick={onClose}>Close</TkxButton>
      </div>

      <div className="imgstudio-body">
        <div className="imgstudio-stage">
          <div className="imgstudio-canvas" style={{ transform: `rotate(${edit.rotate}deg)` }}>
            <img className="imgstudio-img" src={workingSrc} alt="" style={{ filter: filterString(edit.filters) }} />
            {edit.rotate === 0 && size && (
              <svg ref={overlayRef} className="imgstudio-overlay" viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="none" onPointerDown={startCrop}>
                {edit.crop && <rect x={edit.crop.x} y={edit.crop.y} width={edit.crop.w} height={edit.crop.h} fill="rgba(46,91,255,0.12)" stroke="#2e5bff" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
              </svg>
            )}
          </div>
        </div>

        <aside className="imgstudio-panel">
          {/* Collapsible sections so the panel isn't a wall of controls — especially
              on phones, where it sits below the image in a short scroll area. Each
              step opens on its own; the everyday flow (Filters, Export) starts open. */}
          <details className="imgstudio-sect" open>
            <summary className="brand-section">🎨 Filters</summary>
            <div className="imgstudio-sect-body">
              <div className="imgstudio-presets">
                {PRESETS.map((p) => <button key={p.id} onClick={() => applyPreset(p.f)}>{p.name}</button>)}
              </div>
              {SLIDERS.map((s) => (
                <label key={s.key} className="imgstudio-slider">
                  <span>{s.label}<em>{edit.filters[s.key]}</em></span>
                  <input type="range" min={s.min} max={s.max} value={edit.filters[s.key]} onChange={(e) => setFilter(s.key, Number(e.target.value))} />
                </label>
              ))}
              {!isNeutral(edit.filters) && <button className="imgstudio-link" onClick={() => setEdit((e) => ({ ...e, filters: { ...NEUTRAL_FILTERS } }))}>Clear filters</button>}
            </div>
          </details>

          <details className="imgstudio-sect">
            <summary className="brand-section">🔄 Rotate &amp; resize</summary>
            <div className="imgstudio-sect-body">
              <div className="imgstudio-row">
                <button onClick={() => rotate(-90)} title="Rotate left">↺ 90°</button>
                <button onClick={() => rotate(90)} title="Rotate right">↻ 90°</button>
                <span className="imgstudio-rotval">{edit.rotate}°</span>
              </div>
              <label className="imgstudio-slider"><span>Free rotate<em>{edit.rotate}°</em></span><input type="range" min={0} max={359} value={edit.rotate} onChange={(e) => setEdit((ed) => ({ ...ed, rotate: Number(e.target.value) }))} /></label>
              <label className="imgstudio-slider"><span>Output size<em>{Math.round(edit.scale * 100)}%</em></span><input type="range" min={10} max={200} value={Math.round(edit.scale * 100)} onChange={(e) => setEdit((ed) => ({ ...ed, scale: Number(e.target.value) / 100 }))} /></label>
              <p className="studio-hint">“Output size” only changes the pixels of the saved file — the picture on screen stays the same size. Leave it at 100% to keep the original size.</p>
            </div>
          </details>

          <details className="imgstudio-sect">
            <summary className="brand-section">✂️ Background</summary>
            <div className="imgstudio-sect-body">
              <label className="imgstudio-slider"><span>Tolerance<em>{bgTol}</em></span><input type="range" min={5} max={150} value={bgTol} onChange={(e) => setBgTol(Number(e.target.value))} /></label>
              <div className="imgstudio-row">
                <button onClick={removeBg} disabled={busy} title="Make the connected edge background transparent (on-device, instant)">✂ Remove background</button>
                <button onClick={hdCutout} disabled={busy} title="AI cutout for busy/photo backgrounds — runs locally; first use downloads a model">✨ HD cutout</button>
                {workingSrc !== src && <button onClick={() => { setWorkingSrc(src); setMatStatus(null); setEdit((e) => ({ ...e, crop: undefined })); }}>Restore</button>}
              </div>
              {matStatus && <p className="studio-hint">{matStatus}</p>}
              <p className="studio-hint">Quick remover works best on solid backgrounds (raise tolerance if too little goes). HD cutout uses a local AI model for tricky photos — your image never leaves the device.</p>
              <div className="imgstudio-row">
                <label className="imgstudio-bgbtn" title="Fill behind the cut-out with a colour">🎨 New colour
                  <input type="color" defaultValue="#ffffff" style={{ marginLeft: 6 }} onChange={(e) => applyBgColor(e.target.value)} disabled={busy} />
                </label>
                <label className="imgstudio-bgbtn" title="Put ANY picture behind the cut-out — a beach, mountains, your own scenery photo">🏞️ New scenery…
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) applyBgImage(f); }} disabled={busy} />
                </label>
              </div>
              <p className="studio-hint">Remove the background first, then pick a colour or a scenery photo to appear behind the person.</p>
              {onOpenInStudio && (
                <>
                  <div className="imgstudio-row">
                    <label className="imgstudio-bgbtn" title="Open the cut-out and a scenery as SEPARATE layers — move, resize, rotate and restyle each on its own">🧩 Layers: person + scenery…
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) openAsLayers(f); }} disabled={busy} />
                    </label>
                    <button onClick={() => openAsLayers(null)} disabled={busy} title="Send just the cut-out to the design studio as a draggable layer">🧩 Just the cut-out</button>
                  </div>
                  <p className="studio-hint">Opens the design studio where the person and the scenery stay separate — drag either one, resize, rotate, crop to a shape, fade, add text and stickers, even animate it.</p>
                </>
              )}
            </div>
          </details>

          <details className="imgstudio-sect">
            <summary className="brand-section">🪄 Erase an object</summary>
            <div className="imgstudio-sect-body">
              <div className="imgstudio-row">
                <button onClick={eraseRegion} disabled={busy || !edit.crop} title="Drag a box over an object, then remove it — filled from the surroundings, on-device">🪄 Erase selected area</button>
              </div>
              <p className="studio-hint">Drag a box on the image (below), then erase — the area is filled in from what surrounds it. Works best on objects over a fairly even background.</p>
            </div>
          </details>

          <details className="imgstudio-sect">
            <summary className="brand-section">🔲 Crop</summary>
            <div className="imgstudio-sect-body">
              <p className="studio-hint">{edit.rotate === 0 ? 'Drag on the image to select a crop area.' : 'Set rotation to 0° to crop.'}</p>
              {edit.crop && <button className="imgstudio-link" onClick={() => setEdit((e) => ({ ...e, crop: undefined }))}>Clear crop</button>}
            </div>
          </details>

          <details className="imgstudio-sect" open>
            <summary className="brand-section">⤓ Save as</summary>
            <div className="imgstudio-sect-body">
              <div className="imgstudio-row">
                <TkxSelect size="sm" value={edit.format} options={[{ value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPEG' }, { value: 'webp', label: 'WEBP' }]} onChange={(v) => setEdit((e) => ({ ...e, format: v as ImageFormat }))} />
                {edit.format !== 'png' && <label className="imgstudio-slider imgstudio-q"><span>Quality<em>{Math.round(edit.quality * 100)}</em></span><input type="range" min={30} max={100} value={Math.round(edit.quality * 100)} onChange={(e) => setEdit((ed) => ({ ...ed, quality: Number(e.target.value) / 100 }))} /></label>}
              </div>
              <p className="studio-hint">Pick a format, then use <strong>{onApply ? 'Apply to design' : 'Download'}</strong> at the top.</p>
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}
