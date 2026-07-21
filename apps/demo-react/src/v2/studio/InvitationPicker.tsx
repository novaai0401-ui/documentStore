/**
 * Cards gallery — ONE place to browse every card the app makes: animated
 * greeting cards, invitations, quote & festival cards. Pick an occasion, tap a
 * design and it opens in the studio to customise, download (PNG/PDF) and share.
 * Thumbnails render the real Design via designToSvg, so the preview is exactly
 * what opens. The catalog is assembled in cardCatalog.ts.
 */
import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { TkxButton } from 'tekivex-ui';
import { useLang } from '../../i18n.js';
import type { AnimPreset } from './animate.js';
import { designToSvg, type Design } from './model.js';
import { CARD_CATALOG, cardsForOccasion, activeOccasions, subtypesForOccasion, type CardEntry } from './cardCatalog.js';
import { CARD_LANGS } from './regionalCards.js';
import { AdSlot, adsEnabled } from '../ads/AdSlot.js';
import { QuickCardSheet } from './QuickCardSheet.js';

const AD_EVERY = 8; // weave an in-feed ad after every N cards (only when ads are on)

const svgDataUri = (d: Design) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(designToSvg(d));

export function InvitationPicker({ onClose, onPick, initialCat, onCat, onBlank, onAnimated, onCollage, onDescribe }: {
  onClose: () => void;
  onPick: (name: string, design: Design, anim?: AnimPreset) => void;
  initialCat?: string;
  onCat?: (occasion: string) => void;
  // "Create your own" entry points — this gallery is the single Cards hub, so it
  // also launches the blank canvas, AI designer, animated-wish and collage makers.
  onBlank?: () => void;
  onAnimated?: () => void;
  onCollage?: () => void;
  onDescribe?: () => void;
}) {
  const occasions = useMemo(() => activeOccasions(), []);
  // Deep-link: open straight to an occasion tab when one is given (and valid).
  const [cat, setCat] = useState(initialCat && occasions.includes(initialCat) ? initialCat : 'All');
  // Second-level navigation: the sub-type within the occasion (e.g. Birthday →
  // Kids / Milestone / Photo). 'All' shows every design in the occasion.
  const [sub, setSub] = useState('All');
  // Reflect the chosen occasion to the host (keeps the URL shareable/deep-linkable).
  const pickCat = (c: string) => { setCat(c); setSub('All'); onCat?.(c); };
  // Follow the occasion when it changes from outside (e.g. browser Back/Forward
  // on a deep-linked /…?cards=<occasion> URL), so the visible tab stays in sync.
  useEffect(() => { if (initialCat && occasions.includes(initialCat)) { setCat(initialCat); setSub('All'); } }, [initialCat, occasions]);
  const subs = useMemo(() => subtypesForOccasion(cat), [cat]);
  const lang = useLang();
  // "Cards in your language" — independent of the app UI language, because an
  // English-UI Marathi speaker still wants मराठी cards. Persisted so the choice
  // sticks across visits. Empty string = follow the app language.
  const [cardLang, setCardLang] = useState<string>(() => { try { return localStorage.getItem('pyntra:cardLang') ?? ''; } catch { return ''; } });
  const pickLang = (v: string) => { setCardLang(v); try { localStorage.setItem('pyntra:cardLang', v); } catch { /* */ } };
  const effLang = cardLang || lang;
  // Build each design once for the thumbnail (every card, all languages) so
  // switching occasion/language just reuses the cache.
  const thumbs = useMemo(() => new Map(CARD_CATALOG.map((c) => [c.id, svgDataUri(c.make())])), []);
  const shown = useMemo(() => cardsForOccasion(cat, sub, effLang), [cat, sub, effLang]);
  const ads = adsEnabled();
  // Tapping a card opens the "ready to send" quick sheet (personalise → share);
  // the full editor is one click away from there.
  const [quick, setQuick] = useState<CardEntry | null>(null);

  const open = (c: CardEntry) => setQuick(c);

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner inv-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>💌 Cards &amp; Invitations</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <p className="studio-hint">Every card in one place — animated greetings, invitations, quotes &amp; festival cards. Pick an occasion and tap a design to make it yours, or start your own below.</p>

          {(onBlank || onDescribe || onAnimated || onCollage) && (
            <div className="inv-create">
              <span className="inv-create-label">Create your own</span>
              <div className="inv-create-row">
                {onDescribe && <button className="inv-create-tile" onClick={onDescribe}><span aria-hidden>✨</span> Describe with AI</button>}
                {onBlank && <button className="inv-create-tile" onClick={onBlank}><span aria-hidden>➕</span> Blank card</button>}
                {onAnimated && <button className="inv-create-tile" onClick={onAnimated}><span aria-hidden>🎬</span> Animated wish</button>}
                {onCollage && <button className="inv-create-tile" onClick={onCollage}><span aria-hidden>🖼️</span> Photo collage</button>}
              </div>
            </div>
          )}

          <label className="inv-lang-row">
            <span>🌐 Cards in your language:</span>
            <select className="inv-lang" value={cardLang} onChange={(e) => pickLang(e.target.value)} aria-label="Card language">
              <option value="">Match app language</option>
              <option value="en">English</option>
              {CARD_LANGS.map((l) => <option key={l.code} value={l.code}>{l.native}</option>)}
            </select>
          </label>

          <div className="inv-cats" role="tablist">
            {occasions.map((c) => (
              <button key={c} role="tab" aria-selected={cat === c} className={'inv-cat' + (cat === c ? ' on' : '')} onClick={() => pickCat(c)}>{c === 'Animated' ? '✨ Animated' : c}</button>
            ))}
          </div>

          {subs.length > 0 && (
            <div className="inv-subs" role="tablist" aria-label={`${cat} styles`}>
              {['All', ...subs].map((s) => (
                <button key={s} role="tab" aria-selected={sub === s} className={'inv-sub' + (sub === s ? ' on' : '')} onClick={() => setSub(s)}>{s === 'All' ? `All ${cat}` : s}</button>
              ))}
            </div>
          )}

          <div className="inv-grid">
            {shown.map((c, i) => (
              <Fragment key={c.id}>
                <button className="inv-card" style={{ '--i': i % 12 } as CSSProperties} onClick={() => open(c)} title={`Use “${c.name}”`}>
                  <span className="inv-thumb-wrap">
                    <img className="inv-thumb" src={thumbs.get(c.id)} alt={c.name} loading="lazy" />
                    {c.animated && <span className="inv-anim-badge" aria-label="Animated">✨</span>}
                  </span>
                  <span className="inv-card-name">{c.emoji} {c.name}</span>
                  <span className="inv-card-cat">{c.animated ? 'Animated' : c.category}</span>
                </button>
                {ads && (i + 1) % AD_EVERY === 0 && i + 1 < shown.length && <AdSlot key={`ad-${cat}-${i}`} kind="infeed" />}
              </Fragment>
            ))}
          </div>
        </div>
        <div className="resume-foot">
          <span className="inv-count">{shown.length} designs</span>
          <TkxButton variant="ghost" size="sm" onClick={onClose}>Close</TkxButton>
        </div>
      </div>
      {quick && <QuickCardSheet card={quick} onClose={() => setQuick(null)} onOpenStudio={(name, design, anim) => { setQuick(null); onPick(name, design, anim); }} />}
    </div>
  );
}
