/**
 * QR code generator — type a URL/text, pick colours and error-correction, preview
 * live, then drop it onto the design or download it (SVG vector or PNG). Generated
 * locally; nothing uploads.
 */
import { useMemo, useState } from 'react';
import { TkxButton, TkxSelect } from 'tekivex-ui';
import { t, useLang } from '../../i18n.js';
import { qrToSvg, qrToDataUrl, type QrEcLevel } from './qr.js';
import { loadImage } from './imageRender.js';
import { downloadBytes } from '../smart/util.js';

export function QrModal({ onClose, onInsert }: { onClose: () => void; onInsert: (dataUrl: string) => void }) {
  const lang = useLang();
  const [text, setText] = useState('https://pyntra.app');
  const [fg, setFg] = useState('#0f172a');
  const [bg, setBg] = useState('#ffffff');
  const [ec, setEc] = useState<QrEcLevel>('M');
  const [busy, setBusy] = useState(false);

  const opts = { fg, bg, ec, size: 512 };
  const preview = useMemo(() => qrToDataUrl(text || ' ', opts), [text, fg, bg, ec]);

  // Phone cameras need DARK modules on a LIGHT background with real contrast —
  // an inverted or washed-out QR previews fine but won't scan. Warn plainly.
  const luma = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
  const scanWarning = useMemo(() => {
    const lf = luma(fg), lb = luma(bg);
    if (lf > lb) return '⚠️ Light code on a dark background — most phones can’t scan this. Swap the colours.';
    if (lb - lf < 0.4) return '⚠️ Low contrast — phones may struggle to scan. Use a darker code colour or a lighter background.';
    return null;
  }, [fg, bg]);

  /** Rasterize the QR to a PNG data URL at `size` px. Inserting a PNG (rather
   *  than an SVG data URL) is bulletproof: some browsers — notably Safari and
   *  several mobile ones — refuse to render an <image> whose href is an SVG
   *  data URL, so an SVG-inserted QR would be invisible on the canvas and blank
   *  in exports. A raster always shows. */
  const rasterize = async (size: number): Promise<string> => {
    const img = await loadImage(qrToDataUrl(text || ' ', { ...opts, size }));
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create the QR image.');
    ctx.drawImage(img, 0, 0, size, size);
    return canvas.toDataURL('image/png');
  };

  const downloadSvg = () => downloadBytes('qr-code.svg', new TextEncoder().encode(qrToSvg(text || ' ', opts)), 'image/svg+xml');
  const downloadPng = async () => {
    setBusy(true);
    try {
      const dataUrl = await rasterize(1024);
      const blob = await (await fetch(dataUrl)).blob();
      downloadBytes('qr-code.png', new Uint8Array(await blob.arrayBuffer()), 'image/png');
    } finally { setBusy(false); }
  };
  const insert = async () => {
    setBusy(true);
    try { onInsert(await rasterize(1024)); onClose(); }
    finally { setBusy(false); }
  };

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner qr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>▦ {t('m_qr_title', lang)}</strong><button className="brand-x" onClick={onClose}>✕</button></div>
        <div className="qr-body">
          <div className="qr-preview"><img src={preview} alt="QR preview" width={220} height={220} /></div>
          <div className="qr-controls">
            <label className="studio-inline ai-field">Link or text<textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} /></label>
            <div className="studio-prop-grid">
              <label>Foreground<input type="color" value={fg} onChange={(e) => setFg(e.target.value)} /></label>
              <label>Background<input type="color" value={bg} onChange={(e) => setBg(e.target.value)} /></label>
              <label>Error correction<TkxSelect size="sm" value={ec} options={[{ value: 'L', label: 'L (7%)' }, { value: 'M', label: 'M (15%)' }, { value: 'Q', label: 'Q (25%)' }, { value: 'H', label: 'H (30%)' }]} onChange={(v) => setEc(v as QrEcLevel)} /></label>
            </div>
            {scanWarning && <p className="cmp-row-note cmp-row-note--warn">{scanWarning}</p>}
            <div className="brand-actions">
              <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy} onClick={() => void insert()}>{t('m_qr_insert', lang)}</TkxButton>
              <TkxButton variant="outline" size="sm" onClick={downloadSvg}>SVG</TkxButton>
              <TkxButton variant="outline" size="sm" disabled={busy} onClick={() => void downloadPng()}>PNG</TkxButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
