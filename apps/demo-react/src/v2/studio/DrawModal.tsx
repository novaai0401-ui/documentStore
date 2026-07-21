/**
 * Two child-simple ways to get custom artwork into a design:
 *   • DrawModal — a freehand drawing pad (pointer/touch/pen). Done crops the
 *     ink to its bounds and hands back a transparent PNG data URL, which the
 *     studio drops in as an ordinary draggable image element.
 *   • ImageLinkModal — paste any image address from the web; the image is
 *     fetched and INLINED as a data URL (SVG rendering and PNG export can't
 *     load external URLs, and inlining also keeps exports untainted).
 */
import { useCallback, useRef, useState } from 'react';
import { TkxButton, TkxInput } from 'tekivex-ui';

const PEN_COLORS = ['#0f172a', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];
const PEN_SIZES = [4, 10, 22];

/** Crop a canvas to its inked bounds (+pad) and return a PNG data URL, or null when empty. */
function cropToInk(cv: HTMLCanvasElement, pad = 12): string | null {
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  const { data } = ctx.getImageData(0, 0, cv.width, cv.height);
  let minX = cv.width, minY = cv.height, maxX = -1, maxY = -1;
  for (let y = 0; y < cv.height; y++) {
    for (let x = 0; x < cv.width; x++) {
      if (data[(y * cv.width + x) * 4 + 3]! > 0) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(cv.width - 1, maxX + pad); maxY = Math.min(cv.height - 1, maxY + pad);
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1; out.height = maxY - minY + 1;
  out.getContext('2d')!.drawImage(cv, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

export function DrawModal({ onDone, onClose }: { onDone: (dataUrl: string) => void; onClose: () => void }) {
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const [color, setColor] = useState('#ef4444');
  const [pen, setPen] = useState(10);
  const [hasInk, setHasInk] = useState(false);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  const toCanvas = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = cvRef.current!;
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = toCanvas(e);
    // A tap should leave a dot, not nothing.
    const ctx = cvRef.current!.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(last.current.x, last.current.y, pen / 2, 0, Math.PI * 2); ctx.fill();
    setHasInk(true);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const p = toCanvas(e);
    const ctx = cvRef.current!.getContext('2d')!;
    ctx.strokeStyle = color; ctx.lineWidth = pen; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p;
  };
  const up = () => { drawing.current = false; };
  const clear = () => { const cv = cvRef.current!; cv.getContext('2d')!.clearRect(0, 0, cv.width, cv.height); setHasInk(false); };
  const done = useCallback(() => {
    const url = cvRef.current && cropToInk(cvRef.current);
    if (url) onDone(url);
  }, [onDone]);

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner cmp-modal draw-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>✏️ Draw your own</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <p className="studio-hint">Draw with your finger, pen or mouse. When you press <strong>Add my drawing</strong>, it lands on the design as a picture you can move and resize.</p>
          <div className="draw-tools">
            {PEN_COLORS.map((c) => (
              <button key={c} className={'draw-swatch' + (c === color ? ' draw-swatch--sel' : '')} style={{ background: c }} title={`Draw in ${c}`} aria-label={`Pen colour ${c}`} onClick={() => setColor(c)} />
            ))}
            <span className="draw-sep" />
            {PEN_SIZES.map((s) => (
              <button key={s} className={'draw-size' + (s === pen ? ' draw-size--sel' : '')} title={`Pen size ${s}`} aria-label={`Pen size ${s}`} onClick={() => setPen(s)}>
                <span style={{ width: Math.max(6, s * 0.9), height: Math.max(6, s * 0.9), background: color }} />
              </button>
            ))}
            <span className="draw-sep" />
            <TkxButton variant="ghost" size="sm" disabled={!hasInk} onClick={clear}>🧽 Start over</TkxButton>
          </div>
          <canvas ref={cvRef} className="draw-pad" width={900} height={620} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
        </div>
        <div className="resume-foot">
          <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={!hasInk} onClick={done}>✓ Add my drawing</TkxButton>
          <TkxButton variant="ghost" size="sm" onClick={onClose}>Close</TkxButton>
        </div>
      </div>
    </div>
  );
}

export function ImageLinkModal({ onAdd, onClose }: { onAdd: (dataUrl: string) => void; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const add = useCallback(async () => {
    const u = url.trim();
    if (!u) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(u, { mode: 'cors' });
      if (!res.ok) throw new Error(`The site answered ${res.status}.`);
      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) throw new Error('That link is not a picture.');
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const rd = new FileReader();
        rd.onload = () => resolve(String(rd.result));
        rd.onerror = () => reject(new Error('Could not read the picture.'));
        rd.readAsDataURL(blob);
      });
      onAdd(dataUrl);
    } catch (e) {
      setErr(`${e instanceof Error ? e.message : 'Could not load that link.'} Many sites block direct access — right-click the picture, choose “Save image”, then use the 🖼 Image button instead.`);
    } finally { setBusy(false); }
  }, [url, onAdd]);

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner cmp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>🔗 Picture from a link</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <p className="studio-hint">On any website (including Google Images), right-click a picture and choose <strong>“Copy image address”</strong>, then paste it here. The picture is fetched once and stored inside your design — nothing else is shared.</p>
          <TkxInput label="Picture address (URL)" type="url" value={url} placeholder="https://…/picture.jpg" onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add(); }} autoFocus />
          {err && <span className="cmp-row-note cmp-row-note--warn">{err}</span>}
          <span className="cmp-row-note">Please use pictures you're allowed to use.</span>
        </div>
        <div className="resume-foot">
          <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy || !url.trim()} onClick={() => void add()}>{busy ? 'Fetching…' : '⤓ Add picture'}</TkxButton>
          <TkxButton variant="ghost" size="sm" onClick={onClose}>Close</TkxButton>
        </div>
      </div>
    </div>
  );
}
