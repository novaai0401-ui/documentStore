/**
 * Multi-format document workspace. Opens each document in a native editor for
 * its type — Word in a rich-text editor, spreadsheets in a grid, text/Markdown
 * in a text editor, PDFs and images in the PDF editor — instead of forcing
 * everything through a PDF conversion. From any editor you can save back to the
 * original format or convert to others. A single global "Open…" button routes
 * by file type. Open documents autosave to an offline library, so a refresh
 * restores your last document and recent work is one click away.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TkxButton, TkxSelect } from 'tekivex-ui';
import { t, tx, setLang, useLang, LANGUAGES, type Lang } from '../i18n.js';
import { StudioEditor } from './studio/StudioEditor.js';
import { PromptDesignModal } from './studio/PromptDesignModal.js';
import { AskAiModal } from './ai/AskAiModal.js';
import type { AnimPreset } from './studio/animate.js';
import type { AnchoredComment } from './studio/anchoredComments.js';
import { ImageStudio } from './studio/ImageStudio.js';
import { blankDesign, formatById, type Design } from './studio/model.js';
import { STUDIO_TEMPLATES } from './studio/templates.js';
import { dailyGreeting } from './studio/occasions.js';
import { CombineModal } from './studio/CombineModal.js';
import { SignModal } from './studio/SignModal.js';
import { CompressModal } from './studio/CompressModal.js';
import { ConvertModal } from './studio/ConvertModal.js';
import { ScannerModal } from './studio/ScannerModal.js';
import { RecorderModal } from './studio/RecorderModal.js';
import { VideoStudioModal } from './studio/VideoStudioModal.js';
import { VideoEditorModal } from './studio/VideoEditorModal.js';
import { MemoryVideoModal } from './studio/MemoryVideoModal.js';
import { ScriptReelModal } from './studio/ScriptReelModal.js';
import { GreetingVideoModal } from './studio/GreetingVideoModal.js';
import { InvitationPicker } from './studio/InvitationPicker.js';
import { occasionSlug, occasionFromSlug } from './studio/cardCatalog.js';
import { AdSlot } from './ads/AdSlot.js';
import { RemindersModal } from './studio/RemindersModal.js';
import { loadReminders, remindersToday, makeReminderDesign, type Reminder } from './studio/reminders.js';
import { getSimple, toggleSimple } from './simpleMode.js';
import { MicButton } from './studio/MicButton.js';
import { WatermarkModal } from './studio/WatermarkModal.js';
import { CollageModal } from './studio/CollageModal.js';
import { FamilyStudioModal } from './studio/FamilyStudioModal.js';
import { PhotoArtModal } from './studio/PhotoArtModal.js';
import { HelpCenterModal } from './studio/HelpCenterModal.js';
import { MemeModal } from './studio/MemeModal.js';
import { PdfFormModal } from './studio/PdfFormModal.js';
import { ProtectModal } from './studio/ProtectModal.js';
import { searchLibrary, type LibraryHit } from './persist/librarySearch.js';
import './studio/studio.css';
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
import { ToolsMenu, type ToolGroup } from './ToolsMenu.js';

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
  { target: '', title: '👋 Welcome to Pyntra!', body: 'Everything here runs in your browser — nothing you open or make ever leaves your device. Here’s a 60-second look around. Skip any time with ✕ or Esc.' },
  { target: '[data-tour="open"]', title: '📂 Open anything', body: 'PDF, Word, Excel, images, Markdown… tap Open and it starts in the right editor. Your work autosaves and reopens next visit.' },
  { target: '[data-tour="tabs"]', title: '🧰 Two rooms', body: '“Tools & designs” holds every creative tool. “Documents” has ready starters — letters, reports, invoices.' },
  { target: '[data-tour="cat-create"]', title: '✍️ Create something', body: 'Greeting cards, invitations, or a blank canvas. The design studio has stickers, drawing, shapes and photos — everything is draggable.' },
  { target: '[data-tour="cat-photos"]', title: '🖼️ Photos & images', body: 'Edit a photo (crop, filters, cut out the person and put ANY scenery behind them), compress, convert, scan, collage, memes and watermarks.' },
  { target: '[data-tour="cat-video"]', title: '🎬 Video & audio', body: 'Join clips into one movie with transitions, music, text, speed and fades. Trim, make GIFs, extract audio, record your screen.' },
  { target: '[data-tour="cat-pdf"]', title: '📄 PDF tools', body: 'Build fillable forms or protect a PDF with a password. Opening any PDF also unlocks editing, signing, OCR and true redaction.' },
  { target: '[data-tour="cat-designs"]', title: '✨ Ready-made designs', body: 'Greeting cards for every occasion — birthdays, anniversaries, Diwali/Eid/Christmas, Mother’s & Father’s Day, thank-you, good-morning and more — plus invites, posters and sale promos. Pick one and just change the words. Every design can also become an animated video with music.' },
  { target: '[data-tour="open"]', title: '🎉 That’s it!', body: 'One promise to remember: no uploads, no account, no watermark. Replay this tour any time from “🎓 Take the quick tour” on the home page.' },
];

export function Workspace() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [pdf, setPdf] = useState<{ bytes: Uint8Array; name: string; id: string } | null>(null);
  const [studio, setStudio] = useState<{ id: string; name: string; design: Design; pages?: Design[]; collabRoom?: Room; anim?: AnimPreset; comments?: AnchoredComment[] } | null>(null);
  const [image, setImage] = useState<{ src: string; name: string } | null>(null);
  const [showCombine, setShowCombine] = useState(false);
  const [showSign, setShowSign] = useState(false);
  const [showCompress, setShowCompress] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const [showVideoEditor, setShowVideoEditor] = useState(false);
  // When true, the video editor opens in "reel" mode (vertical 9:16, reel copy).
  const [videoEditorReel, setVideoEditorReel] = useState(false);
  const openReelMaker = useCallback(() => { setVideoEditorReel(true); setShowVideoEditor(true); }, []);
  const [showMemoryVideo, setShowMemoryVideo] = useState(false);
  const [showScriptReel, setShowScriptReel] = useState(false);
  const [greetingOcc, setGreetingOcc] = useState<string | null>(null); // non-null = Animated-wish modal open
  // "Today" nudge — the occasion of the day + a matching greeting card.
  const todayGreeting = useMemo(() => {
    const g = dailyGreeting(new Date());
    const tpl = STUDIO_TEMPLATES.find((t) => t.id === g.templateId);
    return tpl ? { ...g, tpl } : null;
  }, []);
  const [videoFile, setVideoFile] = useState<{ file: File | null; op?: 'trim' | 'gif' | 'audio' } | null>(null);
  const [showInvites, setShowInvites] = useState<string | null>(null); // null=closed, else the occasion tab to open on
  // Deep-linkable Cards gallery. `/…?cards=<occasion-slug>` opens the gallery
  // pre-filtered to that occasion, and browsing occasions reflects in the URL —
  // so links are shareable, the browser Back button works, and each occasion is
  // its own history entry / pageview (better SEO + ad inventory, matching the
  // pre-rendered /cards/<occasion> pages). Purely additive: with no `cards`
  // param the app behaves exactly as before.
  const readCardsParam = (): string | null => { try { return new URLSearchParams(window.location.search).get('cards'); } catch { return null; } };
  const occFromParam = (p: string | null): string | null => (p === null ? null : (p === '' || p.toLowerCase() === 'all' ? 'All' : (occasionFromSlug(p) ?? 'All')));
  // On first load, open the gallery if the URL asks for it; keep it in sync with
  // Back/Forward navigation.
  useEffect(() => {
    const initial = occFromParam(readCardsParam());
    if (initial !== null) setShowInvites((cur) => (cur === null ? initial : cur));
    const onPop = () => setShowInvites(occFromParam(readCardsParam()));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  // Reflect the open gallery / current occasion back into the URL (push a new
  // entry only when it actually changes, so Back closes/returns naturally and we
  // never loop with the popstate handler above).
  useEffect(() => {
    const want = showInvites === null ? null : occasionSlug(showInvites);
    const cur = readCardsParam();
    if (cur === want) return;
    try {
      const u = new URL(window.location.href);
      if (want === null) u.searchParams.delete('cards'); else u.searchParams.set('cards', want);
      window.history.pushState({}, '', u);
      (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.('event', 'page_view', { page_path: u.pathname + u.search, page_location: u.href });
    } catch { /* history/URL unavailable — non-fatal */ }
  }, [showInvites]);
  const [showPrompt, setShowPrompt] = useState(false);
  // Personal date reminders (birthdays/anniversaries/milestones). Loaded once;
  // reloaded when the manager closes. `todaysReminders` drives the home banner.
  const [simpleOn, setSimpleOn] = useState(() => getSimple());
  const [showReminders, setShowReminders] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>(() => { try { return loadReminders(); } catch { return []; } });
  const todaysReminders = useMemo(() => remindersToday(reminders), [reminders]);
  const openReminderCard = (r: Reminder) => { setShowReminders(false); openStudio(r.name, makeReminderDesign(r)); };
  // On open, if this device allowed notifications: one notification per day
  // covering saved reminders AND festivals (Diwali, Ganpati, Chhath…), for
  // today or a day-before heads-up. Works everywhere (no Periodic Sync needed)
  // and keeps the service worker's festival mirror fresh for background firing.
  useEffect(() => {
    try { void import('./studio/bgReminders.js').then((m) => m.maybeNotifyToday()).catch(() => { /* */ }); }
    catch { /* notifications unavailable — the home banner still shows */ }
    // once, on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [showAskAi, setShowAskAi] = useState(false);
  const [showWatermark, setShowWatermark] = useState(false);
  const [showCollage, setShowCollage] = useState(false);
  const [showFamily, setShowFamily] = useState(false);
  const [showPhotoArt, setShowPhotoArt] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // Set when opened from a family invite link → the modal starts in contributor mode.
  const [familyRoom, setFamilyRoom] = useState<Room | null>(null);
  const [showMeme, setShowMeme] = useState(false);
  const [formFile, setFormFile] = useState<File | null>(null);
  const [showProtect, setShowProtect] = useState(false);
  const formInputRef = useRef<HTMLInputElement | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [homeTab, setHomeTab] = useState<'create' | 'docs'>('create');
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
  // cleanup — stopping the camera, etc.), so on Escape we trigger that same
  // affordance for keyboard/a11y parity. Modals that deliberately have no backdrop
  // dismiss (e.g. the password prompt) carry no handler and are left untouched.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // If a transient popover is open (e.g. a select dropdown), let it handle
      // Escape first and close itself — don't also tear down the whole modal. We
      // can't rely on e.defaultPrevented here because some select triggers cancel
      // Escape even when their menu is closed, which would wedge the dialog shut.
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
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const refreshRecents = useCallback(async () => { setRecents(await listRecent()); }, []);
  const openStudio = useCallback((name: string, design: Design, opts?: { id?: string; collabRoom?: Room; pages?: Design[]; anim?: AnimPreset }) => {
    const id = opts?.id ?? newDocId();
    setDoc(null); setPdf(null); setImage(null); setSeq((s) => s + 1);
    setStudio({ id, name, design, pages: opts?.pages, collabRoom: opts?.collabRoom, anim: opts?.anim });
    // Persist an initial snapshot and mark it last-open so a freshly created design
    // reopens automatically on reload — same as documents/sheets/decks. (The editor
    // keeps it updated via autosave thereafter.) The shared-room join path takes
    // precedence over last-open, so this is harmless for collaborators.
    void saveDoc({ id, name, ext: 'design', kind: 'design', updatedAt: Date.now(), content: { design, pages: opts?.pages } })
      .then(() => setLastOpen(id))
      .then(() => refreshRecents())
      .catch(() => { /* best-effort; autosave will persist on first edit */ });
  }, [refreshRecents]);
  const openImage = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => { setDoc(null); setPdf(null); setStudio(null); setSeq((s) => s + 1); setImage({ src: String(reader.result), name: file.name.replace(/\.[^.]+$/, '') || 'image' }); };
    reader.readAsDataURL(file);
  }, []);
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
  // Opening an editor/design closes the mobile menu so it never overlays content.
  useEffect(() => { setMenuOpen(false); }, [pdf, doc, studio, image]);
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
    setStudio(null);
    setImage(null);
    if (rec.kind === 'design') { setDoc(null); setPdf(null); setStudio({ id: rec.id, name: rec.name, design: c.pages?.[0] ?? c.design ?? blankDesign(formatById('ig-post')), pages: c.pages, comments: c.anchoredComments }); return; }
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
    setStudio(null);
    setImage(null);
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
        // Open the surface the link was shared from; the host's snapshot fills in
        // the actual content once connected.
        if (joinRoom.kind === 'design') {
          openStudio('shared-design', blankDesign(formatById('ig-post')), { collabRoom: joinRoom });
          void refreshRecents();
          return;
        }
        if (joinRoom.kind === 'family') {
          // A relative opened the family invite link — join the live portrait.
          setFamilyRoom(joinRoom);
          setShowFamily(true);
          void refreshRecents();
          return;
        }
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
  }, [refreshRecents, showRecord, openStudio]);

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

  const goLibrary = useCallback(() => { setDoc(null); setPdf(null); setStudio(null); setImage(null); void refreshRecents(); }, [refreshRecents]);
  const themeLabel = theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System';
  const themeIconName = theme === 'light' ? 'themeLight' : theme === 'dark' ? 'themeDark' : 'themeSystem';

  // Actions surfaced in the ⌘K command palette.
  const commands: Command[] = [
    { id: 'open', title: 'Open a file', hint: '⌘O', group: 'Create', keywords: 'import pdf word excel powerpoint upload', run: () => inputRef.current?.click() },
    { id: 'design', title: 'New blank design', group: 'Create', keywords: 'canvas graphic poster social', run: () => openStudio('untitled-design', blankDesign(formatById('ig-post'))) },
    { id: 'prompt-design', title: 'AI: Prompt to design', group: 'Create', keywords: 'ai generate prompt text to design poster social magic', run: () => setShowPrompt(true) },
    { id: 'ask-ai', title: 'Ask AI anything', group: 'Create', keywords: 'ai chat assistant question answer gpt claude llm key', run: () => setShowAskAi(true) },
    { id: 'greeting', title: 'Make a greeting card', group: 'Create', keywords: 'greeting card birthday wish festival diwali christmas eid anniversary thank you good morning', run: () => setShowInvites('All') },
    { id: 'image', title: 'Edit an image', group: 'Create', keywords: 'crop filter rotate resize photo', run: () => imageInputRef.current?.click() },
    { id: 'sign', title: 'Sign or verify a file', group: 'Create', keywords: 'signature digital verify sign integrity', run: () => setShowSign(true) },
    { id: 'compress', title: 'Compress images & PDFs', group: 'Create', keywords: 'compress shrink reduce file size optimize image pdf smaller', run: () => setShowCompress(true) },
    { id: 'convert', title: 'Convert images (HEIC→JPG)', group: 'Create', keywords: 'convert heic jpg png webp avif format image to pdf iphone photo', run: () => setShowConvert(true) },
    { id: 'scan', title: 'Scan a document', group: 'Create', keywords: 'scan camera document pdf camscanner lens photo page', run: () => setShowScan(true) },
    { id: 'record', title: 'Record screen or camera', group: 'Create', keywords: 'record screen camera webcam video capture loom screencast', run: () => setShowRecorder(true) },
    { id: 'video', title: 'Video Studio (trim, GIF, audio)', group: 'Create', keywords: 'video trim compress convert gif extract audio mp4 webm clip', run: () => setVideoFile({ file: null }) },
    { id: 'reel', title: 'Make a reel (upload video, voice-over, captions)', group: 'Create', keywords: 'reel reels short shorts tiktok instagram youtube status vertical video voiceover voice over caption thumbnail cover upload', run: openReelMaker },
    { id: 'memory-video', title: 'Memory video (photos → slideshow with music)', group: 'Create', keywords: 'memory video slideshow photos pictures wedding birthday anniversary trip travel ken burns crossfade fade music captions montage mp4 story', run: () => setShowMemoryVideo(true) },
    { id: 'script-reel', title: 'Script → reel (type text, get a captioned video)', group: 'Create', keywords: 'script reel text to video captions caption text-video quote tips list talking no footage tts read aloud voiceover mp4 faceless', run: () => setShowScriptReel(true) },
    { id: 'animated-wish', title: 'Animated wish (birthday, anniversary… video greeting)', group: 'Create', keywords: 'animated wish greeting card video birthday anniversary love congratulations thank you wedding new year gift box unbox hearts confetti voice message photo mp4', run: () => setGreetingOcc('') },
    { id: 'videoedit', title: 'Video editor (join clips, text, music)', group: 'Create', keywords: 'video edit editor join merge combine clips timeline text overlay caption music movie', run: () => { setVideoEditorReel(false); setShowVideoEditor(true); } },
    { id: 'invite', title: 'Make an invitation', group: 'Create', keywords: 'invitation invite birthday wedding party baby shower card rsvp save the date', run: () => setShowInvites('All') },
    { id: 'watermark', title: 'Watermark PDFs & images', group: 'Create', keywords: 'watermark stamp confidential draft pdf image batch protect', run: () => setShowWatermark(true) },
    { id: 'collage', title: 'Make a photo collage', group: 'Create', keywords: 'collage photo grid pictures montage', run: () => setShowCollage(true) },
    { id: 'meme', title: 'Make a meme', group: 'Create', keywords: 'meme caption funny top bottom text image', run: () => setShowMeme(true) },
    { id: 'combine', title: 'Combine designs into one PDF', group: 'Create', keywords: 'merge combine designs cards project pdf', run: () => setShowCombine(true) },
    { id: 'library', title: 'Go to library', group: 'Go', keywords: 'home recent documents', run: goLibrary },
    { id: 'theme', title: `Switch theme (now: ${themeLabel})`, group: 'View', keywords: 'dark light mode appearance', run: cycleTheme },
    ...STUDIO_TEMPLATES.map((t): Command => ({ id: `tpl-${t.id}`, title: `New: ${t.name}`, group: 'Templates', keywords: 'design template animated', run: () => openStudio(t.id, t.make(), { anim: t.anim }) })),
    ...recents.slice(0, 6).map((m): Command => ({ id: `recent-${m.id}`, title: m.name, hint: ago(m.updatedAt), group: 'Recent', keywords: m.kind, run: () => void reopenRecent(m.id) })),
  ];

  // Library search also matches TOOLS/actions (not just saved-document text), so
  // typing e.g. "blank design" or "compress" surfaces the matching tool to launch
  // — otherwise a tool name returns "no passages found" even though it's on screen.
  const toolMatches: Command[] = (() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return [];
    const words = q.split(/\s+/);
    return commands
      .filter((c) => c.group !== 'Recent')
      .filter((c) => { const hay = (c.title + ' ' + (c.keywords ?? '') + ' ' + c.group).toLowerCase(); return words.every((w) => hay.includes(w)); })
      .slice(0, 6);
  })();

  // Every studio tool, grouped for the Adobe-style Tools launcher in the bar.
  const toolGroups: ToolGroup[] = [
    { title: t('group_create', lang), items: [
      { id: 'design', label: t('tl_design', lang), desc: t('td_design', lang), icon: 'design', run: () => openStudio('untitled-design', blankDesign(formatById('ig-post'))) },
      { id: 'prompt-design', label: t('tl_prompt', lang), desc: t('td_prompt', lang), icon: 'design', run: () => setShowPrompt(true) },
      { id: 'ask-ai', label: t('tl_ask_ai', lang), desc: t('td_ask_ai', lang), icon: 'design', run: () => setShowAskAi(true) },
      { id: 'invitation', label: t('tl_invitation', lang), desc: t('td_invitation', lang), icon: 'invitation', run: () => setShowInvites('All') },
      { id: 'collage', label: t('tl_collage', lang), desc: t('td_collage', lang), icon: 'collage', run: () => setShowCollage(true) },
      { id: 'meme', label: t('tl_meme', lang), desc: t('td_meme', lang), icon: 'meme', run: () => setShowMeme(true) },
    ] },
    { title: t('group_images_pdf', lang), items: [
      { id: 'image', label: t('tl_image', lang), desc: t('td_image', lang), icon: 'image', run: () => imageInputRef.current?.click() },
      { id: 'photoart', label: tx('tl_photoart', lang, 'Photo Art'), desc: tx('td_photoart', lang, 'Sketch, cartoon, painting — free & on-device'), icon: 'image', run: () => setShowPhotoArt(true) },
      { id: 'help', label: tx('tl_help', lang, 'Help & how-to videos'), desc: tx('td_help', lang, 'Short guides for every tool'), icon: 'image', run: () => setShowHelp(true) },
      { id: 'compress', label: t('tl_compress', lang), desc: t('td_compress', lang), icon: 'compress', run: () => setShowCompress(true) },
      { id: 'convert', label: t('tl_convert', lang), desc: t('td_convert', lang), icon: 'convert', run: () => setShowConvert(true) },
      { id: 'watermark', label: t('tl_watermark', lang), desc: t('td_watermark', lang), icon: 'watermark', run: () => setShowWatermark(true) },
      { id: 'form', label: t('tl_pdf_forms', lang), desc: t('td_pdf_forms', lang), icon: 'form', run: () => formInputRef.current?.click() },
      { id: 'protect', label: t('tl_protect', lang), desc: t('td_protect', lang), icon: 'lock', run: () => setShowProtect(true) },
    ] },
    { title: t('group_capture_video', lang), items: [
      { id: 'scan', label: t('tl_scan', lang), desc: t('td_scan', lang), icon: 'scan', run: () => setShowScan(true) },
      { id: 'record', label: t('tl_record', lang), desc: t('td_record', lang), icon: 'record', run: () => setShowRecorder(true) },
      { id: 'video', label: t('tl_video', lang), desc: t('td_video', lang), icon: 'video', run: () => setVideoFile({ file: null }) },
    ] },
    { title: t('group_documents', lang), items: [
      { id: 'sign', label: t('tl_sign', lang), desc: t('td_sign', lang), icon: 'sign', run: () => setShowSign(true) },
      { id: 'combine', label: t('tl_combine', lang), desc: t('td_combine', lang), icon: 'combine', run: () => setShowCombine(true) },
    ] },
  ];

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
        <span className="ws-brand"><span className="ws-logo" aria-hidden>P</span>Pyntra</span>
        <button className="ws-hamburger" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>{menuOpen ? '✕' : '☰'}</button>
        <div className="ws-bar-controls">
        <TkxButton variant="solid" colorScheme="primary" size="sm" data-tour="open" onClick={() => inputRef.current?.click()} title="Open PDF, Word, PowerPoint, Excel, OpenDocument, RTF, Markdown, HTML, text, or an image">{t('nav_open', lang)}</TkxButton>
        <TkxButton variant="ghost" size="sm" leftIcon={<Icon name="design" />} onClick={() => openStudio('untitled-design', blankDesign(formatById('ig-post')))} title="Create a graphic, poster, or social post">{t('nav_design', lang)}</TkxButton>
        <ToolsMenu groups={toolGroups} label={t('nav_tools', lang)} />
        <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) openImage(f); }} />
        <input ref={formInputRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setFormFile(f); }} />
        {(doc || pdf || studio || image) && <TkxButton variant="ghost" size="sm" leftIcon={<Icon name="library" />} onClick={goLibrary} title="Back to your saved files">{t('nav_library', lang)}</TkxButton>}
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
          <TkxButton variant="ghost" size="sm" className="ws-icon-btn" onClick={() => setShowHelp(true)} aria-label="Help and how-to videos" title="Help & how-to videos"><span aria-hidden style={{ fontWeight: 800, fontSize: 15 }}>❔</span><span className="ws-ctrl-label">{tx('nav_help', lang, 'Help & how-to')}</span></TkxButton>
          <a className="ws-docs" href="/docs">{t('nav_docs', lang)}</a>
        </div>
        </div>
      </header>

      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}


      <main className="ws-main" id="ws-main">
        {status && <div className="ed-status">{status}</div>}
        {showCombine && <CombineModal onClose={() => setShowCombine(false)} />}
        {showSign && <SignModal onClose={() => setShowSign(false)} />}
        {showCompress && <CompressModal onClose={() => setShowCompress(false)} onOpenVideo={(f) => { setShowCompress(false); setVideoFile({ file: f }); }} />}
        {showConvert && <ConvertModal onClose={() => setShowConvert(false)} />}
        {showScan && <ScannerModal onClose={() => setShowScan(false)} onOpenInPdf={openInPdf} />}
        {showRecorder && <RecorderModal onClose={() => setShowRecorder(false)} />}
        {videoFile && <VideoStudioModal onClose={() => setVideoFile(null)} initialFile={videoFile.file} initialOp={videoFile.op} />}
        {showVideoEditor && <VideoEditorModal reel={videoEditorReel} onClose={() => setShowVideoEditor(false)} />}
        {showMemoryVideo && <MemoryVideoModal onClose={() => setShowMemoryVideo(false)} />}
        {showScriptReel && <ScriptReelModal onClose={() => setShowScriptReel(false)} />}
        {greetingOcc !== null && <GreetingVideoModal initialOccasion={greetingOcc || undefined} onClose={() => setGreetingOcc(null)} />}
        {showInvites && <InvitationPicker initialCat={showInvites} onCat={(occ) => setShowInvites(occ)} onClose={() => setShowInvites(null)} onPick={(name, design, anim) => { setShowInvites(null); openStudio(name, design, anim ? { anim } : undefined); }}
          onBlank={() => { setShowInvites(null); openStudio('untitled-design', blankDesign(formatById('ig-post'))); }}
          onAnimated={() => { setShowInvites(null); setGreetingOcc(''); }}
          onCollage={() => { setShowInvites(null); setShowCollage(true); }}
          onDescribe={() => { setShowInvites(null); setShowPrompt(true); }} />}
        {showReminders && <RemindersModal onClose={() => { setShowReminders(false); setReminders(loadReminders()); }} onMakeCard={openReminderCard} onFestival={(occ) => { setShowReminders(false); setShowInvites(occ); }} />}
        {showPrompt && <PromptDesignModal onClose={() => setShowPrompt(false)} onCreate={(name, design) => { setShowPrompt(false); openStudio(name, design); }} />}
        {showAskAi && <AskAiModal onClose={() => setShowAskAi(false)} />}
        {showWatermark && <WatermarkModal onClose={() => setShowWatermark(false)} />}
        {showCollage && <CollageModal onClose={() => setShowCollage(false)} />}
        {showFamily && <FamilyStudioModal room={familyRoom} isHost={!familyRoom} onClose={() => { setShowFamily(false); setFamilyRoom(null); }} onOpenStudio={(name, design) => { setShowFamily(false); setFamilyRoom(null); openStudio(name, design); }} />}
        {showPhotoArt && <PhotoArtModal onClose={() => setShowPhotoArt(false)} />}
        {showHelp && <HelpCenterModal onClose={() => setShowHelp(false)} />}
        {showMeme && <MemeModal onClose={() => setShowMeme(false)} />}
        {formFile && <PdfFormModal file={formFile} onClose={() => setFormFile(null)} onOpenInPdf={openInPdf} />}
        {showProtect && <ProtectModal onClose={() => setShowProtect(false)} />}
        {pdf && (
          <Suspense fallback={<div className="ed-loading">Loading editor…</div>}>
            <AppV2 initialDoc={pdf} showOpen={false} />
          </Suspense>
        )}
        {studio && !pdf && !doc && (
          <StudioEditor key={seq} docId={studio.id} name={studio.name} initial={studio.design} initialPages={studio.pages} defaultAnim={studio.anim} initialComments={studio.comments} onEditVideo={(f) => setVideoFile({ file: f })} onOpenInPdf={openInPdf} collabRoom={studio.collabRoom} />
        )}
        {image && !pdf && !doc && !studio && (
          <ImageStudio key={seq} src={image.src} name={image.name} onClose={() => { setImage(null); void refreshRecents(); }} onOpenInPdf={openInPdf} onOpenInStudio={(design, dname) => openStudio(dname, design)} />
        )}
        {showTour && !pdf && !doc && !studio && !image && <Tour steps={HOME_TOUR} onClose={() => setShowTour(false)} />}
        {!pdf && !doc && !studio && !image && !status && (
          <div className="ws-empty">
            <span className="ws-eyebrow">🔒 Private · in your browser · installs anywhere</span>
            <h1>Your documents &amp; designs, <span className="ws-grad">one private studio</span></h1>
            <p>Open or convert Word, PowerPoint, Excel, OpenDocument, Markdown, images and PDF — edit in their native format, design greeting cards and social posts, and co-edit in real time. Your work autosaves and reopens automatically, and nothing ever leaves your device.</p>
            <TkxButton size="lg" colorScheme="primary" glow onClick={() => inputRef.current?.click()}>{t('open_document', lang)}</TkxButton>
            <div><TkxButton variant="ghost" size="sm" onClick={() => setShowTour(true)} title="A 60-second walkthrough of everything Pyntra can do — skippable any time">🎓 {tx('take_tour', lang, 'Take the quick tour')}</TkxButton></div>

            {/* Quick-create hub — a few big, plain-language choices so anyone
                (any age, first-time or not) knows where to start without
                scrolling the whole toolbox. This is the mobile "ease" fix: lead
                with intent, not a wall of tools. */}
            {/* A saved birthday/anniversary/milestone falling today — greet the
                user with a ready personalised card. */}
            {todaysReminders.length > 0 && (
              <button className="ws-reminder-today" onClick={() => openReminderCard(todaysReminders[0]!)}>
                <span className="ws-reminder-emoji" aria-hidden>🎉</span>
                <span className="ws-reminder-text">
                  <strong>{tx('rem_today', lang, 'Today')}: {todaysReminders.map((r) => r.name).join(', ')}</strong>
                  <span>{todaysReminders[0]!.type === 'anniversary' ? tx('rem_anniv', lang, 'anniversary') : todaysReminders[0]!.type === 'milestone' ? tx('rem_milestone', lang, 'milestone') : tx('rem_birthday', lang, 'birthday')} — {tx('rem_make', lang, 'make their card')}</span>
                </span>
                <span className="ws-reminder-go" aria-hidden>→</span>
              </button>
            )}
            {todayGreeting && (
              <button className="ws-today" onClick={() => openStudio(todayGreeting.tpl.id, todayGreeting.tpl.make(), { anim: todayGreeting.tpl.anim })} title={`Make a ${todayGreeting.label} card`}>
                <span className="ws-today-emoji" aria-hidden>{todayGreeting.icon}</span>
                <span className="ws-today-text"><strong>{tx('today_label', lang, 'Today')}: {todayGreeting.label}</strong> · {tx('today_cta', lang, 'send a card in seconds')}</span>
                <span className="ws-today-go" aria-hidden>→</span>
              </button>
            )}

            <div className="ws-quick" data-tour="quick">
              <h2 className="ws-quick-title">{tx('quick_title', lang, 'What would you like to make?')}</h2>
              <div className="ws-quick-grid">
                <button className="ws-quick-tile ws-quick-tile--reel" onClick={openReelMaker}>
                  <span className="ws-quick-emoji" aria-hidden>🎬</span>
                  <span className="ws-quick-label">{tx('q_reel', lang, 'A reel')}</span>
                  <span className="ws-quick-sub">{tx('q_reel_sub2', lang, 'Upload & edit your video')}</span>
                </button>
                <button className="ws-quick-tile ws-quick-tile--script" onClick={() => setShowScriptReel(true)}>
                  <span className="ws-quick-emoji" aria-hidden>✍️</span>
                  <span className="ws-quick-label">{tx('q_script', lang, 'Text to video')}</span>
                  <span className="ws-quick-sub">{tx('q_script_sub', lang, 'Type a script → captioned reel')}</span>
                </button>
                <button className="ws-quick-tile ws-quick-tile--memory" onClick={() => setShowMemoryVideo(true)}>
                  <span className="ws-quick-emoji" aria-hidden>💝</span>
                  <span className="ws-quick-label">{tx('q_memory', lang, 'A memory video')}</span>
                  <span className="ws-quick-sub">{tx('q_memory_sub', lang, 'Photos → video with music')}</span>
                </button>
                {/* One unified Cards hub: browse ready-made designs by occasion,
                    or create your own (blank · AI · animated wish · collage). */}
                <button className="ws-quick-tile ws-quick-tile--card" onClick={() => setShowInvites('All')}>
                  <span className="ws-quick-emoji" aria-hidden>🎉</span>
                  <span className="ws-quick-label">{tx('q_card', lang, 'Cards & wishes')}</span>
                  <span className="ws-quick-sub">{tx('q_card_sub', lang, 'Wishes, invitations & animated')}</span>
                </button>
                <button className="ws-quick-tile ws-quick-tile--design" onClick={() => openStudio('untitled-design', blankDesign(formatById('ig-post')))}>
                  <span className="ws-quick-emoji" aria-hidden>🎨</span>
                  <span className="ws-quick-label">{tx('q_design', lang, 'A design')}</span>
                  <span className="ws-quick-sub">{tx('q_design_sub', lang, 'Poster or social post')}</span>
                </button>
                <button className="ws-quick-tile ws-quick-tile--photo" onClick={() => imageInputRef.current?.click()}>
                  <span className="ws-quick-emoji" aria-hidden>🖼️</span>
                  <span className="ws-quick-label">{tx('q_photo', lang, 'Edit a photo')}</span>
                  <span className="ws-quick-sub">{tx('q_photo_sub', lang, 'Crop, filters, cut-out')}</span>
                </button>
                <button className="ws-quick-tile ws-quick-tile--doc" onClick={() => inputRef.current?.click()}>
                  <span className="ws-quick-emoji" aria-hidden>📄</span>
                  <span className="ws-quick-label">{tx('q_doc', lang, 'Open a file')}</span>
                  <span className="ws-quick-sub">{tx('q_doc_sub', lang, 'PDF, Word, Excel…')}</span>
                </button>
                <button className="ws-quick-tile ws-quick-tile--ai" onClick={() => setShowPrompt(true)}>
                  <span className="ws-quick-emoji" aria-hidden>✨</span>
                  <span className="ws-quick-label">{tx('q_ai', lang, 'Describe it')}</span>
                  <span className="ws-quick-sub">{tx('q_ai_sub', lang, 'Type it, we design it')}</span>
                </button>
              </div>

              {/* Cards for every occasion — deep-link straight into the unified
                  card gallery, pre-filtered to the tapped occasion. */}
              <div className="ws-occasions">
                <span className="ws-occasions-label">{tx('cards_for', lang, 'Cards for every occasion')}</span>
                <div className="ws-occasions-row">
                  {([['✨ Animated', 'Animated'], ['🎂 Birthday', 'Birthday'], ['💍 Wedding', 'Wedding'], ['💞 Anniversary', 'Anniversary'], ['👶 Baby', 'Baby'], ['❤️ Love', 'Love'], ['🙏 Thank You', 'Thank You'], ['🎊 Congrats', 'Congratulations'], ['🌻 Get Well', 'Get Well'], ['🪔 Festivals', 'Festivals'], ['🎄 Seasonal', 'Seasonal']] as const).map(([label, occ]) => (
                    <button key={occ} className="ws-occ-chip" onClick={() => setShowInvites(occ)}>{label}</button>
                  ))}
                  <button className="ws-occ-chip ws-occ-chip--all" onClick={() => setShowInvites('All')}>{tx('all_cards', lang, 'All cards')} →</button>
                </div>
                <button className="ws-reminders-link" onClick={() => setShowReminders(true)}>🔔 {tx('rem_set', lang, 'Never miss a birthday — set reminders')}</button>
              </div>
            </div>

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
                  <MicButton onText={(v) => setSearchQ(v)} title="Search by voice" />
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

            {/* Two clear rooms instead of one endless page: creative tools/designs
                and document starters each get a tab. */}
            <div className="ws-home-tabs" data-tour="tabs" role="tablist" aria-label="What do you want to make?">
              <button role="tab" aria-selected={homeTab === 'create'} className={'ws-home-tab' + (homeTab === 'create' ? ' ws-home-tab--sel' : '')} onClick={() => setHomeTab('create')}>🧰 {tx('tab_create', lang, 'Tools & designs')}</button>
              <button role="tab" aria-selected={homeTab === 'docs'} className={'ws-home-tab' + (homeTab === 'docs' ? ' ws-home-tab--sel' : '')} onClick={() => setHomeTab('docs')}>📄 {tx('tab_docs', lang, 'Documents')}</button>
            </div>

            {homeTab === 'create' && <>
            {/* Tools grouped by what you want to DO — so anyone can find the right
                one at a glance, no jargon. */}
            <div className="ws-cat" data-tour="cat-create">
              <div className="ws-cat-head">
                <span className="ws-cat-emoji" aria-hidden>✍️</span>
                <div className="ws-cat-heading">
                  <h2 className="ws-cat-title">{tx('cat_create', lang, 'Create something')}</h2>
                  <p className="ws-cat-sub">{tx('cat_create_sub', lang, 'Greeting cards, invitations & designs')}</p>
                </div>
              </div>
              <div className="ws-template-grid">
                <button className="ws-template-card" onClick={() => setShowInvites('All')} title="Create a greeting card — birthday, festival, anniversary, thank you and more">
                  <span className="ws-template-icon"><Icon name="invitation" size={26} /></span>
                  <span className="ws-template-name">{tx('c_invitation', lang, 'Make an invitation')}</span>
                  <span className="ws-template-desc">{tx('cd_invitation', lang, 'Birthday, wedding, party & more')}</span>
                </button>
                <button className="ws-template-card" onClick={() => setShowFamily(true)} title="Everyone in one picture — each family member sends one photo, the app composes a themed portrait (Diwali, 90s Bollywood, wedding, 1975…), the family votes, the winner becomes the WhatsApp DP">
                  <span className="ws-template-icon" aria-hidden>👨‍👩‍👧‍👦</span>
                  <span className="ws-template-name">{tx('c_family', lang, 'Family portrait')}</span>
                  <span className="ws-template-desc">{tx('cd_family', lang, 'Everyone in one themed picture')}</span>
                </button>
                <button className="ws-template-card" onClick={openReelMaker} title="Upload your own video and make a reel — add text, stickers, a voice-over, music, a cover, and export for Reels, TikTok, Shorts or Status">
                  <span className="ws-template-icon" aria-hidden>🎬</span>
                  <span className="ws-template-name">{tx('c_reel', lang, 'Make a reel')}</span>
                  <span className="ws-template-desc">{tx('cd_reel2', lang, 'Upload a video · voice-over · export')}</span>
                </button>
                <button className="ws-template-card" onClick={() => openStudio('untitled-design', blankDesign(formatById('ig-post')))} title="Start from a blank canvas">
                  <span className="ws-template-icon"><Icon name="design" size={26} /></span>
                  <span className="ws-template-name">{tx('c_blank_design', lang, 'Blank design')}</span>
                  <span className="ws-template-desc">{tx('cd_blank_design', lang, 'Start from an empty canvas')}</span>
                </button>
              </div>
            </div>

            <div className="ws-cat" data-tour="cat-photos">
              <div className="ws-cat-head">
                <span className="ws-cat-emoji" aria-hidden>🖼️</span>
                <div className="ws-cat-heading">
                  <h2 className="ws-cat-title">{tx('cat_photos', lang, 'Photos & images')}</h2>
                  <p className="ws-cat-sub">{tx('cat_photos_sub', lang, 'Compress, convert, scan, collage & more')}</p>
                </div>
              </div>
              <div className="ws-template-grid">
                <button className="ws-template-card" onClick={() => setShowCompress(true)} title="Compress images and PDFs without visible quality loss">
                  <span className="ws-template-icon"><Icon name="compress" size={26} /></span>
                  <span className="ws-template-name">{tx('c_compress', lang, 'Compress files')}</span>
                  <span className="ws-template-desc">{tx('cd_compress', lang, 'Shrink images & PDFs, privately')}</span>
                </button>
                <button className="ws-template-card" onClick={() => setShowConvert(true)} title="Convert images between formats, including HEIC to JPG">
                  <span className="ws-template-icon"><Icon name="convert" size={26} /></span>
                  <span className="ws-template-name">{tx('c_convert', lang, 'Convert images')}</span>
                  <span className="ws-template-desc">{tx('cd_convert', lang, 'HEIC→JPG, PNG, WebP, AVIF, PDF')}</span>
                </button>
                <button className="ws-template-card" onClick={() => imageInputRef.current?.click()} title="Open a photo to crop, adjust colours, apply filters, remove the background or erase objects">
                  <span className="ws-template-icon"><Icon name="image" size={26} /></span>
                  <span className="ws-template-name">{tx('c_editphoto', lang, 'Edit a photo')}</span>
                  <span className="ws-template-desc">{tx('cd_editphoto', lang, 'Crop · filters · remove background')}</span>
                </button>
                <button className="ws-template-card" onClick={() => setShowPhotoArt(true)} title="Turn any photo into a pencil sketch, cartoon, painting, pop-art, comic, vintage or noir picture — free, on your device, nothing uploaded">
                  <span className="ws-template-icon" aria-hidden>🎨</span>
                  <span className="ws-template-name">{tx('c_photoart', lang, 'Photo Art')}</span>
                  <span className="ws-template-desc">{tx('cd_photoart', lang, 'Sketch · cartoon · painting — free')}</span>
                </button>
                <button className="ws-template-card" onClick={() => setShowScan(true)} title="Scan documents with your camera into a multi-page PDF">
                  <span className="ws-template-icon"><Icon name="scan" size={26} /></span>
                  <span className="ws-template-name">{tx('c_scan', lang, 'Scan document')}</span>
                  <span className="ws-template-desc">{tx('cd_scan', lang, 'Camera → clean multi-page PDF')}</span>
                </button>
                <button className="ws-template-card" onClick={() => setShowCollage(true)} title="Arrange photos into a collage">
                  <span className="ws-template-icon"><Icon name="collage" size={26} /></span>
                  <span className="ws-template-name">{tx('c_collage', lang, 'Photo collage')}</span>
                  <span className="ws-template-desc">{tx('cd_collage', lang, 'Grid your photos into one image')}</span>
                </button>
                <button className="ws-template-card" onClick={() => setShowMeme(true)} title="Add captions to an image to make a meme">
                  <span className="ws-template-icon"><Icon name="meme" size={26} /></span>
                  <span className="ws-template-name">{tx('c_meme', lang, 'Meme maker')}</span>
                  <span className="ws-template-desc">{tx('cd_meme', lang, 'Caption any image, top & bottom')}</span>
                </button>
                <button className="ws-template-card" onClick={() => setShowWatermark(true)} title="Stamp a watermark across PDFs and images">
                  <span className="ws-template-icon"><Icon name="watermark" size={26} /></span>
                  <span className="ws-template-name">{tx('c_watermark', lang, 'Watermark')}</span>
                  <span className="ws-template-desc">{tx('cd_watermark', lang, 'Stamp PDFs & images, batch')}</span>
                </button>
              </div>
            </div>

            <div className="ws-cat" data-tour="cat-video">
              <div className="ws-cat-head">
                <span className="ws-cat-emoji" aria-hidden>🎬</span>
                <div className="ws-cat-heading">
                  <h2 className="ws-cat-title">{tx('cat_video', lang, 'Video & audio')}</h2>
                  <p className="ws-cat-sub">{tx('cat_video_sub', lang, 'Join clips, record, trim, add text & music')}</p>
                </div>
              </div>
              <div className="ws-template-grid">
                <button className="ws-template-card" onClick={() => setShowRecorder(true)} title="Record your screen or camera to a video">
                  <span className="ws-template-icon"><Icon name="record" size={26} /></span>
                  <span className="ws-template-name">{tx('c_record', lang, 'Record screen')}</span>
                  <span className="ws-template-desc">{tx('cd_record', lang, 'Screen or camera → video')}</span>
                </button>
                <button className="ws-template-card" onClick={() => { setVideoEditorReel(false); setShowVideoEditor(true); }} title="Join several videos into one — cut clips, add text and music">
                  <span className="ws-template-icon"><Icon name="videoedit" size={26} /></span>
                  <span className="ws-template-name">{tx('c_videoedit', lang, 'Video editor')}</span>
                  <span className="ws-template-desc">{tx('cd_videoedit', lang, 'Join clips · add text & music')}</span>
                </button>
                <button className="ws-template-card" onClick={() => setShowMemoryVideo(true)} title="Turn your photos into a wedding/birthday-style memory video with motion, fades and music">
                  <span className="ws-template-icon" aria-hidden>💝</span>
                  <span className="ws-template-name">{tx('c_memory', lang, 'Memory video')}</span>
                  <span className="ws-template-desc">{tx('cd_memory', lang, 'Photos → slideshow with music')}</span>
                </button>
                <button className="ws-template-card" onClick={() => setVideoFile({ file: null })} title="Trim, compress, convert or make a GIF from a video">
                  <span className="ws-template-icon"><Icon name="video" size={26} /></span>
                  <span className="ws-template-name">{tx('c_video', lang, 'Video Studio')}</span>
                  <span className="ws-template-desc">{tx('cd_video', lang, 'Trim · GIF · compress · convert')}</span>
                </button>
                <button className="ws-template-card" onClick={() => setVideoFile({ file: null, op: 'audio' })} title="Pull the sound out of any video as an audio file">
                  <span className="ws-template-icon"><Icon name="audio" size={26} /></span>
                  <span className="ws-template-name">{tx('c_extract_audio', lang, 'Extract audio')}</span>
                  <span className="ws-template-desc">{tx('cd_extract_audio', lang, 'Get the sound out of a video')}</span>
                </button>
              </div>
            </div>

            <div className="ws-cat" data-tour="cat-pdf">
              <div className="ws-cat-head">
                <span className="ws-cat-emoji" aria-hidden>📄</span>
                <div className="ws-cat-heading">
                  <h2 className="ws-cat-title">{tx('cat_pdf', lang, 'PDF tools')}</h2>
                  <p className="ws-cat-sub">{tx('cat_pdf_sub', lang, 'Fill in forms, add or remove a password')}</p>
                </div>
              </div>
              <div className="ws-template-grid">
                <button className="ws-template-card" onClick={() => formInputRef.current?.click()} title="Add fillable fields to a PDF">
                  <span className="ws-template-icon"><Icon name="form" size={26} /></span>
                  <span className="ws-template-name">{tx('c_form', lang, 'PDF form builder')}</span>
                  <span className="ws-template-desc">{tx('cd_form', lang, 'Add fillable fields to a PDF')}</span>
                </button>
                <button className="ws-template-card" onClick={() => setShowProtect(true)} title="Password-protect or unlock a PDF">
                  <span className="ws-template-icon"><Icon name="lock" size={26} /></span>
                  <span className="ws-template-name">{tx('c_protect', lang, 'Protect PDF')}</span>
                  <span className="ws-template-desc">{tx('cd_protect', lang, 'Add or remove a password')}</span>
                </button>
              </div>
            </div>

            {STUDIO_TEMPLATES.length > 0 && (
              <div className="ws-cat" data-tour="cat-designs">
                <div className="ws-cat-head">
                  <span className="ws-cat-emoji" aria-hidden>✨</span>
                  <div className="ws-cat-heading">
                    <h2 className="ws-cat-title">{tx('cat_templates', lang, 'Ready-made designs')}</h2>
                    <p className="ws-cat-sub">{tx('cat_templates_sub', lang, 'Pick one and just change the words')}</p>
                  </div>
                </div>
                {/* Ready-made designs now live inside the single Cards hub (with
                    occasion → sub-type browsing), so the home shows ONE entry
                    into them instead of duplicating the whole grid here. */}
                <button className="ws-readymade-cta" onClick={() => setShowInvites('All')}>
                  <span className="ws-readymade-emoji" aria-hidden>🎉</span>
                  <span className="ws-readymade-text">
                    <strong>{tx('browse_readymade', lang, 'Browse all ready-made designs')}</strong>
                    <span>{tx('browse_readymade_sub', lang, 'Cards, wishes, invitations, reels, promos & more — pick an occasion')}</span>
                  </span>
                  <span className="ws-readymade-go" aria-hidden>→</span>
                </button>
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
            </>}

            {homeTab === 'docs' && (() => {
              void tplVer; // re-read on bump
              const custom = customDocTemplates();
              return (
                <div className="ws-templates">
                  <div className="ws-templates-bar">
                    <TkxButton variant="link" size="sm" className="ws-template-link" onClick={exportTemplates} isDisabled={!loadCustomTemplates().length} disabled={!loadCustomTemplates().length} title="Download your saved templates as JSON">⤓ Export my templates</TkxButton>
                    <TkxButton variant="link" size="sm" className="ws-template-link" onClick={() => tplFileRef.current?.click()} title="Import templates from a JSON file">⤒ Import templates</TkxButton>
                    <TkxButton variant="link" size="sm" className="ws-template-link" onClick={() => setShowCombine(true)} title="Combine several saved designs (e.g. a card set) into one PDF">🗎 Combine to PDF</TkxButton>
                    <TkxButton variant="link" size="sm" className="ws-template-link" onClick={() => setShowSign(true)} title="Create or verify a private digital signature for any file">🔏 Sign / verify</TkxButton>
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
                  <h2 className="ws-templates-title">{tx('h_start_template', lang, '…or start from a template')}</h2>
                  <div className="ws-template-grid">
                    {/* Presentations are retired from Pyntra's home — decks are
                        filtered out (opened .pptx files still edit fine). */}
                    {TEMPLATES.filter((t) => t.kind !== 'slides').map((t) => (
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

            {/* Site footer — legal/info links (also satisfies ad-network and
                store review requirements that these be reachable from the app). */}
            <footer className="ws-site-footer">
              <nav className="ws-site-footer-nav">
                <a href="/about">{tx('foot_about', lang, 'About')}</a>
                <a href="/contact">{tx('foot_contact', lang, 'Contact')}</a>
                <a href="/privacy">{tx('foot_privacy', lang, 'Privacy Policy')}</a>
                <a href="/terms">{tx('foot_terms', lang, 'Terms')}</a>
                <a href="/docs">{tx('nav_docs', lang, 'Docs')}</a>
              </nav>
              <p className="ws-site-footer-copy">© 2026 Pyntra · Private, in your browser · Your files never leave your device.</p>
            </footer>
          </div>
        )}
        {!pdf && doc?.kind === 'text' && <TextEditor key={seq} docId={doc.id} name={doc.name} ext={doc.ext} bytes={doc.bytes} onOpenInPdf={openInPdf} initialThemeId={doc.themeId} collabRoom={doc.collabRoom} />}
        {!pdf && doc?.kind === 'sheet' && <SheetEditor key={seq} docId={doc.id} name={doc.name} ext={doc.ext} bytes={doc.bytes} onOpenInPdf={openInPdf} initialThemeId={doc.themeId} collabRoom={doc.collabRoom} />}
        {!pdf && doc?.kind === 'word' && <DocxEditor key={seq} docId={doc.id} name={doc.name} initialHtml={doc.html ?? ''} onOpenInPdf={openInPdf} initialThemeId={doc.themeId} collabRoom={doc.collabRoom} />}
        {!pdf && doc?.kind === 'slides' && <SlideEditor key={seq} docId={doc.id} name={doc.name} slides={doc.slides ?? []} original={doc.bytes} onOpenInPdf={openInPdf} initialThemeId={doc.themeId} collabRoom={doc.collabRoom} />}
      </main>
      {/* Sticky anchor ad — renders nothing unless AdSense is configured. */}
      <AdSlot kind="anchor" />
    </div>
  );
}
