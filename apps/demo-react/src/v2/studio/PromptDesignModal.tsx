/**
 * Prompt-to-design modal — type what you want, pick a size, and get a finished
 * on-brand design to open in the Studio. Fully on-device (promptDesign.ts);
 * the preview is live SVG. Pulls the active brand kit so output is on-brand.
 */
import { useEffect, useMemo, useState } from 'react';
import { TkxButton, TkxSelect } from 'tekivex-ui';
import { t, useLang } from '../../i18n.js';
import { FORMATS, formatById, designToSvg, type Design } from './model.js';
import { promptToDesign, aiCardToDesign, PROMPT_BACKGROUNDS, type PromptCopy, type AiCardSpec } from './promptDesign.js';
import { generateCardCopy, generateCardDesign, isDesignAiEnabled } from './promptDesignAi.js';
import { getActiveBrandKit, type BrandKit } from './brandStore.js';
import { MicButton } from './MicButton.js';

const EXAMPLES = [
  'Diwali card for my family — gold diyas',
  'Eco-friendly Ganesh Chaturthi card in Marathi',
  'Birthday card for Aisha with balloons',
  'Durga Puja greeting — Maa aschen',
  'Summer sale — 30% off everything',
  'An inspiring quote about growth',
];

export function PromptDesignModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, design: Design) => void }) {
  const lang = useLang();
  const [prompt, setPrompt] = useState('');
  const [formatId, setFormatId] = useState('ig-post');
  const [bgId, setBgId] = useState('auto');
  const [brand, setBrand] = useState<BrandKit | null>(null);
  useEffect(() => { void getActiveBrandKit().then((k) => setBrand(k ?? null)); }, []);
  // Groq-written copy (via the server's own /api/ai proxy). The instant local
  // preview never waits on the network — AI rewrites the words on demand.
  const [aiOn, setAiOn] = useState(false);
  useEffect(() => { void isDesignAiEnabled().then(setAiOn).catch(() => setAiOn(false)); }, []);
  const [copy, setCopy] = useState<PromptCopy | null>(null);
  const [aiSpec, setAiSpec] = useState<AiCardSpec | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const setPromptAndReset = (v: string) => { setPrompt(v); setCopy(null); setAiSpec(null); setAiErr(null); };
  // "Design with AI": the model art-directs the WHOLE card (gradient palette,
  // motifs, typography style, layout, photo slot) as a spec we render locally.
  const designWithAi = async () => {
    setAiBusy(true); setAiErr(null);
    try { setAiSpec(await generateCardDesign(prompt)); }
    catch (e) { setAiErr(e instanceof Error ? e.message : 'AI request failed.'); }
    finally { setAiBusy(false); }
  };
  const writeWithAi = async () => {
    setAiBusy(true); setAiErr(null);
    try { setCopy(await generateCardCopy(prompt)); }
    catch (e) { setAiErr(e instanceof Error ? e.message : 'AI request failed.'); }
    finally { setAiBusy(false); }
  };

  const design = useMemo<Design | null>(() => {
    if (aiSpec) return aiCardToDesign(aiSpec, formatById(formatId));
    return prompt.trim() ? promptToDesign(prompt, { format: formatById(formatId), brand: brand ?? undefined, bgId, copy: copy ?? undefined }) : null;
  }, [prompt, formatId, brand, bgId, copy, aiSpec]);
  const create = () => { if (design) onCreate(prompt.trim().slice(0, 40) || 'AI design', design); };

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner cmp-modal vid-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>✨ {t('pd_title', lang)}</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <p className="studio-hint">{t('pd_desc', lang)}{brand ? ` Using your “${brand.name}” brand kit.` : ''}</p>
          <p className="studio-hint pd-card-hint">🪄 <strong>Making a card?</strong> Describe the <strong>occasion</strong>, the <strong>scene</strong> and the <strong>style</strong> you want — e.g. “Ganesh Chaturthi card, eco-friendly green theme, Marathi wishes” — and AI will design the card for you, ready to edit.</p>
          <span className="mic-wrap">
            <textarea className="studio-text-input" rows={2} value={prompt} placeholder={t('pd_placeholder', lang)} onChange={(e) => setPromptAndReset(e.target.value)} autoFocus />
            <MicButton onText={(v) => setPromptAndReset(prompt ? `${prompt} ${v}` : v)} title="Describe it out loud" />
          </span>
          <div className="pd-examples">
            {EXAMPLES.map((ex) => <button key={ex} type="button" className="pd-chip" onClick={() => setPromptAndReset(ex)}>{ex}</button>)}
          </div>
          {aiOn && (
            <div className="pd-ai-row">
              <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={!prompt.trim() || aiBusy} onClick={() => void designWithAi()}>
                {aiBusy ? '🪄 Designing…' : aiSpec ? '🪄 Design again' : '🪄 Design card with AI'}
              </TkxButton>
              <TkxButton variant="outline" size="sm" disabled={!prompt.trim() || aiBusy || !!aiSpec} onClick={() => void writeWithAi()}>
                {copy ? '✨ Rewrite wording' : '✨ Only improve wording'}
              </TkxButton>
              {aiSpec && !aiBusy && <span className="pd-ai-note">AI designed this card — palette, motifs & layout. Tap again for a new take.</span>}
              {copy && !aiSpec && !aiBusy && <span className="pd-ai-note">AI wording applied — preview updated below.</span>}
              {aiErr && <span className="cmp-row-note cmp-row-note--warn">{aiErr}</span>}
            </div>
          )}
          <TkxSelect
            label={t('pd_size', lang)}
            value={formatId}
            options={FORMATS.map((f) => ({ value: f.id, label: `${f.name} (${f.w}×${f.h})` }))}
            onChange={(val) => setFormatId(Array.isArray(val) ? val[0] : val)}
          />
          <TkxSelect
            label="Background"
            value={bgId}
            options={PROMPT_BACKGROUNDS.map((b) => ({ value: b.id, label: b.label }))}
            onChange={(val) => setBgId(Array.isArray(val) ? val[0] : val)}
          />
          {design && (
            <div className="pd-preview">
              <img src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(designToSvg(design))} alt="Preview" style={{ aspectRatio: `${design.w} / ${design.h}` }} />
            </div>
          )}
        </div>
        <div className="resume-foot">
          <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={!design} onClick={create}>{t('pd_create', lang)}</TkxButton>
          <TkxButton variant="ghost" size="sm" onClick={onClose}>{t('act_cancel', lang)}</TkxButton>
        </div>
      </div>
    </div>
  );
}
