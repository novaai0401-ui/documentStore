/**
 * Template gallery — pick a starting design by SEEING it, not by reading a
 * name in a dropdown. Every template renders its real artwork as an inline
 * SVG thumbnail (the same designToSvg used by the canvas and exports, so the
 * preview is exactly what you get), filtered by category tabs.
 */
import { useMemo, useState } from 'react';
import { designToSvg } from './model.js';
import { STUDIO_TEMPLATES, TEMPLATE_CATEGORIES, type StudioTemplate, type TemplateCategory } from './templates.js';

export function TemplateGalleryModal({ applied, onPick, onClose }: {
  applied: string | null;
  onPick: (tpl: StudioTemplate) => void;
  onClose: () => void;
}) {
  const [cat, setCat] = useState<'all' | TemplateCategory>('all');
  // Thumbnails render once per open — each is the template's actual artwork.
  const thumbs = useMemo(() => new Map(STUDIO_TEMPLATES.map((tpl) => {
    const d = tpl.make();
    return [tpl.id, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(designToSvg(d))}`] as const;
  })), []);
  const shown = cat === 'all' ? STUDIO_TEMPLATES : STUDIO_TEMPLATES.filter((t) => t.category === cat);

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner cmp-modal tplgal-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>✨ Pick a template</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="tplgal-tabs" role="tablist" aria-label="Template categories">
          {(['all', ...TEMPLATE_CATEGORIES] as const).map((c) => (
            <button key={c} role="tab" aria-selected={cat === c} className={'tplgal-tab' + (cat === c ? ' tplgal-tab--sel' : '')} onClick={() => setCat(c)}>
              {c === 'all' ? 'All' : c}
            </button>
          ))}
        </div>
        <div className="tplgal-grid resume-body">
          {shown.map((tpl) => {
            const locked = false;
            return (
              <button
                key={tpl.id}
                className={'tplgal-card' + (tpl.id === applied ? ' tplgal-card--applied' : '') + (locked ? ' tplgal-card--locked' : '')}
                onClick={() => onPick(tpl)}
                title={locked ? `${tpl.name} — Pyntra Pro` : `Use the ${tpl.name} template`}
              >
                {/* data: URLs have no network cost — loading="lazy" only delays
                    (and in some engines suppresses) the decode. Async decode
                    lets all thumbnails rasterize off the main thread. */}
                <span className="tplgal-thumb"><img src={thumbs.get(tpl.id)} alt="" decoding="async" />{locked && <span className="tplgal-pro" aria-hidden>PRO</span>}</span>
                <span className="tplgal-name">{tpl.icon} {tpl.name}</span>
                <span className="tplgal-sub">{locked ? '🔒 Pro design' : tpl.anim ? '🎬 Animated' : tpl.category}{tpl.id === applied ? ' · ✓ in use' : ''}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
