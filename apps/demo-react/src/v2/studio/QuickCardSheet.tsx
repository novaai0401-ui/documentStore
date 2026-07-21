/**
 * "Ready to send" quick sheet — the fast path for a card: tap a design, edit
 * just the words (and drop in a photo if it has a frame), then download or
 * share in one tap. No need to learn the full studio — but "Open full editor"
 * is always one click away and carries your edits across.
 *
 * Works for every card generically: the design's own text elements become the
 * fields, so there's nothing to configure per template.
 */
import { useMemo, useRef, useState } from 'react';
import { TkxButton } from 'tekivex-ui';
import type { AnimPreset } from './animate.js';
import { designToSvg, type Design, type TextEl, type ImageEl } from './model.js';
import { exportDesignPng, exportDesignPdf, designToPng } from './exportDesign.js';
import type { CardEntry } from './cardCatalog.js';
import { MicButton } from './MicButton.js';
import { shareToWhatsApp } from './whatsapp.js';

const uri = (d: Design) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(designToSvg(d));
const firstLine = (s: string) => (s.trim().split('\n')[0] || '').slice(0, 24) || 'Text';

export function QuickCardSheet({ card, onClose, onOpenStudio }: { card: CardEntry; onClose: () => void; onOpenStudio: (name: string, design: Design, anim?: AnimPreset) => void }) {
  const [design, setDesign] = useState<Design>(() => card.make());
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // The editable words are simply the design's text elements. Skip empty ones.
  const texts = useMemo(() => design.elements.filter((e): e is TextEl => e.type === 'text' && e.text.trim().length > 0), [design]);
  const photo = useMemo(() => design.elements.find((e): e is ImageEl => e.type === 'image'), [design]);

  const setText = (id: string, text: string) =>
    setDesign((d) => ({ ...d, elements: d.elements.map((e) => (e.id === id ? { ...(e as TextEl), text } : e)) }));

  const addPhoto = async (file: File) => {
    setErr(null);
    try {
      const href = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = () => rej(new Error('read')); r.readAsDataURL(file); });
      setDesign((d) => ({ ...d, elements: d.elements.map((e) => (e.type === 'image' ? { ...e, href, placeholder: false } : e)) }));
    } catch { setErr('Could not read that photo.'); }
  };

  const download = async (kind: 'png' | 'pdf') => {
    setBusy(kind); setErr(null);
    try { if (kind === 'png') await exportDesignPng(design, card.name); else await exportDesignPdf(design, card.name); }
    catch { setErr('Sorry — that download failed. Try “Open full editor”.'); }
    finally { setBusy(null); }
  };

  const share = async () => {
    setBusy('share'); setErr(null);
    try {
      const png = await designToPng(design, 2);
      const file = new File([png as BlobPart], `${card.name}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: card.name });
      else { const { saveBlob } = await import('../smart/util.js'); await saveBlob(file.name, file); }
    } catch (e) { if (!(e instanceof Error && e.name === 'AbortError')) setErr('Could not open the share sheet — use Download instead.'); }
    finally { setBusy(null); }
  };

  const whatsapp = async () => {
    setBusy('wa'); setErr(null);
    try {
      const png = await designToPng(design, 2);
      const file = new File([png as BlobPart], `${card.name}.png`, { type: 'image/png' });
      const r = await shareToWhatsApp({ file, text: `${card.name} 🎉` });
      if (r === 'downloaded') setErr('Card saved — attach it in WhatsApp to send.');
      else if (r === 'failed') setErr('Could not open WhatsApp — use Download instead.');
    } catch { setErr('Could not prepare the card.'); }
    finally { setBusy(null); }
  };

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner qcard-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head">
          <button className="qcard-back" onClick={onClose}>← <span>Back to designs</span></button>
          <strong>✨ Personalise &amp; send</strong>
          <button className="brand-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="resume-body qcard-body">
          <div className="qcard-preview"><img src={uri(design)} alt={card.name} /></div>
          <div className="qcard-fields">
            <p className="studio-hint">Ready to send — just make it yours. Edit the words{photo ? ', add your photo' : ''}, then download or share. Want full control? Open the editor.</p>
            {texts.map((t) => (
              <label key={t.id} className="qcard-field">
                <span>{firstLine(t.text)}</span>
                <span className="qcard-input">
                  <textarea rows={t.text.includes('\n') ? 2 : 1} value={t.text} onChange={(e) => setText(t.id, e.target.value)} />
                  <MicButton onText={(v) => setText(t.id, v)} />
                </span>
              </label>
            ))}
            {photo && (
              <div className="qcard-photo">
                <TkxButton variant="outline" size="sm" onClick={() => fileRef.current?.click()}>🖼️ {photo.href ? 'Change photo' : 'Add your photo'}</TkxButton>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void addPhoto(f); }} />
              </div>
            )}
            {err && <span className="cmp-row-note cmp-row-note--warn">{err}</span>}
          </div>
        </div>
        <div className="resume-foot qcard-foot">
          <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={!!busy} onClick={() => void download('png')}>{busy === 'png' ? 'Working…' : '⤓ Image'}</TkxButton>
          <TkxButton variant="outline" size="sm" disabled={!!busy} onClick={() => void download('pdf')}>{busy === 'pdf' ? 'Working…' : '⤓ PDF'}</TkxButton>
          <TkxButton variant="solid" size="sm" className="qcard-wa" disabled={!!busy} onClick={() => void whatsapp()}>{busy === 'wa' ? 'Working…' : '📲 WhatsApp'}</TkxButton>
          <TkxButton variant="outline" size="sm" disabled={!!busy} onClick={() => void share()}>{busy === 'share' ? 'Working…' : '📤 Share'}</TkxButton>
          <TkxButton variant="ghost" size="sm" onClick={() => onOpenStudio(card.name, design, card.anim)}>Open full editor →</TkxButton>
        </div>
      </div>
    </div>
  );
}
