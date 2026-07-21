/**
 * Multi-format document workspace. Opens each document in a native editor for
 * its type — Word in a rich-text editor, spreadsheets in a grid, slides in a
 * deck editor, text/Markdown in a text editor, PDFs and images in the PDF
 * editor — instead of forcing everything through a PDF conversion. From any
 * editor you can save back to the original format or convert to others. A single
 * global "Open…" button routes by file type. Open documents autosave to an
 * offline library, so a refresh restores your last document and recent work is
 * one click away.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TkxButton, TkxSelect } from 'tekivex-ui';
import { t, tx, setLang, useLang, LANGUAGES, type Lang } from '../i18n.js';
import { getSimple, toggleSimple } from './simpleMode.js';
import { searchLibrary, type LibraryHit } from './persist/librarySearch.js';
import { OPENABLE_ACCEPT, fileToPdf } from './smart/convert.js';
import { TextEditor } from './editors/TextEditor.js';
import { SheetEditor } from './editors/SheetEditor.js';
import { DocxEditor } from './editors/DocxEditor.js';
import { SlideEditor } from './editors/SlideEditor.js';
import type { Slide } from './smart/convert.js';
import { TEMPLATES, type DocTemplate } from './editors/tools/templates.js';
import { customDocTemplates, deleteCustomTemplate, customTemplateIdOf, exportTemplatesJson, importTemplatesJson, loadCustomTemplates } from './editors/tools/customTemplates.js';
import {
  newDocId, saveDoc, loadDoc, duplicateDoc, listRecent, deleteDoc, setLastOpen, getLastOpen,
  type DocMeta, type DocRecord, type DocContent, type StoredKind,
} from './persist/docStore.js';
import { parseShareUrl, isExpired, type Room } from './collab/link.js';
import { parseInviteToken, deviceId } from './collab/invites.js';
import { requestJoin, type JoinFailReason } from './collab/gatedSession.js';
import './editors/workspace.css';
import './responsive.css';
import './enterprise.css';
import './dark.css';
import './simple.css';
import { InstallButton } from './InstallButton.js';
import { Tour, TOUR_DONE_KEY, type TourStep } from './Tour.js';
import { CommandPalette } from './CommandPalette.js';
import type { Command } from './commands.js';
import { applyChoice, loadChoice, nextChoice, watchSystem, type ThemeChoice } from './theme.js';
import { Icon } from './icons.js';

const AppV2 = lazy(() => import('./App.js').then((m) => ({ default: m.AppV2 })));

type Kind = 'pdf' | 'text' | 'sheet' | 'word' | 'slides';
interface Doc { id: string; name: string; ext: string; bytes: Uint8Array; kind: Kind; html?: string; slides?: Slide[]; themeId?: string; collabRoom?: Room }

const SHEET = new Set(['xlsx', 'xls', 'ods', 'csv', 'tsv']);
const TEXT = new Set(['md', 'markdown', 'txt', 'text', 'html', 'htm']);
const IMAGE = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'tif', 'tiff']);

const stripExt = (n: string) => n.replace(/\.[^.]+$/, '') || 'document';
const KIND_ICON: Record<StoredKind, string> = { text: '📝', word: '📄', sheet: '🔢', slides: '🟧', pdf: '📕', design: '🎨' };

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** The home walkthrough — one card per feature area, in reading order. */
const HOME_TOUR: TourStep[] = [
  { target: '', title: '👋 Welcome to Pyntra Docs!', body: 'Everything here runs in your browser — nothing you open or make ever leaves your device. Here’s a quick look around. Skip any time with ✕ or Esc.' },
  { target: '[data-tour="open"]', title: '📂 Open anything', body: 'PDF, Word, Excel, PowerPoint, OpenDocument, images, Markdown… tap Open and it starts in the right editor. Your work autosaves and reopens next visit.' },
  { target: '[data-tour="templates"]', title: '📝 Start from a template', body: 'Letters, reports, invoices, spreadsheets and decks — pick one and just change the words. Save your own for next time.' },
  { target: '[data-tour="open"]', title: '🎉 That’s it!', body: 'One promise to remember: no uploads, no account, no watermark. Replay this tour any time from “🎓 Take the quick tour” on the home page.' },
];

