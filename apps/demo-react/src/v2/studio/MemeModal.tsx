/**
 * Meme generator — drop an image, add top/bottom captions in the classic Impact
 * style, and download. 100% in the browser via Canvas; helpers in meme.ts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { TkxButton, TkxInput } from 'tekivex-ui';
import { t, useLang } from '../../i18n.js';
import { memeFontSize, wrapText } from './meme.js';

export function MemeModal({ onClose }: { onClose: () => void }) {
  const lang = useLang();
  const [src, setSrc] = useState<string | null>(null);
  const [top, setTop] = useState('TOP TEXT');
  const [bottom, setBottom] = useState('BOTTOM TEXT');
  const [preview, setPreview] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback((f: File) => { if (!f.type.startsWith('image/')) return; const rd = new FileReader(); rd.onload = () => setSrc(String(rd.result)); rd.readAsDataURL(f); }, []);

  const render = useCallback(async () => {
    if (!src) { setPreview(null); return; }
    const img = await new Promise<HTMLImageElement>((res) => { const im = new Image(); im.onload = () => res(im); im.src = src; });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const size = memeFontSize(canvas.width);
    ctx.font = `900 ${size}px Impact, "Arial Black", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = Math.max(2, size / 14);
    ctx.strokeStyle = '#000'; ctx.fillStyle = '#fff';
    ctx.lineJoin = 'round';
    const measure = (s: string) => ctx.measureText(s).width;
    const draw = (text: string, anchor: 'top' | 'bottom') => {
      const lines = wrapText(text.toUpperCase(), canvas.width * 0.92, measure);
      const lh = size * 1.05;
      lines.forEach((ln, i) => {
        const y = anchor === 'top' ? size + i * lh + size * 0.1 : canvas.height - (lines.length - 1 - i) * lh - size * 0.35;
        ctx.textBaseline = anchor === 'top' ? 'alphabetic' : 'alphabetic';
        ctx.strokeText(ln, canvas.width / 2, y);
        ctx.fillText(ln, canvas.width / 2, y);
      });
    };
    if (top.trim()) draw(top, 'top');
    if (bottom.trim()) draw(bottom, 'bottom');
    setPreview(canvas.toDataURL('image/png'));
  }, [src, top, bottom]);

  useEffect(() => { void render(); }, [render]);

  const download = async () => { if (!preview) return; const { saveBlob } = await import('../smart/util.js'); await saveBlob('meme.png', await (await fetch(preview)).blob()); };

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner cmp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>😄 {t('m_meme_title', lang)}</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <p className="studio-hint">{t('m_meme_desc', lang)}</p>

          {!src ? (
            <div
              className={'cmp-drop' + (drag ? ' cmp-drop--over' : '')}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) load(f); }}
              onClick={() => inputRef.current?.click()} role="button" tabIndex={0}
            >
              <span className="cmp-drop-icon" aria-hidden>⬇</span>
              <span>{t('m_meme_drop', lang)} <strong>{t('act_browse', lang)}</strong></span>
              <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) load(f); }} />
            </div>
          ) : (
            <>
              <TkxInput label="Top text" value={top} onChange={(e) => setTop(e.target.value)} />
              <TkxInput label="Bottom text" value={bottom} onChange={(e) => setBottom(e.target.value)} />
              {preview && <div className="vid-result"><img className="scan-video" src={preview} alt="Meme preview" /></div>}
            </>
          )}
        </div>
        <div className="resume-foot">
          {src && <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={!preview} onClick={() => void download()}>⤓ {t('act_download_png', lang)}</TkxButton>}
          {src && <TkxButton variant="outline" size="sm" onClick={() => { setSrc(null); setPreview(null); }}>{t('act_change_image', lang)}</TkxButton>}
          <TkxButton variant="ghost" size="sm" onClick={onClose}>{t('act_close', lang)}</TkxButton>
        </div>
      </div>
    </div>
  );
}
