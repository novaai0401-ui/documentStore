/**
 * Photo Art — a friendly, standalone tool to turn any photo into a sketch,
 * cartoon, painting, pop-art, comic, vintage or noir picture, entirely on the
 * device (free, private, offline). A big live preview plus a thumbnail grid that
 * shows each style applied to YOUR photo, so choosing is a glance, not a guess.
 *
 * Reused two ways:
 *   • standalone (home "Photo Art" tool) → Save PNG / Share on WhatsApp;
 *   • as a picker from the Family Portrait Studio (`onApply` returns the styled
 *     photo for a family member) — same clean grid instead of a cramped popover.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { TkxButton } from 'tekivex-ui';
import { PHOTO_FX, type PhotoFxId } from './photoFx.js';
import { stylizePhoto } from './photoFxRender.js';
import { shareToWhatsApp } from './whatsapp.js';

const readAsDataUri = (f: File): Promise<string> => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = () => rej(new Error('read failed'));
  r.readAsDataURL(f);
});

const dataUriToPng = (uri: string): Uint8Array => {
  const b64 = uri.split(',')[1] ?? '';
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export function PhotoArtModal({ onClose, initialSrc, onApply }: {
  onClose: () => void;
  /** Start with this photo already loaded (e.g. a family member's picture). */
  initialSrc?: string;
  /** When set, the modal is a PICKER: a "Use this photo" button returns the
   *  chosen styled image instead of showing Save/Share. */
  onApply?: (styled: string) => void;
}) {
  const [src, setSrc] = useState<string | null>(initialSrc ?? null);
  const [fx, setFx] = useState<PhotoFxId | null>(null);
  const [preview, setPreview] = useState<string | null>(initialSrc ?? null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Build the small preview thumbnails (one per style, on the actual photo) so
  // the grid shows exactly what each filter does. Cheap: rendered at ~180px.
  useEffect(() => {
    let alive = true;
    setThumbs({});
    if (!src) return;
    (async () => {
      for (const f of PHOTO_FX) {
        try { const t = await stylizePhoto(src, f.id, 180); if (alive) setThumbs((prev) => ({ ...prev, [f.id]: t })); }
        catch { /* skip a failed thumb */ }
      }
    })();
    return () => { alive = false; };
  }, [src]);

  // The full-resolution preview for the chosen style.
  useEffect(() => {
    let alive = true;
    if (!src) { setPreview(null); return; }
    if (!fx) { setPreview(src); return; }
    setBusy(true);
    (async () => {
      try { const p = await stylizePhoto(src, fx); if (alive) setPreview(p); }
      catch { if (alive) setPreview(src); }
      finally { if (alive) setBusy(false); }
    })();
    return () => { alive = false; };
  }, [src, fx]);

  const onFile = async (f: File | undefined) => { if (f) { setSrc(await readAsDataUri(f)); setFx(null); setFlash(null); } };

  const save = async () => {
    if (!preview) return;
    const { downloadBytes } = await import('../smart/util.js');
    downloadBytes('photo-art.png', dataUriToPng(preview), 'image/png');
    setFlash('✓ Saved to your device');
  };
  const share = async () => {
    if (!preview) return;
    const file = new File([dataUriToPng(preview) as BlobPart], 'photo-art.png', { type: 'image/png' });
    const r = await shareToWhatsApp({ file, text: 'Made with Pyntra ✨' });
    setFlash(r === 'downloaded' ? '✓ Saved — attach it in WhatsApp' : '✓ Shared!');
  };

  const styleLabel = useMemo(() => (fx ? PHOTO_FX.find((f) => f.id === fx)?.label : 'Original'), [fx]);

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner inv-modal pa-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>🎨 Photo Art</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <p className="studio-hint">Turn any photo into a sketch, cartoon, painting and more — free, on your device, nothing uploaded.</p>

          {!src ? (
            <button className="pa-drop" onClick={() => fileRef.current?.click()}>
              <span className="pa-drop-icon" aria-hidden>🖼️</span>
              <strong>Choose a photo</strong>
              <span>Tap to pick a picture from your device</span>
            </button>
          ) : (
            <>
              <div className="pa-preview">
                {preview && <img src={preview} alt={styleLabel ?? 'preview'} />}
                {busy && <span className="pa-preview-busy">✨ Applying…</span>}
                <button className="pa-change" onClick={() => fileRef.current?.click()}>↺ Change photo</button>
              </div>
              <div className="pa-grid" role="listbox" aria-label="Photo styles">
                <button className={'pa-style' + (fx === null ? ' on' : '')} role="option" aria-selected={fx === null} onClick={() => setFx(null)}>
                  <span className="pa-style-thumb">{src && <img src={src} alt="Original" />}</span>
                  <span className="pa-style-label">Original</span>
                </button>
                {PHOTO_FX.map((f) => (
                  <button key={f.id} className={'pa-style' + (fx === f.id ? ' on' : '')} role="option" aria-selected={fx === f.id} onClick={() => setFx(f.id)}>
                    <span className="pa-style-thumb">
                      {thumbs[f.id] ? <img src={thumbs[f.id]} alt={f.label} /> : <span className="pa-style-load" aria-hidden>{f.emoji}</span>}
                    </span>
                    <span className="pa-style-label">{f.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {flash && <span className="cmp-row-note">{flash}</span>}
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void onFile(f); }} />
        </div>
        <div className="resume-foot">
          {onApply ? (
            <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={!preview || busy} onClick={() => preview && onApply(preview)}>✓ Use this photo</TkxButton>
          ) : (
            <>
              <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={!preview || busy} onClick={() => void share()}>📲 Share on WhatsApp</TkxButton>
              <TkxButton variant="outline" size="sm" disabled={!preview || busy} onClick={() => void save()}>⬇ Save PNG</TkxButton>
            </>
          )}
          <TkxButton variant="ghost" size="sm" onClick={onClose}>{onApply ? 'Cancel' : 'Close'}</TkxButton>
        </div>
      </div>
    </div>
  );
}
