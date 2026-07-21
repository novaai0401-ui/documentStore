/**
 * Native slide editor for PowerPoint (.pptx) and OpenDocument Presentation
 * (.odp). Edit each slide's title and bullet text in place, add/remove/reorder
 * slides, and save back to .pptx — or convert to PDF. Built on our own pptx
 * writer (pagesToPptx) and reader, so it round-trips in the browser.
 */
import { useState, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { TkxButton, TkxSelect, TkxInput } from 'tekivex-ui';
import { downloadBytes } from '../smart/util.js';
import { type Slide, type SlideLayout } from '../smart/convert.js';
import { bulletLevel } from '../smart/pptxExport.js';
import { slidesToPdf } from '../smart/slidesPdf.js';
import { buildPptx as buildPptxOffloaded } from '../workers/officeClient.js';
import { AiAssistant } from './AiAssistant.js';
import { useBrandThemes } from './tools/useBrandThemes.js';
import { BrandButton } from './tools/BrandButton.js';
import { ToolPalette } from './tools/ToolPalette.js';
import type { InsertContent } from './tools/insertTools.js';
import { SaveTemplateButton } from './tools/SaveTemplateButton.js';
import { useAutosave } from '../persist/useAutosave.js';
import { Icon } from '../icons.js';
import { VersionHistoryModal } from '../VersionHistoryModal.js';
import { useCollabMap } from '../collab/useCollabMap.js';
import { useShareLink } from '../collab/useShareLink.js';
import { CollabBar } from '../collab/CollabBar.js';
import type { Room } from '../collab/link.js';

interface Props {
  name: string;
  slides: Slide[];
  /** The original .pptx bytes when the deck was opened from a user's file — used
   *  to preserve their layout/images/theme on save (only text is patched). */
  original?: Uint8Array;
  onOpenInPdf: (bytes: Uint8Array, name: string) => void;
  initialThemeId?: string;
  docId?: string;
  /** When set, the editor joins this live collaboration room on mount. */
  collabRoom?: Room;
}

/** A deck is synced as one LWW key per slide field, plus a count, so two people
 *  editing different slides never conflict. */
const slidesToEntries = (sl: Slide[]): Record<string, string> => {
  const e: Record<string, string> = { 'meta:count': String(sl.length) };
  sl.forEach((s, i) => { e[`s${i}:title`] = s.title; e[`s${i}:body`] = s.body.join('\n'); e[`s${i}:notes`] = s.notes ?? ''; e[`s${i}:layout`] = s.layout ?? ''; });
  return e;
};
const entriesToSlides = (e: Record<string, string>): Slide[] => {
  let count = Number(e['meta:count']);
  if (!Number.isFinite(count) || count < 1) {
    count = 1;
    for (const k of Object.keys(e)) { const m = /^s(\d+):/.exec(k); if (m) count = Math.max(count, Number(m[1]) + 1); }
  }
  const out: Slide[] = [];
  for (let i = 0; i < count; i++) out.push({ title: e[`s${i}:title`] ?? '', body: (e[`s${i}:body`] ?? '').split('\n'), notes: e[`s${i}:notes`] || undefined, layout: (e[`s${i}:layout`] as SlideLayout) || undefined });
  return out;
};

/** Render a body line array as nested bullets for the live preview. */
function bulletMarker(level: number): string { return ['•', '◦', '▪', '‣', '·'][Math.min(level, 4)]!; }

export function SlideEditor({ name, slides: initial, original, onOpenInPdf, initialThemeId, docId, collabRoom }: Props) {
  const [slides, setSlides] = useState<Slide[]>(initial.length ? initial : [{ title: 'Slide 1', body: [] }]);
  const originalRef = useRef(original && original.length ? original : undefined);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [ai, setAi] = useState(false);
  const [themeId, setThemeId] = useState(initialThemeId ?? 'clean');
  const { themes, resolve, reload } = useBrandThemes();
  const theme = resolve(themeId);
  const { room, isHost, copied, share, copyLink } = useShareLink('slides', collabRoom);

  // Live collaboration. Text edits broadcast just the touched slide's fields;
  // structural changes (add/remove/reorder) broadcast the whole deck snapshot.
  const collab = useCollabMap({
    room, name: 'You', isHost,
    seed: () => slidesToEntries(slides),
    onRemote: (e) => { const ns = entriesToSlides(e); setSlides(ns); setActive((a) => Math.min(a, ns.length - 1)); },
  });
  // Apply a structural change to the deck and broadcast the new snapshot.
  const commit = (next: Slide[], nextActive: number) => {
    setSlides(next);
    setActive(Math.max(0, Math.min(nextActive, next.length - 1)));
    if (room) collab.set(slidesToEntries(next));
  };
  const dupSlide = () => commit([...slides.slice(0, active + 1), { ...slides[active]!, body: [...slides[active]!.body] }, ...slides.slice(active + 1)], active + 1);

  const cur = slides[Math.min(active, slides.length - 1)]!;
  const update = (patch: Partial<Slide>) => {
    setSlides((s) => s.map((sl, i) => (i === active ? { ...sl, ...patch } : sl)));
    if (room) {
      const u: Record<string, string> = {};
      if (patch.title != null) u[`s${active}:title`] = patch.title;
      if (patch.body != null) u[`s${active}:body`] = patch.body.join('\n');
      if (patch.notes != null) u[`s${active}:notes`] = patch.notes;
      if (patch.layout != null) u[`s${active}:layout`] = patch.layout;
      collab.set(u);
    }
  };
  // Tab / Shift+Tab indent the current body line (leading tabs encode level).
  const indentOnTab = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const ta = e.currentTarget;
    const { selectionStart, value } = ta;
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    if (e.shiftKey) {
      if (value[lineStart] !== '\t') return;
      const nv = value.slice(0, lineStart) + value.slice(lineStart + 1);
      update({ body: nv.split('\n') });
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = Math.max(lineStart, selectionStart - 1); });
    } else {
      const nv = value.slice(0, lineStart) + '\t' + value.slice(lineStart);
      update({ body: nv.split('\n') });
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = selectionStart + 1; });
    }
  };
  const addSlide = () => commit([...slides.slice(0, active + 1), { title: `Slide ${slides.length + 1}`, body: [] }, ...slides.slice(active + 1)], active + 1);
  const delSlide = () => { if (slides.length <= 1) return; commit(slides.filter((_, i) => i !== active), active - 1); };
  const move = (dir: -1 | 1) => {
    const j = active + dir;
    if (j < 0 || j >= slides.length) return;
    const n = [...slides]; [n[active], n[j]] = [n[j]!, n[active]!];
    commit(n, j);
  };

  // A non-default theme styles the exported deck (background, text, accent).
  const pptxTheme = themeId === 'clean' ? undefined : { bg: theme.bg, fg: theme.fg, heading: theme.heading, accent: theme.accent };
  const slidePdfTheme = themeId === 'clean' ? undefined : { bg: theme.bg, fg: theme.fg, heading: theme.heading, accent: theme.accent };
  useAutosave(docId, () => (docId ? { id: docId, name, ext: 'pptx', kind: 'slides', updatedAt: Date.now(), themeId, content: { slides, bytes: originalRef.current } } : null), [slides, themeId, name, docId]);

  // Built off the main thread (worker) with an inline fallback.
  // If the deck came from the user's own .pptx and they only edited text (no
  // slides added/removed), patch the original so their layout/images/theme are
  // preserved exactly. Otherwise build a fresh deck from the model.
  const pptxBytes = async () => {
    const orig = originalRef.current;
    if (orig) {
      const { pptxCountsMatch, patchPptxText } = await import('../smart/pptxPatch.js');
      if (await pptxCountsMatch(orig, slides.length)) return patchPptxText(orig, slides.map((s) => ({ title: s.title, body: s.body })));
    }
    return buildPptxOffloaded(slides, pptxTheme);
  };
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };

  // A slide-template snippet inserts a new slide right after the current one.
  const insertContent = (c: InsertContent) => {
    if (!c.slide) return;
    const slide: Slide = { title: c.slide.title, body: [...c.slide.body] };
    commit([...slides.slice(0, active + 1), slide, ...slides.slice(active + 1)], active + 1);
  };

  return (
    <div className="ed">
      <div className="ed-bar">
        <span className="ed-kind">Slides · {name}.pptx · {slides.length} slide{slides.length === 1 ? '' : 's'}</span>
        <div className="ed-actions">
          <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy} onClick={() => run(async () => downloadBytes(`${name}.pptx`, await pptxBytes(), 'application/vnd.openxmlformats-officedocument.presentationml.presentation'))}>Save PowerPoint</TkxButton>
          <TkxButton variant="outline" size="sm" disabled={busy} onClick={() => run(async () => downloadBytes(`${name}.pdf`, await slidesToPdf(slides, slidePdfTheme), 'application/pdf'))}>Download PDF</TkxButton>
          <TkxButton variant="ghost" size="sm" disabled={busy} onClick={() => run(async () => onOpenInPdf(await slidesToPdf(slides, slidePdfTheme), name))}>Open in PDF editor</TkxButton>
          {!room && <TkxButton variant="outline" size="sm" onClick={() => void share()} title="Create a private link to edit this deck together in real time">🔗 Share</TkxButton>}
          {docId && <TkxButton variant="ghost" size="sm" onClick={() => setShowHistory(true)} title="Save and restore versions">🕑 History</TkxButton>}
          <SaveTemplateButton defaultName={name} getSeed={() => ({ name, ext: 'pptx', kind: 'slides', slides: slides.map((s) => ({ title: s.title, body: [...s.body] })), theme: themeId })} />
          <TkxButton variant={ai ? 'solid' : 'outline'} colorScheme="primary" size="sm" onClick={() => setAi((v) => !v)}>✦ AI</TkxButton>
        </div>
      </div>
      {room && <CollabBar room={room} peers={collab.peers} ready={collab.ready} relayStatus={collab.relayStatus} copied={copied} onCopy={() => void copyLink()} />}
      <div className="ed-slide-tools" role="toolbar">
        <ToolPalette kind="slide" onInsert={insertContent} label="＋ Slide template" />
        <span className="ed-rt-sep" />
        <span className="ed-tool-label">Theme</span>
        <TkxSelect size="sm" value={themeId} options={themes.map((t) => ({ value: t.id, label: t.name }))} onChange={(v) => setThemeId(v as string)} />
          <BrandButton onChange={reload} />
        <span className="ed-rt-sep" />
        <button onClick={addSlide}>＋ Slide</button>
        <button onClick={dupSlide}>⧉ Duplicate</button>
        <button onClick={delSlide} disabled={slides.length <= 1}>🗑 Delete</button>
        <button onClick={() => move(-1)} disabled={active === 0}>↑ Up</button>
        <button onClick={() => move(1)} disabled={active === slides.length - 1}>↓ Down</button>
      </div>
      <div className="ed-body-row">
      <div className="ed-slides">
        <aside className="ed-slide-list">
          {slides.map((s, i) => (
            <button key={i} className={'ed-slide-thumb' + (i === active ? ' ed-slide-thumb--active' : '')} onClick={() => setActive(i)} style={{ background: theme.bg }}>
              <span className="ed-slide-thumb-n">{i + 1}</span>
              <span className="ed-slide-thumb-t" style={{ color: theme.heading }}>{s.title || '(untitled)'}</span>
            </button>
          ))}
        </aside>
        <div className="ed-slide-stage">
          {/* Live 16:9 preview — exactly what exports to PDF (layout, bullets, image). */}
          {(() => {
            const layout = cur.layout ?? 'titleContent';
            const bullets = (
              <div className="ed-slide-preview-body" style={{ color: theme.fg }}>
                {cur.body.some((l) => l.trim())
                  ? cur.body.map((line, i) => {
                    const lvl = bulletLevel(line); const text = line.replace(/^\t+/, '');
                    return text.trim()
                      ? <div key={i} className="ed-slide-pv-bullet" style={{ paddingLeft: lvl * 26 }}><span className="ed-slide-pv-mark" style={{ color: theme.accent }}>{bulletMarker(lvl)}</span>{text}</div>
                      : <div key={i} className="ed-slide-pv-gap" />;
                  })
                  : <span className="ed-slide-ph">Bullet points appear here…</span>}
              </div>
            );
            if (layout === 'title' || layout === 'section') {
              return (
                <div className={'ed-slide-preview ed-slide-preview--center' + (layout === 'section' ? ' ed-slide-preview--section' : '')} style={{ background: theme.bg, fontFamily: theme.fontBody }}>
                  <div className="ed-slide-pv-bigtitle" style={{ color: theme.heading, fontFamily: theme.fontHeading }}>{cur.title || <span className="ed-slide-ph">Slide title</span>}</div>
                  {layout === 'section' && <div className="ed-slide-pv-rule" style={{ background: theme.accent }} />}
                  {cur.body.find((b) => b.trim()) && <div className="ed-slide-pv-sub" style={{ color: theme.fg }}>{cur.body.find((b) => b.trim())!.replace(/^\t+/, '')}</div>}
                </div>
              );
            }
            return (
              <div className="ed-slide-preview" style={{ background: theme.bg, fontFamily: theme.fontBody }}>
                {layout !== 'blank' && (
                  <div className="ed-slide-preview-title" style={{ color: theme.heading, fontFamily: theme.fontHeading, borderBottom: `3px solid ${theme.accent}` }}>
                    {cur.title || <span className="ed-slide-ph">Slide title</span>}
                  </div>
                )}
                {layout === 'imageRight'
                  ? <div className="ed-slide-pv-split">{bullets}{cur.image ? <img className="ed-slide-pv-img" src={cur.image} alt="" /> : <div className="ed-slide-pv-imgph">Add an image →</div>}</div>
                  : bullets}
              </div>
            );
          })()}

          {/* Editing fields */}
          <div className="ed-slide-fields">
            <div className="ed-slide-fields-head">✎ Edit this slide</div>
            <div className="ed-slide-layout-row">
              <TkxSelect
                className="ed-slide-layout"
                label="Layout"
                value={cur.layout ?? 'titleContent'}
                options={[
                  // No "&" in these labels: tekivex escapes it and React escapes
                  // again, so users would see a literal "&amp;".
                  { value: 'titleContent', label: 'Title + bullets' },
                  { value: 'imageRight', label: 'Bullets + image' },
                  { value: 'title', label: 'Title slide' },
                  { value: 'section', label: 'Section header' },
                  { value: 'blank', label: 'Blank' },
                ]}
                onChange={(v) => update({ layout: v as string as SlideLayout })}
              />
              <label className="ed-slide-imgbtn"><Icon name="image" size={15} /> {cur.image ? 'Replace image' : 'Add image'}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { const rd = new FileReader(); rd.onload = () => update({ image: String(rd.result), layout: cur.layout && cur.layout !== 'titleContent' ? cur.layout : 'imageRight' }); rd.readAsDataURL(f); } }} />
              </label>
              {cur.image && <button className="ed-slide-imgrm" onClick={() => update({ image: undefined })}>✕ Remove image</button>}
            </div>
            <TkxInput
              label="Slide title"
              className="ed-slide-field-title"
              value={cur.title}
              placeholder="Slide title"
              onChange={(e) => update({ title: e.target.value })}
            />
            <label className="ed-slide-notes-label">Bullet points
              <textarea
                className="ed-slide-field-body"
                value={cur.body.join('\n')}
                placeholder="One bullet per line · press Tab to indent (sub-bullet), Shift+Tab to outdent"
                onChange={(e) => update({ body: e.target.value.split('\n') })}
                onKeyDown={indentOnTab}
              />
            </label>
            <label className="ed-slide-notes-label"><span className="ed-slide-notes-title"><Icon name="notes" size={14} /> Speaker notes</span>
              <textarea
                className="ed-slide-field-notes"
                value={cur.notes ?? ''}
                placeholder="Notes for the presenter (not shown on the slide)…"
                onChange={(e) => update({ notes: e.target.value })}
              />
            </label>
          </div>
        </div>
      </div>
        {ai && (
          <AiAssistant
            kind="slide deck"
            getContext={() => slides.map((s, i) => `Slide ${i + 1}: ${s.title}\n${s.body.join('\n')}`).join('\n\n')}
            onInsert={(t) => {
              const lines = t.split('\n').map((l) => l.replace(/^[-*•]\s*/, '').trim()).filter(Boolean);
              const slide: Slide = { title: lines[0] ?? `Slide ${slides.length + 1}`, body: lines.slice(1) };
              commit([...slides, slide], slides.length);
            }}
            onClose={() => setAi(false)}
            quickActions={[
              { label: 'Summarize deck', prompt: 'Summarize the key message of this deck in 3 bullets.' },
              { label: 'Add a closing slide', prompt: 'Write a strong closing/summary slide for this deck: a title line, then 3 bullet points.' },
              { label: 'Expand this slide', prompt: `Expand the current slide ("${cur.title}") into clearer, fuller bullet points. Return a title line then bullets.` },
              { label: 'Speaker notes', prompt: `Write concise speaker notes for the slide titled "${cur.title}".` },
            ]}
          />
        )}
      </div>
      {showHistory && docId && (
        <VersionHistoryModal docId={docId} currentContent={() => ({ slides })} onRestore={(c) => { if (c.slides) { setSlides(c.slides); setActive(0); } }} onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
}
