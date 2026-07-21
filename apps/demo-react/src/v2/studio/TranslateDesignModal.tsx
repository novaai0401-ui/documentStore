/**
 * Translate-design modal — pick a language and get a translated copy of the
 * current design (added as a new page, so you build one campaign in many
 * languages). Prefers the browser's on-device Translator API (fully private,
 * offline); falls back to a configured AI endpoint. Logic in translateDesign.ts.
 */
import { useState } from 'react';
import { TkxButton, TkxSelect } from 'tekivex-ui';
import type { Design } from './model.js';
import { translateDesign } from './translateDesign.js';
import { LANGUAGES, onDeviceTranslator, onDeviceTranslationSupported, aiTranslator, onlineTranslator, type LineTranslator } from '../smart/translate.js';
import { loadAiConfig } from '../ai/aiClient.js';

export function TranslateDesignModal({ design, onClose, onTranslated }: { design: Design; onClose: () => void; onTranslated: (translated: Design, lang: string) => void }) {
  const [lang, setLang] = useState('Spanish');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // When the private paths (on-device / AI key) aren't available, we offer an
  // explicit online option rather than silently failing.
  const [offerOnline, setOfferOnline] = useState(false);

  const doTranslate = async (translator: LineTranslator) => {
    setBusy(true); setErr(null);
    try {
      const out = await translateDesign(design, translator);
      onTranslated(out, lang);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Translation failed.'); }
    finally { setBusy(false); }
  };

  const run = async () => {
    setErr(null); setOfferOnline(false);
    let translator = await onDeviceTranslator(lang);
    if (!translator) {
      const cfg = loadAiConfig();
      if (cfg.endpoint && cfg.apiKey) translator = aiTranslator(lang, cfg);
    }
    if (!translator) { setOfferOnline(true); return; } // no private path — offer online (opt-in)
    await doTranslate(translator);
  };

  const runOnline = async () => {
    const translator = onlineTranslator(lang);
    if (!translator) { setErr('This language can’t be translated online.'); return; }
    setOfferOnline(false);
    await doTranslate(translator);
  };

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner cmp-modal vid-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>🌐 Translate design</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <p className="studio-hint">Translate every text layer into another language, keeping the exact layout — added as a new page so one design becomes a multilingual campaign. Uses your browser’s on-device translator when available (nothing uploaded).</p>
          <TkxSelect
            label="Language"
            value={lang}
            options={LANGUAGES.filter((l) => l !== 'English').map((l) => ({ value: l, label: `${l}${onDeviceTranslationSupported(l) ? ' · on-device' : ''}` }))}
            onChange={(v) => setLang(Array.isArray(v) ? v[0] ?? '' : v)}
          />
          {offerOnline && (
            <div className="cmp-row-note" style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', color: '#92400e' }}>
              On-device translation isn’t available in this browser. You can translate <strong>online</strong> instead — this is the one action that sends your text (only the text, nothing else) to a free translation service. Prefer to stay fully private? Add your own AI endpoint in Settings.
              <div style={{ marginTop: 8 }}>
                <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy} onClick={() => void runOnline()}>{busy ? 'Translating…' : '🌐 Translate online'}</TkxButton>
              </div>
            </div>
          )}
          {err && <span className="cmp-row-note cmp-row-note--warn">{err}</span>}
        </div>
        <div className="resume-foot">
          <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy} onClick={() => void run()}>{busy ? 'Translating…' : 'Translate → new page'}</TkxButton>
          <TkxButton variant="ghost" size="sm" onClick={onClose}>Cancel</TkxButton>
        </div>
      </div>
    </div>
  );
}