export function Workspace() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [pdf, setPdf] = useState<{ bytes: Uint8Array; name: string; id: string } | null>(null);
  const [simpleOn, setSimpleOn] = useState(() => getSimple());
  const [searchQ, setSearchQ] = useState('');
  const [showTour, setShowTour] = useState(false);
  // First visit: offer the walkthrough once (skippable at any moment).
  useEffect(() => {
    try { if (!localStorage.getItem(TOUR_DONE_KEY)) { const t2 = setTimeout(() => setShowTour(true), 1200); return () => clearTimeout(t2); } } catch { /* */ }
  }, []);
  const [searchHits, setSearchHits] = useState<LibraryHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const lang = useLang();
  // Escape closes the topmost open dialog. Every dismissible `.v2-modal` already
  // uses a click/tap on its backdrop as the dismiss affordance (carrying its own
  // cleanup), so on Escape we trigger that same affordance for keyboard/a11y parity.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[role="listbox"], [role="option"], [role="menu"]')) return;
      const modals = document.querySelectorAll<HTMLElement>('.v2-modal');
      const top = modals[modals.length - 1];
      if (!top) return;
      top.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      top.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  // Gated-join status: while requesting the room key over the handshake, and when
  // a forwarded/invalid invite is refused, so the joiner isn't left on a blank page.
  const [joinState, setJoinState] = useState<'joining' | { failed: JoinFailReason } | null>(null);
  const refreshRecents = useCallback(async () => { setRecents(await listRecent()); }, []);
  const [status, setStatus] = useState<string | null>(null);
  const [tplVer, setTplVer] = useState(0); // re-read custom templates after delete
  const [seq, setSeq] = useState(0); // bumps per opened doc so editors remount
  const [tplMsg, setTplMsg] = useState('');
  const [recents, setRecents] = useState<DocMeta[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const tplFileRef = useRef<HTMLInputElement | null>(null);
  const restoredRef = useRef(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false); // mobile header dropdown
  // Close the mobile menu on tap-away (outside the header).
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => { if (!(e.target as HTMLElement)?.closest?.('.ws-bar')) setMenuOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [menuOpen]);
  // Opening an editor closes the mobile menu so it never overlays content.
  useEffect(() => { setMenuOpen(false); }, [pdf, doc]);
  const [theme, setTheme] = useState<ThemeChoice>('system');

  // Apply the saved theme on mount and follow the OS while set to "system".
  useEffect(() => {
    const choice = loadChoice();
    setTheme(choice);
    applyChoice(choice);
    return watchSystem(() => applyChoice(loadChoice()));
  }, []);
  const cycleTheme = useCallback(() => {
    setTheme((c) => { const next = nextChoice(c); applyChoice(next); return next; });
  }, []);

  // Global ⌘K / Ctrl-K opens the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setPaletteOpen((o) => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const runSearch = useCallback(async () => {
    if (!searchQ.trim()) { setSearchHits(null); return; }
    setSearching(true);
    try { setSearchHits(await searchLibrary(searchQ, 8)); }
    finally { setSearching(false); }
  }, [searchQ]);

  const exportTemplates = () => {
    const blob = new Blob([exportTemplatesJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pyntra-templates.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importTemplates = (file: File) => {
    file.text().then((txt) => {
      try { const n = importTemplatesJson(txt, 'merge'); setTplVer((v) => v + 1); setTplMsg(`Imported ${n} template${n === 1 ? '' : 's'}.`); }
      catch (e) { setTplMsg(e instanceof Error ? e.message : 'Import failed'); }
    });
  };

  // Reconstruct an editor from a stored record (also used for session restore).
  const showRecord = useCallback((rec: DocRecord) => {
    setSeq((s) => s + 1);
    void setLastOpen(rec.id);
    const c = rec.content;
    if (rec.kind === 'pdf') { setDoc(null); setPdf({ bytes: c.bytes ?? new Uint8Array(), name: rec.name, id: rec.id }); return; }
    setPdf(null);
    if (rec.kind === 'word') { setDoc({ id: rec.id, name: rec.name, ext: 'docx', bytes: new Uint8Array(), kind: 'word', html: c.html ?? '', themeId: rec.themeId }); return; }
    if (rec.kind === 'slides') { setDoc({ id: rec.id, name: rec.name, ext: 'pptx', bytes: c.bytes ?? new Uint8Array(), kind: 'slides', slides: c.slides ?? [], themeId: rec.themeId }); return; }
    if (rec.kind === 'sheet') { setDoc({ id: rec.id, name: rec.name, ext: rec.ext || 'xlsx', bytes: c.bytes ?? new Uint8Array(), kind: 'sheet', themeId: rec.themeId }); return; }
    setDoc({ id: rec.id, name: rec.name, ext: rec.ext, bytes: new TextEncoder().encode(c.text ?? ''), kind: 'text', themeId: rec.themeId });
  }, []);

  // Persist a freshly opened/created document, then show it (editors keep it
  // updated via autosave). Returns the new id.
  const persistAndShow = useCallback(async (d: Omit<Doc, 'id'>, content: DocContent) => {
    const id = newDocId();
    setPdf(null);
    setSeq((s) => s + 1);
    setDoc({ ...d, id });
    await saveDoc({ id, name: d.name, ext: d.ext, kind: d.kind as StoredKind, updatedAt: Date.now(), themeId: d.themeId, content });
    await setLastOpen(id);
    void refreshRecents();
  }, [refreshRecents]);

  const openInPdf = useCallback((bytes: Uint8Array, name: string) => {
    const id = newDocId();
    setDoc(null);
    setSeq((s) => s + 1);
    setPdf({ bytes, name, id });
    void saveDoc({ id, name, ext: 'pdf', kind: 'pdf', updatedAt: Date.now(), content: { bytes } }).then(() => { void setLastOpen(id); void refreshRecents(); });
  }, [refreshRecents]);

  // On first mount: join a shared link if the URL carries one, else restore the
  // last session. Always refresh the recents list.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    (async () => {
      const joinRoom = parseShareUrl(window.location.href);
      if (joinRoom && !isExpired(joinRoom)) {
        // Gated (keyless) link: ask the host for the room key over the handshake
        // BEFORE opening anything. A forwarded/invalid invite is refused here, so
        // the key never reaches a device the host didn't admit.
        if (joinRoom.gated && !joinRoom.key) {
          const token = parseInviteToken(window.location.href);
          if (!token) { setJoinState({ failed: 'unknown-token' }); return; }
          setJoinState('joining');
          const res = await requestJoin({ roomId: joinRoom.roomId, token, deviceId: deviceId() });
          if (!res.ok) { setJoinState({ failed: res.reason }); return; }
          joinRoom.key = res.roomKeyB64;
          setJoinState(null);
        }
        setSeq((s) => s + 1);
        setPdf(null);
        const id = newDocId();
        const empty = new Uint8Array();
        const shared: Doc =
          joinRoom.kind === 'word' ? { id, name: 'shared-doc', ext: 'docx', bytes: empty, kind: 'word', html: '', collabRoom: joinRoom }
          : joinRoom.kind === 'sheet' ? { id, name: 'shared-sheet', ext: 'xlsx', bytes: empty, kind: 'sheet', collabRoom: joinRoom }
          : joinRoom.kind === 'slides' ? { id, name: 'shared-deck', ext: 'pptx', bytes: empty, kind: 'slides', slides: [], collabRoom: joinRoom }
          : { id, name: 'shared-note', ext: 'md', bytes: empty, kind: 'text', collabRoom: joinRoom };
        setDoc(shared);
        void refreshRecents();
        return;
      }
      await refreshRecents();
      const last = await getLastOpen();
      if (last) { const rec = await loadDoc(last); if (rec) showRecord(rec); }
    })();
  }, [refreshRecents, showRecord]);

  const reopenRecent = useCallback(async (id: string) => {
    const rec = await loadDoc(id);
    if (rec) showRecord(rec);
  }, [showRecord]);

  const removeRecent = useCallback(async (id: string) => {
    await deleteDoc(id);
    void refreshRecents();
  }, [refreshRecents]);

  const duplicateRecent = useCallback(async (id: string) => {
    const newId = await duplicateDoc(id);
    await refreshRecents();
    if (newId) { const rec = await loadDoc(newId); if (rec) showRecord(rec); }
  }, [refreshRecents, showRecord]);

  // Start a brand-new document from a template (no file to open).
  const openTemplate = useCallback(async (t: DocTemplate) => {
    const seed = t.make();
    const themeId = seed.theme;
    if (seed.kind === 'word') { await persistAndShow({ name: seed.name, ext: 'docx', bytes: new Uint8Array(), kind: 'word', html: seed.html ?? '', themeId }, { html: seed.html ?? '' }); return; }
    if (seed.kind === 'slides') { await persistAndShow({ name: seed.name, ext: 'pptx', bytes: new Uint8Array(), kind: 'slides', slides: seed.slides ?? [], themeId }, { slides: seed.slides ?? [] }); return; }
    if (seed.kind === 'sheet') {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(seed.rows ?? [['']]), 'Sheet1');
      const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
      await persistAndShow({ name: seed.name, ext: 'xlsx', bytes, kind: 'sheet', themeId }, { bytes });
      return;
    }
    const text = seed.text ?? '';
    await persistAndShow({ name: seed.name, ext: seed.ext, bytes: new TextEncoder().encode(text), kind: 'text', themeId }, { text });
  }, [persistAndShow]);

  const open = useCallback(async (file: File) => {
    const ext = (file.name.split('.').pop() ?? '').toLowerCase();
    const name = stripExt(file.name);
    setStatus(`Opening ${file.name}…`);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      if (ext === 'pdf' || file.type === 'application/pdf') { openInPdf(buf, name); }
      else if (SHEET.has(ext)) { await persistAndShow({ name, ext, bytes: buf, kind: 'sheet' }, { bytes: buf }); }
      else if (ext === 'docx') { const { docxToEditableHtml } = await import('./smart/docxRich.js'); const html = await docxToEditableHtml(buf); await persistAndShow({ name, ext, bytes: buf, kind: 'word', html }, { html }); }
      else if (ext === 'odt') { const { odtToEditableHtml } = await import('./smart/odf.js'); const html = await odtToEditableHtml(buf); await persistAndShow({ name, ext: 'docx', bytes: buf, kind: 'word', html }, { html }); }
      else if (ext === 'rtf') { const { rtfToText } = await import('./smart/rtf.js'); const text = rtfToText(new TextDecoder().decode(buf)); await persistAndShow({ name, ext: 'txt', bytes: new TextEncoder().encode(text), kind: 'text' }, { text }); }
      else if (ext === 'pptx') { const { pptxToSlides } = await import('./smart/convert.js'); const slides = await pptxToSlides(buf); await persistAndShow({ name, ext, bytes: buf, kind: 'slides', slides }, { slides, bytes: buf }); }
      else if (ext === 'odp') { const { odpToSlides } = await import('./smart/odf.js'); const slides = await odpToSlides(buf); await persistAndShow({ name, ext: 'pptx', bytes: buf, kind: 'slides', slides }, { slides }); }
      else if (TEXT.has(ext)) { await persistAndShow({ name, ext, bytes: buf, kind: 'text' }, { text: new TextDecoder().decode(buf) }); }
      else if (IMAGE.has(ext) || file.type.startsWith('image/')) {
        // Images open in the PDF editor (placed on a page to annotate/edit).
        const converted = await fileToPdf(file);
        if (converted) openInPdf(converted.bytes, converted.name);
      } else {
        const converted = await fileToPdf(file);
        if (converted) openInPdf(converted.bytes, converted.name);
        else openInPdf(buf, name);
      }
      setStatus(null);
    } catch (e) {
      setStatus(`Couldn’t open ${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [openInPdf, persistAndShow]);

  const formatLabel = pdf ? 'PDF' : doc?.kind === 'word' ? 'Word' : doc?.kind === 'sheet' ? 'Spreadsheet' : doc?.kind === 'slides' ? 'Slides' : doc?.kind === 'text' ? 'Text' : null;

  const goLibrary = useCallback(() => { setDoc(null); setPdf(null); void refreshRecents(); }, [refreshRecents]);
  const themeLabel = theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System';
  const themeIconName = theme === 'light' ? 'themeLight' : theme === 'dark' ? 'themeDark' : 'themeSystem';

  // Actions surfaced in the ⌘K command palette.
  const commands: Command[] = [
    { id: 'open', title: 'Open a file', hint: '⌘O', group: 'Document', keywords: 'import pdf word excel powerpoint upload odt rtf markdown', run: () => inputRef.current?.click() },
    { id: 'library', title: 'Go to library', group: 'Go', keywords: 'home recent documents', run: goLibrary },
    { id: 'theme', title: `Switch theme (now: ${themeLabel})`, group: 'View', keywords: 'dark light mode appearance', run: cycleTheme },
    ...TEMPLATES.map((t): Command => ({ id: `tpl-${t.id}`, title: `New: ${t.name}`, group: 'Templates', keywords: `${t.kind} template document`, run: () => void openTemplate(t) })),
    ...recents.slice(0, 6).map((m): Command => ({ id: `recent-${m.id}`, title: m.name, hint: ago(m.updatedAt), group: 'Recent', keywords: m.kind, run: () => void reopenRecent(m.id) })),
  ];

  // Library search also matches tools/actions (not just saved-document text), so
  // typing e.g. "new invoice" or "open" surfaces the matching action to launch.
  const toolMatches: Command[] = (() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return [];
    const words = q.split(/\s+/);
    return commands
      .filter((c) => c.group !== 'Recent')
      .filter((c) => { const hay = (c.title + ' ' + (c.keywords ?? '') + ' ' + c.group).toLowerCase(); return words.every((w) => hay.includes(w)); })
      .slice(0, 6);
  })();

  return (
    <div className="ws">
      <a className="skip-link" href="#ws-main">Skip to content</a>
      {joinState && (
        <div className="ws-join-gate" role="status" aria-live="polite">
          <div className="ws-join-card">
            {joinState === 'joining' ? (
              <>
                <div className="ws-join-spin" aria-hidden />
                <h2>{t('join_requesting', lang)}</h2>
                <p>{t('join_requesting_sub', lang)}</p>
              </>
            ) : (
              <>
                <div className="ws-join-x" aria-hidden>🔒</div>
                <h2>{t('join_denied', lang)}</h2>
                <p>{joinState.failed === 'forwarded' ? t('join_denied_forwarded', lang)
                  : joinState.failed === 'timeout' ? t('join_denied_timeout', lang)
                  : t('join_denied_invalid', lang)}</p>
                <TkxButton variant="solid" colorScheme="primary" size="sm" onClick={() => { setJoinState(null); goLibrary(); }}>{t('join_go_library', lang)}</TkxButton>
              </>
            )}
          </div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={OPENABLE_ACCEPT}
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void open(f); }}
      />
      <header className={'ws-bar' + (menuOpen ? ' ws-menu-open' : '')}>
        <span className="ws-brand"><span className="ws-logo" aria-hidden>P</span>Pyntra Docs</span>
        <button className="ws-hamburger" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>{menuOpen ? '✕' : '☰'}</button>
        <div className="ws-bar-controls">
        <TkxButton variant="solid" colorScheme="primary" size="sm" data-tour="open" onClick={() => inputRef.current?.click()} title="Open PDF, Word, PowerPoint, Excel, OpenDocument, RTF, Markdown, HTML, text, or an image">{t('nav_open', lang)}</TkxButton>
        {(doc || pdf) && <TkxButton variant="ghost" size="sm" leftIcon={<Icon name="library" />} onClick={goLibrary} title="Back to your saved files">{t('nav_library', lang)}</TkxButton>}
        <InstallButton />
        {formatLabel && <span className="ws-format">{formatLabel}</span>}
        <div className="ws-bar-end">
          <TkxButton variant="ghost" size="sm" className="ws-icon-btn" onClick={() => setPaletteOpen(true)} aria-label="Open command menu" title="Command menu (Ctrl/⌘ K)" leftIcon={<Icon name="command" size={16} />}><span className="ws-ctrl-label">{tx('nav_commands', lang, 'Search & commands')}</span><span className="ws-kbd-hint">⌘K</span></TkxButton>
          <TkxButton variant="ghost" size="sm" className="ws-icon-btn" onClick={cycleTheme} aria-label={`Theme: ${themeLabel}. Click to change.`} title={`Theme: ${themeLabel}`}><Icon name={themeIconName} size={16} /><span className="ws-ctrl-label">{tx('nav_theme', lang, 'Light / dark theme')}</span></TkxButton>
          <TkxButton variant="ghost" size="sm" className="ws-icon-btn ws-simple-btn" data-on={simpleOn ? '1' : '0'} onClick={() => setSimpleOn(toggleSimple())} aria-pressed={simpleOn} aria-label="Easy view: larger text and buttons" title="Easy view — larger text & buttons"><span aria-hidden style={{ fontWeight: 800, fontSize: 15 }}>Aa</span><span className="ws-ctrl-label">{tx('nav_easy', lang, simpleOn ? 'Easy view: on' : 'Easy view: larger text')}</span></TkxButton>
          <TkxSelect
            className="ws-lang"
            value={lang}
            options={LANGUAGES.map((l) => ({ value: l.code, label: l.native }))}
            onChange={(v) => setLang(v as Lang)}
            size="sm"
            searchable
          />
          <a className="ws-docs" href="/docs">{t('nav_docs', lang)}</a>
        </div>
        </div>
      </header>

      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}

      <main className="ws-main" id="ws-main">
        {status && <div className="ed-status">{status}</div>}
        {pdf && (
          <Suspense fallback={<div className="ed-loading">Loading editor…</div>}>
            <AppV2 initialDoc={pdf} showOpen={false} />
          </Suspense>
        )}
        {showTour && !pdf && !doc && <Tour steps={HOME_TOUR} onClose={() => setShowTour(false)} />}
        {!pdf && !doc && !status && (
          <div className="ws-empty">
            <span className="ws-eyebrow">🔒 Private · in your browser · installs anywhere</span>
            <h1>Your documents, <span className="ws-grad">one private workspace</span></h1>
            <p>Open or convert Word, PowerPoint, Excel, OpenDocument, Markdown, images and PDF — edit in their native format, and co-edit in real time. Your work autosaves and reopens automatically, and nothing ever leaves your device.</p>
            <TkxButton size="lg" colorScheme="primary" glow onClick={() => inputRef.current?.click()}>{t('open_document', lang)}</TkxButton>
            <div><TkxButton variant="ghost" size="sm" onClick={() => setShowTour(true)} title="A quick walkthrough of everything Pyntra Docs can do — skippable any time">🎓 {tx('take_tour', lang, 'Take the quick tour')}</TkxButton></div>

            {recents.length > 0 && (
              <div className="ws-search">
                <div className="ws-search-bar">
                  <span className="ws-search-icon" aria-hidden>⌕</span>
                  <input
                    className="ws-search-input"
                    type="search"
                    value={searchQ}
                    placeholder={t('search_placeholder', lang)}
                    aria-label="Search your documents"
                    onChange={(e) => setSearchQ(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void runSearch(); }}
                  />
                  <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={searching || !searchQ.trim()} onClick={() => void runSearch()}>{searching ? t('srch_searching', lang) : t('srch_search', lang)}</TkxButton>
                </div>
                {searchHits && (
                  <div className="ws-search-results">
                    {toolMatches.length > 0 && (
                      <>
                        <div className="ws-search-group">{t('srch_tools', lang)}</div>
                        {toolMatches.map((c) => (
                          <button key={c.id} className="ws-search-hit ws-search-hit--tool" onClick={() => { setSearchHits(null); setSearchQ(''); c.run(); }}>
                            <span className="ws-search-hit-head">⚡ {c.title}</span>
                            {c.hint && <span className="ws-search-hit-snip">{c.hint}</span>}
                          </button>
                        ))}
                      </>
                    )}
                    {searchHits.length > 0 && <div className="ws-search-group">{t('srch_docs', lang)}</div>}
                    {searchHits.map((h) => (
                      <button key={`${h.docId}:${h.page ?? 0}:${h.snippet.slice(0, 12)}`} className="ws-search-hit" onClick={() => void reopenRecent(h.docId)}>
                        <span className="ws-search-hit-head">{KIND_ICON[h.kind]} {h.name}{h.page ? ` · p.${h.page}` : ''}</span>
                        <span className="ws-search-hit-snip">{h.snippet}</span>
                      </button>
                    ))}
                    {searchHits.length === 0 && toolMatches.length === 0 && <p className="ws-search-empty">{t('srch_no_match', lang)}</p>}
                  </div>
                )}
              </div>
            )}

            {recents.length > 0 && (
              <div className="ws-templates">
                <h2 className="ws-templates-title">{tx('h_recent', lang, 'Recent documents')}</h2>
                <div className="ws-template-grid">
                  {recents.map((m) => (
                    <div key={m.id} className="ws-template-card ws-template-card--custom">
                      <button className="ws-template-open" onClick={() => void reopenRecent(m.id)} title={`Reopen ${m.name}`}>
                        <span className="ws-template-icon">{KIND_ICON[m.kind]}</span>
                        <span className="ws-template-name">{m.name}</span>
                        <span className="ws-template-desc">{m.kind} · {ago(m.updatedAt)}</span>
                      </button>
                      <TkxButton variant="ghost" size="sm" className="ws-template-dup" title="Duplicate" aria-label={`Duplicate ${m.name}`} onClick={() => void duplicateRecent(m.id)}>⧉</TkxButton>
                      <TkxButton variant="ghost" size="sm" className="ws-template-del" title="Remove from library" aria-label={`Remove ${m.name} from library`} onClick={() => void removeRecent(m.id)}>✕</TkxButton>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(() => {
              void tplVer; // re-read on bump
              const custom = customDocTemplates();
              return (
                <div className="ws-templates" data-tour="templates">
                  <div className="ws-templates-bar">
                    <TkxButton variant="link" size="sm" className="ws-template-link" onClick={exportTemplates} isDisabled={!loadCustomTemplates().length} disabled={!loadCustomTemplates().length} title="Download your saved templates as JSON">⤓ Export my templates</TkxButton>
                    <TkxButton variant="link" size="sm" className="ws-template-link" onClick={() => tplFileRef.current?.click()} title="Import templates from a JSON file">⤒ Import templates</TkxButton>
                    <input ref={tplFileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importTemplates(f); }} />
                    {tplMsg && <span className="ws-template-msg">{tplMsg}</span>}
                  </div>
                  {custom.length > 0 && (
                    <>
                      <h2 className="ws-templates-title">{tx('h_my_templates', lang, 'My templates')}</h2>
                      <div className="ws-template-grid">
                        {custom.map((t) => (
                          <div key={t.id} className="ws-template-card ws-template-card--custom">
                            <button className="ws-template-open" onClick={() => void openTemplate(t)} title={t.description}>
                              <span className="ws-template-icon">{t.icon}</span>
                              <span className="ws-template-name">{t.name}</span>
                              <span className="ws-template-desc">{t.description}</span>
                            </button>
                            <TkxButton
                              variant="ghost"
                              size="sm"
                              className="ws-template-del"
                              title="Delete template"
                              aria-label={`Delete template ${t.name}`}
                              onClick={() => { const id = customTemplateIdOf(t.id); if (id) { deleteCustomTemplate(id); setTplVer((v) => v + 1); } }}
                            >✕</TkxButton>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  <h2 className="ws-templates-title">{tx('h_start_template', lang, 'Start from a template')}</h2>
                  <div className="ws-template-grid">
                    {TEMPLATES.map((t) => (
                      <button key={t.id} className="ws-template-card" onClick={() => void openTemplate(t)} title={t.description}>
                        <span className="ws-template-icon">{t.icon}</span>
                        <span className="ws-template-name">{tx('dt_' + t.id, lang, t.name)}</span>
                        <span className="ws-template-desc">{tx('dtd_' + t.id, lang, t.description)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Site footer — legal/info links (also satisfies store review
                requirements that these be reachable from the app). */}
            <footer className="ws-site-footer">
              <nav className="ws-site-footer-nav">
                <a href="/about">{tx('foot_about', lang, 'About')}</a>
                <a href="/contact">{tx('foot_contact', lang, 'Contact')}</a>
                <a href="/privacy">{tx('foot_privacy', lang, 'Privacy Policy')}</a>
                <a href="/terms">{tx('foot_terms', lang, 'Terms')}</a>
                <a href="/docs">{tx('nav_docs', lang, 'Docs')}</a>
              </nav>
              <p className="ws-site-footer-copy">© 2026 Pyntra Docs · Private, in your browser · Your files never leave your device.</p>
            </footer>
          </div>
        )}
        {!pdf && doc?.kind === 'text' && <TextEditor key={seq} docId={doc.id} name={doc.name} ext={doc.ext} bytes={doc.bytes} onOpenInPdf={openInPdf} initialThemeId={doc.themeId} collabRoom={doc.collabRoom} />}
        {!pdf && doc?.kind === 'sheet' && <SheetEditor key={seq} docId={doc.id} name={doc.name} ext={doc.ext} bytes={doc.bytes} onOpenInPdf={openInPdf} initialThemeId={doc.themeId} collabRoom={doc.collabRoom} />}
        {!pdf && doc?.kind === 'word' && <DocxEditor key={seq} docId={doc.id} name={doc.name} initialHtml={doc.html ?? ''} onOpenInPdf={openInPdf} initialThemeId={doc.themeId} collabRoom={doc.collabRoom} />}
        {!pdf && doc?.kind === 'slides' && <SlideEditor key={seq} docId={doc.id} name={doc.name} slides={doc.slides ?? []} original={doc.bytes} onOpenInPdf={openInPdf} initialThemeId={doc.themeId} collabRoom={doc.collabRoom} />}
      </main>
    </div>
  );
}
