/**
 * Help Center — browse short how-to tutorials for every tool and watch the video
 * (self-hosted mp4, or an unlisted YouTube/Vimeo clip) right inside the app.
 * Every tutorial also lists written steps, so it helps even before a video is
 * recorded. Data lives in tutorials.ts; this only renders it.
 */
import { useMemo, useState } from 'react';
import { TkxButton } from 'tekivex-ui';
import {
  TUTORIALS, TUTORIAL_CATEGORIES, findTutorials, videoEmbedUrl, formatDuration,
  type Tutorial, type TutorialCategory,
} from './tutorials.js';

export function HelpCenterModal({ onClose, initialTool }: { onClose: () => void; initialTool?: string }) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<TutorialCategory | 'All'>('All');
  const [openId, setOpenId] = useState<string | null>(() => (initialTool ? TUTORIALS.find((t) => t.tool === initialTool)?.id ?? null : null));

  const shown = useMemo(() => findTutorials(query, cat === 'All' ? undefined : cat), [query, cat]);
  const open = openId ? TUTORIALS.find((t) => t.id === openId) : null;

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner inv-modal help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head">
          <strong>{open ? <button className="help-back" onClick={() => setOpenId(null)} aria-label="Back">← </button> : null}❔ Help &amp; How-to</strong>
          <button className="brand-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="resume-body">
          {open ? <TutorialView t={open} /> : (
            <>
              <p className="studio-hint">Short guides for every tool — watch the video, or follow the quick steps. New to the app? Start with the welcome tour.</p>
              <input className="help-search" value={query} placeholder="Search help — “card”, “photo”, “reel”…" onChange={(e) => setQuery(e.target.value)} />
              <div className="inv-cats" role="tablist">
                {(['All', ...TUTORIAL_CATEGORIES] as const).map((c) => (
                  <button key={c} role="tab" aria-selected={cat === c} className={'inv-cat' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>
                ))}
              </div>
              <div className="help-grid">
                {shown.map((t) => (
                  <button key={t.id} className="help-card" onClick={() => setOpenId(t.id)}>
                    <span className="help-card-emoji" aria-hidden>{t.emoji}</span>
                    <span className="help-card-body">
                      <strong>{t.title}</strong>
                      <span>{t.blurb}</span>
                      <span className="help-card-meta">
                        {t.video ? '▶ Video' : '📋 Steps'}{formatDuration(t.durationSec) ? ` · ${formatDuration(t.durationSec)}` : ''} · {t.category}
                      </span>
                    </span>
                  </button>
                ))}
                {shown.length === 0 && <p className="rem-empty">No guides match “{query}”.</p>}
              </div>
            </>
          )}
        </div>
        <div className="resume-foot">
          {open && <TkxButton variant="ghost" size="sm" onClick={() => setOpenId(null)}>← All guides</TkxButton>}
          <TkxButton variant="ghost" size="sm" onClick={onClose}>Close</TkxButton>
        </div>
      </div>
    </div>
  );
}

function TutorialView({ t }: { t: Tutorial }) {
  const embed = t.video ? videoEmbedUrl(t.video) : null;
  return (
    <div className="help-view">
      <h3 className="help-view-title">{t.emoji} {t.title}</h3>
      <div className="help-player">
        {embed?.kind === 'file' && (
          <video className="help-video" src={embed.url} poster={embed.poster} controls playsInline preload="metadata" />
        )}
        {embed?.kind === 'iframe' && (
          <iframe className="help-video" src={embed.url} title={t.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen loading="lazy" />
        )}
        {!embed && (
          <div className="help-novideo">
            <span aria-hidden>🎬</span>
            <strong>Video coming soon</strong>
            <span>Follow the quick steps below in the meantime.</span>
          </div>
        )}
      </div>
      <ol className="help-steps">
        {t.steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
    </div>
  );
}
