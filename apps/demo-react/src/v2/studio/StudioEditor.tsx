/**
 * Design Studio editor — an in-browser, Express-style design canvas. Renders the
 * Design model as an interactive SVG: click to select, drag to move, drag the
 * handle to resize; a properties panel edits the selected element; the top bar
 * swaps templates, resizes to any format in one click, and exports to PNG / PDF /
 * SVG (or hands off to the PDF editor). Everything is local — nothing uploads.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TkxButton, TkxSelect, TkxDrawer } from 'tekivex-ui';
import { useIsMobile } from '../useIsMobile.js';
import { t, useLang } from '../../i18n.js';
import {
  type Design, type Element, type TextEl, type RectEl, type EllipseEl, type LineEl, type ImageEl,
  newElId, resizeDesign, FORMATS, formatById, moveLayer, blankDesign, type LayerOp,
  IMAGE_SHAPES, IMAGE_SHAPE_CLIPS, imageShadowParams, MOTION_CSS, MOTION_BASE_SECONDS, ELEMENT_MOTIONS, type ImageShape, type ImageShadow, type ElementMotion,
} from './model.js';
import { STUDIO_TEMPLATES } from './templates.js';
import { SACRED_IMAGES, SACRED_ATTRIBUTION } from './sacredArt.js';
import { BACKGROUND_EFFECTS, effectParticles, effectRises, type BackgroundEffect } from './effects.js';
import { PHOTO_FX } from './photoFx.js';
import { DrawModal, ImageLinkModal } from './DrawModal.js';
import { TemplateGalleryModal } from './TemplateGalleryModal.js';
import { exportDesignPng, exportDesignPdf, exportDesignSvg, designToPdf } from './exportDesign.js';
import { MailMergeModal } from './MailMergeModal.js';
import { MagicResizeModal } from './MagicResizeModal.js';
import { LayersPanel } from './LayersPanel.js';
import { ToolbarMenu } from './ToolbarMenu.js';
import { PagesRail } from './PagesRail.js';
import { TranslateDesignModal } from './TranslateDesignModal.js';
import { AnimateModal } from './AnimateModal.js';
import type { AnimPreset } from './animate.js';
import { exportDesignsPdf } from './exportDesign.js';
import { VersionHistoryModal } from '../VersionHistoryModal.js';
import { CommentsModal } from '../CommentsModal.js';
import { getActiveBrandKit, type BrandKit } from './brandStore.js';
import { listFonts, addFontFromFile, registerFonts, fontFaceCss, usedFontFamilies, type CustomFont } from './fontStore.js';
import { brandAudit, applyBrand, hexToRgb } from './brandEnforce.js';
import { exportTemplatePack, parseTemplatePack, reidPages } from './templatePack.js';
import { addComment, resolveComment, deleteComment, commentsFor, annotatedElements, reconcile, type AnchoredComment } from './anchoredComments.js';
import { downloadBytes } from '../smart/util.js';
import { BrandManager } from './BrandManager.js';
import { ImageStudio } from './ImageStudio.js';
import { AiImageModal } from '../cloud/AiImageModal.js';
import { QrModal } from './QrModal.js';
import { AvatarModal } from './AvatarModal.js';
import { CLIPART_CATEGORIES, clipartByCategory, svgToDataUrl } from './clipart.js';
import { computeSnap, type Guide } from './snap.js';
import { designToEntries, entriesToDesign, changedEntries } from './collabDesign.js';
import { useCollabMap } from '../collab/useCollabMap.js';
import { ChatPanel } from '../collab/ChatPanel.js';
import { ScreenSharePanel } from '../collab/ScreenSharePanel.js';
import { encodeSignal, decodeSignal, type Signal } from '../collab/rtc.js';
import { InviteModal } from '../collab/InviteModal.js';
import { newMessage, fileMessage, systemMessage, addMessage, mergeMessages, humanSize, splitChunks, joinChunks, type ChatMessage } from '../collab/chat.js';
import { compressImage, isCompressibleImage } from './compress.js';
import { randomToken } from '../collab/crypto.js';
import { deviceId, type Invite } from '../collab/invites.js';
import { buildGatedUrl } from '../collab/link.js';
import { useShareLink } from '../collab/useShareLink.js';
import { useGatedHost } from '../collab/useGatedHost.js';
import { CollabBar } from '../collab/CollabBar.js';
import type { Room } from '../collab/link.js';
import { useAutosave } from '../persist/useAutosave.js';

interface Props {
  name: string;
  initial: Design;
  /** Optional saved campaign pages; when present the editor opens multi-page. */
  initialPages?: Design[];
  /** Default entrance animation (set by animated templates) for the Animate export. */
  defaultAnim?: AnimPreset;
  /** Saved element-anchored review comments. */
  initialComments?: AnchoredComment[];
  /** Open a recorded call clip in the Video Studio to trim / add audio / edit. */
  onEditVideo?: (file: File) => void;
  onOpenInPdf: (bytes: Uint8Array, name: string) => void;
  /** When set, the design autosaves to the library under this id. */
  docId?: string;
  /** When set, the editor joins this live collaboration room on mount. */
  collabRoom?: Room;
}

const SWATCHES = ['#0f172a', '#2e5bff', '#ef4444', '#f97316', '#eab308', '#22c55e', '#0ea5e9', '#a855f7', '#ec4899', '#ffffff', '#94a3b8', '#000000'];
const FONTS = [
  { value: 'Inter, system-ui, sans-serif', label: 'Inter' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: "'Times New Roman', serif", label: 'Times' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'ui-monospace, Menlo, monospace', label: 'Mono' },
];

type Drag = { mode: 'move' | 'resize'; id: string; px: number; py: number; x: number; y: number; w: number; h: number; recorded?: boolean; group?: { id: string; x: number; y: number }[] };

export function StudioEditor({ name, initial, initialPages, defaultAnim, initialComments, onEditVideo, onOpenInPdf, docId, collabRoom }: Props) {
  const lang = useLang();
  const isMobile = useIsMobile();
  // The studio toolbar is dense (14+ secondary controls). Collapsing it only
  // on phones left tablets and small laptops with a bar that WRAPPED into
  // three rows and squeezed the canvas to a sliver — so collapse well before
  // that, and group the actions tool-wise inside the sheet.
  // Always true: measured, the inline row needs ~1700px to fit on one line, so
  // even a 1440px laptop wrapped into two rows. One predictable, grouped
  // toolbar on every device beats a bar that changes shape with the viewport.
  const compactBar = true;
  // On phones the dense action bar collapses into this bottom sheet.
  const [moreOpen, setMoreOpen] = useState(false);
  const [comments, setComments] = useState<AnchoredComment[]>(initialComments ?? []);
  const commentsRef = useRef(comments); commentsRef.current = comments;
  // Multi-page "campaign": `pages` holds every page; `design` is the live working
  // copy of the active page (all the editing machinery below stays single-design).
  const [pages, setPages] = useState<Design[]>(() => (initialPages && initialPages.length ? initialPages : [initial]));
  const [active, setActive] = useState(0);
  const [design, setDesign] = useState<Design>(() => (initialPages && initialPages.length ? initialPages[0]! : initial));
  const [selected, setSelected] = useState<string[]>([]);
  const selectedRef = useRef<string[]>([]);
  selectedRef.current = selected;
  const [guides, setGuides] = useState<Guide[]>([]);
  const [busy, setBusy] = useState(false);
  const [brand, setBrand] = useState<BrandKit | null>(null);
  const [showBrand, setShowBrand] = useState(false);
  const [editingImg, setEditingImg] = useState<{ id: string; href: string } | null>(null);
  const [showAi, setShowAi] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [showMagicResize, setShowMagicResize] = useState(false);
  const [showTranslate, setShowTranslate] = useState(false);
  const [showAnimate, setShowAnimate] = useState(false);
  // On phones the rail + properties collapse into bottom sheets so the canvas
  // gets the whole screen; this tracks which (if any) is open.
  const [mobilePanel, setMobilePanel] = useState<'add' | 'edit' | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [showGods, setShowGods] = useState(false);
  const [godsBusy, setGodsBusy] = useState(false);
  const [showClipart, setShowClipart] = useState(false);
  const [showAvatar, setShowAvatar] = useState(false);
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  // Tap-to-fill photo slots: which placeholder element the picked file goes to.
  const photoTargetRef = useRef<string | null>(null);
  const placeholderPhotoRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const fontFileRef = useRef<HTMLInputElement | null>(null);
  const tplFileRef = useRef<HTMLInputElement | null>(null);
  const [tplErr, setTplErr] = useState<string | null>(null);
  // Template picking happens in a visual gallery (thumbnails + category tabs);
  // the toolbar button keeps showing what was applied.
  const [appliedTpl, setAppliedTpl] = useState<string | null>(null);
  const [showGallery, setShowGallery] = useState(false);
  const [showDraw, setShowDraw] = useState(false);
  const [showImgLink, setShowImgLink] = useState(false);
  // Transient "✓ done" confirmation — action menus reset to their placeholder,
  // so without this the user gets no visible sign their pick did anything.
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => { if (!flash) return; const id = setTimeout(() => setFlash(null), 2600); return () => clearTimeout(id); }, [flash]);
  // Tap/click-to-place. Adding an element arms a one-shot "tap to move it there":
  // the element already exists and is selected (so nothing is lost and it stays
  // draggable), and the next tap on the canvas — touch or mouse — repositions its
  // centre. That's the simple "put it where I tap" flow, instead of everything
  // always landing in the middle.
  const [placing, setPlacing] = useState<{ id: string; label: string } | null>(null);
  const placingRef = useRef<{ id: string; label: string } | null>(null);
  useEffect(() => { placingRef.current = placing; }, [placing]);
  // The banner is a brief prompt — if the user ignores it, the element just stays
  // where it was added. Clear it after a few seconds so it never sticks around.
  useEffect(() => { if (!placing) return; const id = setTimeout(() => setPlacing(null), 6000); return () => clearTimeout(id); }, [placing]);

  // Undo / redo history. `record()` snapshots the *current* design as a restore
  // point; continuous edits (sliders, colour pickers, dragging) are coalesced into
  // a single entry via begin/endInteraction so undo steps are meaningful.
  const designRef = useRef(design);
  designRef.current = design;
  const pagesRef = useRef(pages); pagesRef.current = pages;
  const activeRef = useRef(active); activeRef.current = active;
  /** The full page list with the active page reflecting the live edits. */
  const pagesWithActive = useCallback((): Design[] => pagesRef.current.map((p, i) => (i === activeRef.current ? designRef.current : p)), []);
  const histRef = useRef<{ past: Design[]; future: Design[] }>({ past: [], future: [] });
  const interactingRef = useRef(false);
  const lastNudgeRef = useRef(0);
  const [, bumpHist] = useState(0);
  const record = useCallback(() => {
    const h = histRef.current;
    h.past.push(designRef.current);
    if (h.past.length > 80) h.past.shift();
    h.future = [];
    bumpHist((n) => n + 1);
  }, []);
  const commit = useCallback((producer: (d: Design) => Design) => { record(); setDesign(producer); }, [record]);
  const beginInteraction = useCallback(() => { if (!interactingRef.current) { record(); interactingRef.current = true; } }, [record]);
  const endInteraction = useCallback(() => { interactingRef.current = false; }, []);
  const undo = useCallback(() => {
    const h = histRef.current;
    if (!h.past.length) return;
    h.future.unshift(designRef.current);
    setDesign(h.past.pop()!);
    setSelected([]);
    bumpHist((n) => n + 1);
  }, []);
  const redo = useCallback(() => {
    const h = histRef.current;
    if (!h.future.length) return;
    h.past.push(designRef.current);
    setDesign(h.future.shift()!);
    setSelected([]);
    bumpHist((n) => n + 1);
  }, []);
  const canUndo = histRef.current.past.length > 0;
  const canRedo = histRef.current.future.length > 0;

  // Live collaboration: the design syncs element-by-element (images included).
  const { room, isHost, copied, share, copyLink } = useShareLink('design', collabRoom);
  const lastEntriesRef = useRef<Record<string, string>>(designToEntries(initial));
  // In-room chat rides the same encrypted map under reserved 'chat:' keys
  // (entriesToDesign ignores them, so design sync is unaffected).
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  // Read receipts ride reserved 'read:<deviceId>' keys (a per-peer high-water
  // mark); entriesToDesign ignores them like 'chat:'/'rtc:'.
  const [readCursors, setReadCursors] = useState<Record<string, number>>({});
  // The rtc signalling keys I wrote for the current call (tombstoned on leave).
  const myRtcKeysRef = useRef<string[]>([]);
  // Chat attachments are chunked across reserved 'media:<fid>:<i>' keys (one chunk
  // per map entry → one relay frame each) and reassembled on receipt, so images,
  // video and any file all reach every peer. fid → (chunkIndex → base64 piece).
  const mediaPartsRef = useRef(new Map<string, Map<number, string>>());
  const assembledRef = useRef(new Map<string, string>()); // fid → full data URL (cached)
  const completedRef = useRef(new Set<string>());
  const [mediaTick, setMediaTick] = useState(0);
  const myId = useRef(deviceId()).current;
  // Video-call signalling rides the room map under 'rtc:' keys (ephemeral; design
  // sync ignores them). Handlers registered by the CallPanel receive new signals.
  const [showCall, setShowCall] = useState(false);
  // A shared 'call:active' flag so peers get a 'call in progress · Join' banner.
  const [callInfo, setCallInfo] = useState<{ by: string; at: number; callId?: string } | null>(null);
  const rtcHandlers = useRef(new Set<(s: Signal) => void>());
  const rtcSeen = useRef(new Set<string>());
  const rtcSeq = useRef(0);
  // Each call session gets a fresh id; signalling keys are namespaced by it
  // (rtc:<callId>:<from>:<seq>) so a new call never replays stale offers/ICE left
  // behind in the never-pruned LWW map by previous calls.
  const callIdRef = useRef('');
  // Per-room invites (access control), persisted locally for the host.
  const [showInvite, setShowInvite] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const inviteKey = room ? `pyntra:invites:${room.roomId}` : '';
  useEffect(() => {
    if (!inviteKey) return;
    try { setInvites(JSON.parse(localStorage.getItem(inviteKey) || '[]')); } catch { setInvites([]); }
  }, [inviteKey]);
  const updateInvites = (next: Invite[]) => { setInvites(next); try { if (inviteKey) localStorage.setItem(inviteKey, JSON.stringify(next)); } catch { /* */ } };
  // Host the gated handshake: when invites exist, answer join-requests over the
  // gate channel and deliver the room key only to admitted devices.
  useGatedHost({ room, isHost, invites, onInvitesChange: updateInvites });
  const collab = useCollabMap({
    room, name: 'You', isHost,
    seed: () => designToEntries(designRef.current),
    onRemote: (entries) => {
      lastEntriesRef.current = entries;
      setDesign(entriesToDesign(entries));
      const incoming = Object.keys(entries).filter((k) => k.startsWith('chat:'))
        .map((k) => { try { return JSON.parse(entries[k]!) as ChatMessage; } catch { return null; } })
        .filter((m): m is ChatMessage => !!m);
      if (incoming.length) setChatLog((cur) => mergeMessages(cur, incoming));
      // Peers' read cursors → drives delivered/read ticks on my messages.
      const cursors: Record<string, number> = {};
      for (const k of Object.keys(entries)) {
        if (!k.startsWith('read:')) continue;
        try { const v = JSON.parse(entries[k]!) as { ts?: number }; if (typeof v?.ts === 'number') cursors[k.slice(5)] = v.ts; } catch { /* ignore */ }
      }
      if (Object.keys(cursors).length) setReadCursors((p) => ({ ...p, ...cursors }));
      // Chat attachment chunks ('media:<fid>:<i>') → collect for reassembly.
      let gotMedia = false;
      for (const k of Object.keys(entries)) {
        if (!k.startsWith('media:')) continue;
        const rest = k.slice(6);
        const ix = rest.lastIndexOf(':');
        if (ix < 0) continue;
        const fid = rest.slice(0, ix);
        if (completedRef.current.has(fid)) continue;
        const i = Number(rest.slice(ix + 1));
        const v = entries[k]!;
        if (!Number.isInteger(i) || !v) continue;
        let mp = mediaPartsRef.current.get(fid);
        if (!mp) { mp = new Map(); mediaPartsRef.current.set(fid, mp); }
        if (!mp.has(i)) { mp.set(i, v); gotMedia = true; }
      }
      if (gotMedia) setMediaTick((n) => n + 1);
      // New call signals → fan out to the CallPanel's mesh. Only deliver signals
      // from the CURRENT call session (key = rtc:<callId>:<from>:<seq>); keys from
      // past calls carry a different callId and are ignored, so a freshly-opened
      // CallPanel never replays stale offers/answers/ICE.
      for (const k of Object.keys(entries)) {
        if (!k.startsWith('rtc:') || rtcSeen.current.has(k)) continue;
        if (k.split(':')[1] !== callIdRef.current) continue;
        rtcSeen.current.add(k);
        const sig = decodeSignal(entries[k]!);
        if (sig) for (const h of rtcHandlers.current) h(sig);
      }
      // Shared call status → 'call in progress' banner for peers.
      if ('call:active' in entries) {
        try { const v = entries['call:active'] ? JSON.parse(entries['call:active']!) : null; setCallInfo(v && typeof v.at === 'number' ? v : null); } catch { setCallInfo(null); }
      }
    },
  });
  // Announce/clear the call so others can join. Cleared when the starter leaves.
  useEffect(() => {
    if (!room) return;
    if (showCall) {
      // Join an in-progress call's session id, or mint a fresh one as the starter
      // (always fresh on start, so re-starting a call never reuses an old id).
      const adopt = callInfo && callInfo.by !== myId && callInfo.callId;
      callIdRef.current = adopt ? callInfo.callId! : randomToken(8);
      myRtcKeysRef.current = []; // fresh accounting for this call's signalling keys
      // Only the starter advertises the call (preserves 'starter leaves → clear
      // banner'); joiners just adopt the id silently.
      if (!adopt) collab.set({ 'call:active': JSON.stringify({ by: myId, at: Date.now(), callId: callIdRef.current }) });
    } else {
      // Left the call: tombstone my signalling keys (post-call SDP/ICE is dead and
      // callId-filtered anyway) so they don't accumulate in the room snapshot.
      if (myRtcKeysRef.current.length) {
        const upd: Record<string, string> = {};
        for (const k of myRtcKeysRef.current) upd[k] = '';
        collab.set(upd);
        myRtcKeysRef.current = [];
      }
      if (callInfo?.by === myId) collab.set({ 'call:active': '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCall, room]);
  // Fresh call by someone else that we haven't joined → show the Join banner.
  const incomingCall = !!callInfo && callInfo.by !== myId && !showCall && Date.now() - callInfo.at < 4 * 3600_000;
  const sendSignal = (s: Signal) => {
    const key = 'rtc:' + callIdRef.current + ':' + myId + ':' + (rtcSeq.current++);
    myRtcKeysRef.current.push(key);
    collab.set({ [key]: encodeSignal(s) });
  };
  const registerIncoming = (h: (s: Signal) => void) => { rtcHandlers.current.add(h); return () => { rtcHandlers.current.delete(h); }; };
  const sendChat = (text: string) => {
    const m = newMessage('Guest', myId, text);
    setChatLog((cur) => addMessage(cur, m));
    collab.set({ ['chat:' + m.id]: JSON.stringify(m) });
  };
  // Stable so ChatPanel's read-broadcast effect doesn't re-subscribe each render.
  const markRead = useCallback((ts: number) => { collab.set({ ['read:' + myId]: JSON.stringify({ ts }) }); }, [collab.set, myId]);
  const sendChatFile = (file: File) => {
    void (async () => {
      let blob: Blob = file;
      let mime = file.type || 'application/octet-stream';
      // Images: downscale + re-encode first to cut transfer size (still chunked
      // below). Falls back to the original if compression fails.
      if (/^image\//.test(mime) && isCompressibleImage(mime, file.name)) {
        try { const c = await compressImage(file, { format: 'webp', quality: 0.82, maxDimension: 1600 }); blob = c.blob; mime = c.mime; }
        catch { /* keep original */ }
      }
      // Generous cap to protect memory / room-snapshot size (base64 ≈ 1.37× blob).
      if (blob.size > 60 * 1024 * 1024) {
        setChatLog((cur) => addMessage(cur, systemMessage(`“${file.name}” is too large to share here (${humanSize(blob.size)}). Max ~60 MB.`)));
        return;
      }
      const r = new FileReader();
      r.onload = () => {
        // Chunk the data URL across separate map keys so it crosses multiple relay
        // frames and is reassembled by every peer — images, video, any file.
        const data = String(r.result);
        const fid = randomToken(8);
        const pieces = splitChunks(data);
        const localParts = new Map<number, string>();
        pieces.forEach((c, i) => localParts.set(i, c));
        mediaPartsRef.current.set(fid, localParts); // sender renders it immediately
        pieces.forEach((c, i) => collab.set({ ['media:' + fid + ':' + i]: c }));
        const m = fileMessage('Guest', myId, { name: file.name, size: blob.size, mime, ref: 'media:' + fid, parts: pieces.length });
        setChatLog((cur) => addMessage(cur, m));
        setMediaTick((n) => n + 1);
        collab.set({ ['chat:' + m.id]: JSON.stringify(m) });
      };
      r.readAsDataURL(blob);
    })();
  };
  // Resolve each file message's chunks → a full data URL once all parts arrive,
  // plus progress (have/need) for a "receiving…" placeholder meanwhile.
  const media = useMemo(() => {
    const out: Record<string, { url?: string; have: number; need: number }> = {};
    for (const m of chatLog) {
      if (m.kind !== 'file' || !m.file || !m.file.ref.startsWith('media:')) continue;
      const fid = m.file.ref.slice(6);
      const need = m.file.parts ?? 1;
      const cached = assembledRef.current.get(fid);
      if (cached) { out[fid] = { url: cached, have: need, need }; continue; }
      const mp = mediaPartsRef.current.get(fid);
      const have = mp ? mp.size : 0;
      let url: string | undefined;
      if (mp && have >= need) {
        const arr: (string | undefined)[] = [];
        for (let i = 0; i < need; i++) arr.push(mp.get(i));
        const joined = joinChunks(arr);
        if (joined !== null) { url = joined; assembledRef.current.set(fid, joined); completedRef.current.add(fid); mediaPartsRef.current.delete(fid); }
      }
      out[fid] = { url, have, need };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatLog, mediaTick]);
  // Push only the entries that changed (debounced); round-trip stability means a
  // just-applied remote change diffs to nothing, so there's no echo.
  useEffect(() => {
    if (!room) return;
    const t = setTimeout(() => {
      const cur = designToEntries(designRef.current);
      const diff = changedEntries(lastEntriesRef.current, cur);
      if (Object.keys(diff).length) { collab.set(diff); lastEntriesRef.current = cur; }
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design, room]);

  const sel = selected.length === 1 ? design.elements.find((e) => e.id === selected[0]) ?? null : null;

  // Autosave the design to the offline library so it reopens after a refresh.
  useAutosave(docId, () => (docId ? { id: docId, name, ext: 'design', kind: 'design', updatedAt: Date.now(), content: { design, pages: pagesWithActive(), anchoredComments: comments } } : null), [design, pages, active, comments, name, docId]);

  // Element-anchored review comments. Reconcile keeps threads when an element is
  // deleted (marks them orphaned) and revives them if it returns.
  useEffect(() => {
    const live = new Map(pagesWithActive().map((p, i) => [i, new Set(p.elements.map((e) => e.id))]));
    setComments((cur) => { const next = reconcile(cur, live); return next === cur ? cur : next; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design.elements, pages.length]);
  const addCommentToSel = (text: string) => {
    const id = selectedRef.current[0]; const t = text.trim();
    if (!id || !t) return;
    setComments((cur) => addComment(cur, { id: newElId(), page: activeRef.current, elementId: id, author: 'You', text: t, createdAt: Date.now() }));
  };

  // Pull in the active brand kit (palette, logo, fonts); refresh when the manager closes.
  const loadBrand = useCallback(() => { void getActiveBrandKit().then((k) => setBrand(k ?? null)); }, []);
  useEffect(() => { loadBrand(); }, [loadBrand]);

  // Load any uploaded custom fonts and register them so they render on-canvas.
  useEffect(() => { void listFonts().then((fs) => { setCustomFonts(fs); void registerFonts(fs); }); }, []);
  const addFontFile = async (file: File) => {
    const f = await addFontFromFile(file);
    await registerFonts([f]);
    setCustomFonts((cur) => [...cur, f]);
  };
  /** @font-face CSS for the custom fonts used across the given designs (for export). */
  const fontCssFor = useCallback((designs: Design[]): string => fontFaceCss(customFonts, [...new Set(designs.flatMap(usedFontFamilies))]), [customFonts]);

  // Brand colours lead the swatch palette; brand fonts head the font list, then
  // any uploaded custom fonts, then the built-ins.
  const palette = brand ? [...new Set([...brand.colors, ...SWATCHES])] : SWATCHES;
  const customFontOpts = customFonts.map((f): FontOpt => ({ value: `'${f.family}'`, label: f.family }));
  const fonts: FontOpt[] = [...new Map<string, FontOpt>([
    ...(brand ? [['heading', { value: brand.fonts.heading, label: 'Brand heading' }], ['body', { value: brand.fonts.body, label: 'Brand body' }]] as [string, FontOpt][] : []),
    ...customFontOpts.map((f): [string, FontOpt] => [f.value, f]),
    ...FONTS.map((f): [string, FontOpt] => [f.value, f]),
  ]).values()];

  // Brand-aware defaults for new elements (auto-apply the brand on creation) and
  // a live on-brand/off-brand audit of the current page.
  const lum = (c: string) => { const r = hexToRgb(c); return r ? 0.299 * r[0] + 0.587 * r[1] + 0.114 * r[2] : 255; };
  const brandFill = brand?.colors[0];
  const brandText = brand ? [...brand.colors].sort((a, b) => lum(a) - lum(b))[0] : undefined;
  const brandHeading = brand?.fonts.heading ?? FONTS[0]!.value;
  const brandStatus = brand ? brandAudit(design, brand) : null;

  const patch = useCallback((id: string, p: Partial<Element>) => {
    setDesign((d) => ({ ...d, elements: d.elements.map((e) => (e.id === id ? { ...e, ...p } as Element : e)) }));
  }, []);

  // Map a pointer event to artboard coordinates.
  const toArt = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * design.w, y: ((clientY - r.top) / r.height) * design.h };
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const dg = dragRef.current;
      if (!dg) return;
      const { x, y } = toArt(e.clientX, e.clientY);
      let dx = x - dg.px, dy = y - dg.py;
      if (!dg.recorded && (Math.abs(dx) > 0 || Math.abs(dy) > 0)) { dg.recorded = true; record(); } // one history entry per drag
      if (dg.mode === 'resize') {
        const isLine = designRef.current.elements.find((z) => z.id === dg.id)?.type === 'line';
        // A line's endpoint moves freely (any direction); shapes keep a min size.
        if (isLine) patch(dg.id, { w: Math.round(dg.w + dx), h: Math.round(dg.h + dy) });
        else patch(dg.id, { w: Math.max(8, Math.round(dg.w + dx)), h: Math.max(8, Math.round(dg.h + dy)) });
        return;
      }
      // Snap the primary element's proposed rect against the artboard + other
      // (non-moving) elements, then shift the whole group by the snapped delta.
      const moving = new Set(dg.group?.map((g) => g.id) ?? [dg.id]);
      const others = designRef.current.elements.filter((el) => !moving.has(el.id)).map((el) => ({ x: el.x, y: el.y, w: el.w, h: el.h }));
      const px = svgRef.current?.getBoundingClientRect().width || design.w;
      const snap = computeSnap({ x: dg.x + dx, y: dg.y + dy, w: dg.w, h: dg.h }, others, design.w, design.h, (7 * design.w) / px);
      dx += snap.x - (dg.x + dx); dy += snap.y - (dg.y + dy);
      setGuides(snap.guides);
      setDesign((d) => ({ ...d, elements: d.elements.map((el) => {
        const g = dg.group?.find((z) => z.id === el.id);
        return g ? ({ ...el, x: Math.round(g.x + dx), y: Math.round(g.y + dy) } as Element) : el;
      }) }));
    };
    const up = () => {
      const dg = dragRef.current;
      // A tap (press + release with zero movement) on an unfilled photo slot
      // opens the picker - dragging it still just moves it.
      if (dg && dg.mode === 'move' && !dg.recorded) {
        const el = designRef.current.elements.find((z) => z.id === dg.id);
        if (el && el.type === 'image' && (el as ImageEl).placeholder && !(el as ImageEl).href) {
          photoTargetRef.current = el.id;
          placeholderPhotoRef.current?.click();
        }
      }
      dragRef.current = null; setGuides([]);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design.w, design.h, patch, record]);

  const startMove = (e: React.PointerEvent, el: Element) => {
    e.stopPropagation();
    if (el.locked) { setSelected([]); return; } // locked: ignore canvas drag/select (unlock from the Layers panel)
    const cur = selectedRef.current;
    let ids: string[];
    if (e.shiftKey) {
      ids = cur.includes(el.id) ? cur.filter((i) => i !== el.id) : [...cur, el.id];
      setSelected(ids);
      if (!ids.includes(el.id)) { dragRef.current = null; return; } // just removed it — no drag
    } else {
      ids = cur.includes(el.id) && cur.length > 1 ? cur : [el.id];
      setSelected(ids);
    }
    const { x, y } = toArt(e.clientX, e.clientY);
    const els = designRef.current.elements;
    const group = ids.map((id) => { const g = els.find((z) => z.id === id)!; return { id, x: g.x, y: g.y }; });
    dragRef.current = { mode: 'move', id: el.id, px: x, py: y, x: el.x, y: el.y, w: el.w, h: el.h, group };
  };
  const startResize = (e: React.PointerEvent, el: Element) => {
    e.stopPropagation();
    const { x, y } = toArt(e.clientX, e.clientY);
    dragRef.current = { mode: 'resize', id: el.id, px: x, py: y, x: el.x, y: el.y, w: el.w, h: el.h };
  };

  const add = (el: Element) => { commit((d) => ({ ...d, elements: [...d.elements, el] })); setSelected([el.id]); setMobilePanel(null); };
  const duplicateSelected = () => {
    const ids = selectedRef.current;
    const copies = designRef.current.elements.filter((e) => ids.includes(e.id)).map((e) => ({ ...e, id: newElId(), x: e.x + 24, y: e.y + 24 } as Element));
    if (!copies.length) return;
    commit((d) => ({ ...d, elements: [...d.elements, ...copies] }));
    setSelected(copies.map((c) => c.id));
  };
  const removeSelected = () => {
    const ids = selectedRef.current;
    if (!ids.length) return;
    commit((d) => ({ ...d, elements: d.elements.filter((e) => !ids.includes(e.id)) }));
    setSelected([]);
  };
  /** Select every visible, unlocked element (Ctrl/Cmd+A). */
  const selectAll = () => setSelected(designRef.current.elements.filter((e) => !e.hidden && !e.locked).map((e) => e.id));
  // Layers panel actions.
  const reorderLayer = (id: string, op: LayerOp) => commit((d) => ({ ...d, elements: moveLayer(d.elements, id, op) }));
  const toggleHidden = (id: string) => commit((d) => ({ ...d, elements: d.elements.map((e) => (e.id === id ? { ...e, hidden: !e.hidden } as Element : e)) }));
  const toggleLocked = (id: string) => {
    commit((d) => ({ ...d, elements: d.elements.map((e) => (e.id === id ? { ...e, locked: !e.locked } as Element : e)) }));
    setSelected((cur) => cur.filter((s) => s !== id)); // can't keep a now-locked element selected for editing
  };
  // ── Pages (campaign) ──────────────────────────────────────────────────────
  // Each switch first folds the live edits back into the page list, then loads
  // the target page. History is per-page (cleared on switch) to keep undo sane.
  const loadPage = (next: Design[], idx: number) => {
    const i = Math.max(0, Math.min(idx, next.length - 1));
    setPages(next); setActive(i); setDesign(next[i]!); setSelected([]);
    histRef.current = { past: [], future: [] }; bumpHist((n) => n + 1);
  };
  const gotoPage = (i: number) => { if (i !== activeRef.current) loadPage(pagesWithActive(), i); };
  const addPage = () => {
    const cur = designRef.current;
    const blank: Design = { ...blankDesign(formatById('ig-post')), w: cur.w, h: cur.h, background: cur.background };
    const merged = pagesWithActive();
    loadPage([...merged, blank], merged.length);
  };
  const duplicatePage = () => {
    const merged = pagesWithActive();
    const a = activeRef.current;
    const copy: Design = { ...merged[a]!, elements: merged[a]!.elements.map((e) => ({ ...e, id: newElId() })) };
    loadPage([...merged.slice(0, a + 1), copy, ...merged.slice(a + 1)], a + 1);
  };
  const deletePage = (i: number) => {
    const merged = pagesWithActive();
    if (merged.length <= 1) return;
    const next = merged.filter((_, idx) => idx !== i);
    loadPage(next, i <= activeRef.current ? activeRef.current - 1 : activeRef.current);
  };
  // Templates-as-data: export the campaign as a portable JSON template / import one.
  const saveTemplate = () => downloadBytes(`${(name || 'design')}.pyntra-template.json`, new TextEncoder().encode(exportTemplatePack(name, pagesWithActive())), 'application/json');
  const importTemplate = (file: File) => {
    setTplErr(null);
    void file.text().then((txt) => { try { const pack = parseTemplatePack(txt); loadPage(reidPages(pack.pages, newElId), 0); } catch (e) { setTplErr(e instanceof Error ? e.message : 'Could not import this template.'); } });
  };
  /** Insert a ready-made design (e.g. a translated copy) as the next page. */
  const addDesignAsPage = (dz: Design) => {
    const merged = pagesWithActive();
    const a = activeRef.current;
    loadPage([...merged.slice(0, a + 1), dz, ...merged.slice(a + 1)], a + 1);
  };
  const movePage = (i: number, dir: -1 | 1) => {
    const merged = pagesWithActive();
    const j = i + dir;
    if (j < 0 || j >= merged.length) return;
    const next = merged.slice();
    [next[i], next[j]] = [next[j]!, next[i]!];
    // Keep the active pointer on whatever page is currently being edited.
    const a = activeRef.current;
    const newActive = a === i ? j : a === j ? i : a;
    setPages(next); setActive(newActive); setDesign(next[newActive]!);
  };

  const nudge = (dx: number, dy: number) => {
    const ids = selectedRef.current;
    if (!ids.length) return;
    const now = Date.now();
    if (now - lastNudgeRef.current > 600) record(); // coalesce a burst of nudges
    lastNudgeRef.current = now;
    setDesign((d) => ({ ...d, elements: d.elements.map((e) => (ids.includes(e.id) ? ({ ...e, x: Math.round(e.x + dx), y: Math.round(e.y + dy) } as Element) : e)) }));
  };
  // Align the selected elements within their shared bounding box.
  const alignSelected = (kind: 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom') => {
    const ids = selectedRef.current;
    const els = designRef.current.elements.filter((e) => ids.includes(e.id));
    if (els.length < 2) return;
    const minX = Math.min(...els.map((e) => e.x)), maxX = Math.max(...els.map((e) => e.x + e.w));
    const minY = Math.min(...els.map((e) => e.y)), maxY = Math.max(...els.map((e) => e.y + e.h));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    commit((d) => ({ ...d, elements: d.elements.map((e) => {
      if (!ids.includes(e.id)) return e;
      let { x, y } = e;
      if (kind === 'left') x = minX; else if (kind === 'right') x = maxX - e.w; else if (kind === 'centerX') x = cx - e.w / 2;
      if (kind === 'top') y = minY; else if (kind === 'bottom') y = maxY - e.h; else if (kind === 'centerY') y = cy - e.h / 2;
      return { ...e, x: Math.round(x), y: Math.round(y) } as Element;
    }) }));
  };
  // Add an element (at its default spot, selected) and arm "tap to move it there".
  // Close the sticker/clipart trays and any mobile sheet so the canvas is clear
  // for the placing tap.
  const addAndArm = (label: string, el: Element) => {
    setShowStickers(false); setShowClipart(false);
    add(el);
    setPlacing({ id: el.id, label });
    setFlash(`👆 Tap where you want your ${label}`);
  };
  // Move the armed element so its centre sits at design-space (cx,cy). No-op when
  // nothing is armed or the element is gone.
  const placeArmed = (cx: number, cy: number): boolean => {
    const p = placingRef.current; if (!p) return false;
    setPlacing(null);
    commit((d) => ({ ...d, elements: d.elements.map((e) => (e.id === p.id ? ({ ...e, x: Math.round(cx - e.w / 2), y: Math.round(cy - e.h / 2) } as Element) : e)) }));
    return true;
  };
  const addText = () => addAndArm('text', { id: newElId(), type: 'text', x: design.w / 2 - 200, y: design.h / 2 - 30, w: 400, h: 60, text: 'Your text', size: 48, color: brandText ?? '#0f172a', font: brandHeading, weight: 700, align: 'center' });
  // A sticker is just a big draggable text element — same move/resize/rotate
  // as everything else, so a child can decorate by tapping then dragging.
  const stickerSeq = useRef(0);
  const addSticker = (emoji: string) => {
    const n = stickerSeq.current++;
    const size = Math.round(Math.min(design.w, design.h) * 0.12);
    addAndArm('sticker', {
      id: newElId(), type: 'text', text: emoji, size,
      x: design.w / 2 - size, y: design.h / 2 - size * 0.75,
      w: size * 2, h: size * 1.5, color: '#0f172a', font: 'Inter, system-ui, sans-serif', weight: 700, align: 'center',
      rotation: ((n * 29) % 24) - 12,
    });
  };
  // A real deity painting (public-domain Raja Ravi Varma art). Fetched from the
  // local /sacred asset and inlined as a data URL so the design stays
  // self-contained — reopens and exports identically, offline.
  const addSacredImage = (file: string, name: string) => {
    setGodsBusy(true);
    void (async () => {
      try {
        const blob = await (await fetch(file)).blob();
        const dataUrl = await new Promise<string>((res, rej) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result)); rd.onerror = () => rej(new Error('read')); rd.readAsDataURL(blob); });
        addImageFromSrc(dataUrl, { fit: 'contain', frac: 0.7 });
        setShowGods(false);
        setFlash(`✓ ${name} added — drag or resize like any picture`);
      } catch { setFlash('Could not add that image — please try again.'); }
      finally { setGodsBusy(false); }
    })();
  };
  // Greeting stickers — ready-made wishes in Indian languages, dropped in as
  // ordinary text (so the words, colour and font stay fully editable).
  const addWordSticker = (words: string, color: string) => {
    const n = stickerSeq.current++;
    const size = Math.round(Math.min(design.w, design.h) * 0.055);
    const w = design.w * 0.8;
    addAndArm('greeting', {
      id: newElId(), type: 'text', text: words, size,
      x: (design.w - w) / 2, y: design.h / 2 - size * 0.8,
      w, h: size * 1.6, color, font: 'Georgia, serif', weight: 900, align: 'center',
      rotation: ((n * 17) % 10) - 5,
    });
  };
  const addRect = () => addAndArm('shape', { id: newElId(), type: 'rect', x: design.w / 2 - 150, y: design.h / 2 - 100, w: 300, h: 200, fill: brandFill ?? '#2e5bff', radius: 12 });
  const addEllipse = () => addAndArm('circle', { id: newElId(), type: 'ellipse', x: design.w / 2 - 120, y: design.h / 2 - 120, w: 240, h: 240, fill: brandFill ?? '#22c55e' });
  const addLine = () => addAndArm('line', { id: newElId(), type: 'line', x: design.w / 2 - 200, y: design.h / 2, w: 400, h: 0, stroke: brandText ?? '#0f172a', strokeWidth: 6 });
  const addImageFromSrc = (href: string, opts?: { fit?: 'cover' | 'contain'; frac?: number }) => {
    const img = new Image();
    img.onload = () => {
      const iw = img.width || 300, ih = img.height || 300;
      const max = Math.min(design.w, design.h) * (opts?.frac ?? 0.6);
      const r = Math.min(max / iw, max / ih, 1);
      const w = Math.round(iw * r), h = Math.round(ih * r);
      addAndArm('photo', { id: newElId(), type: 'image', x: Math.round(design.w / 2 - w / 2), y: Math.round(design.h / 2 - h / 2), w, h, href, radius: 0, ...(opts?.fit ? { fit: opts.fit } : {}) });
    };
    img.src = href;
  };
  // Vector clipart & avatars insert as `contain` images (whole graphic, no crop).
  const addGraphic = (svg: string) => addImageFromSrc(svgToDataUrl(svg), { fit: 'contain', frac: 0.34 });
  const onImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => addImageFromSrc(String(reader.result));
    reader.readAsDataURL(file);
  };

  const addLogo = () => {
    if (!brand?.logo) return;
    const href = brand.logo;
    const img = new Image();
    img.onload = () => {
      const max = Math.min(design.w, design.h) * 0.3;
      const r = Math.min(max / img.width, max / img.height, 1);
      add({ id: newElId(), type: 'image', x: 40, y: 40, w: Math.round(img.width * r), h: Math.round(img.height * r), href, radius: 0 });
    };
    img.src = href;
  };

  const reorder = (id: string, dir: -1 | 1) => setDesign((d) => {
    const i = d.elements.findIndex((e) => e.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= d.elements.length) return d;
    const els = [...d.elements];
    [els[i], els[j]] = [els[j]!, els[i]!];
    return { ...d, elements: els };
  });

  // Keyboard: delete, undo/redo, duplicate, and arrow-nudge — but never while the
  // user is typing in a field (so native text editing still works).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && placingRef.current) { e.preventDefault(); setPlacing(null); return; }
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); return; }
      if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAll(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected.length) { e.preventDefault(); removeSelected(); return; }
      if (selected.length && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowLeft') nudge(-step, 0);
        else if (e.key === 'ArrowRight') nudge(step, 0);
        else if (e.key === 'ArrowUp') nudge(0, -step);
        else if (e.key === 'ArrowDown') nudge(0, step);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, undo, redo, record]);

  // Track the *visual* viewport so the mobile bottom sheets sit above the on-screen
  // keyboard and stay scrollable (CSS vars consumed in the ≤720px rules). Without
  // this the keyboard hides the lower controls and they can't be scrolled to.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const root = document.documentElement;
      root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
      root.style.setProperty('--vv-kb', `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, []);

  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };

  const appliedTplObj = appliedTpl ? STUDIO_TEMPLATES.find((x) => x.id === appliedTpl) : undefined;
  const fmtValue = FORMATS.find((f) => f.w === design.w && f.h === design.h)?.id ?? [];

  // Secondary actions: shown inline on desktop, collapsed into a bottom sheet on
  // phones (see the toolbar below). Rendered in exactly one place at a time.
  const groupCanvas = (
    <>
      <TkxButton variant="ghost" size="sm" disabled={!design.elements.length} onClick={selectAll} title="Select all elements (Ctrl/Cmd+A)">▣ All</TkxButton>
      <TkxSelect className="studio-menu-sel studio-sheet-keep" size="sm" placeholder="⤢ Resize…" value={fmtValue} options={FORMATS.map((f) => ({ value: f.id, label: `${f.name} (${f.w}×${f.h})` }))} onChange={(v) => { const id = Array.isArray(v) ? v[0] : v; if (id) { const f = formatById(id); commit((d) => resizeDesign(d, f.w, f.h)); setFlash(`✓ Resized to ${f.name} (${f.w}×${f.h})`); } }} />
      <TkxButton variant="outline" size="sm" onClick={() => setShowMagicResize(true)} title="Resize this design into every size at once">✨ {t('studio_resize_all', lang)}</TkxButton>
      <label className="studio-bg studio-sheet-keep" title="Background colour">BG<input type="color" value={design.background} onFocus={beginInteraction} onBlur={endInteraction} onChange={(e) => setDesign((d) => ({ ...d, background: e.target.value }))} /></label>
      <TkxSelect className="studio-menu-sel studio-menu-sel--cat studio-sheet-keep" size="sm" value={design.effect ?? 'none'} options={[{ value: 'none', label: '✨ FX: none' }, ...BACKGROUND_EFFECTS.map((f) => ({ value: f.id, label: f.label }))]} onChange={(v) => { const val = Array.isArray(v) ? v[0] : v; commit((d) => ({ ...d, effect: val === 'none' ? undefined : val as BackgroundEffect })); setFlash(val === 'none' ? '✓ Background effect removed' : `✓ Background effect on — it animates in 🎬 Animate exports`); }} />
      <TkxButton variant="outline" size="sm" onClick={() => setShowBrand(true)} title="Brand kits — logo, colours, fonts">★ Brand</TkxButton>
      {brandStatus && (brandStatus.total === 0
        ? <span className="brand-ok" title="Every colour and font matches your brand kit">✓ On brand</span>
        : <button className="brand-off" title={`${brandStatus.offColors.length} off-brand colour(s), ${brandStatus.offFonts.length} off-brand font(s). Click to snap them to your brand.`} onClick={() => commit((d) => applyBrand(d, brand!))}>⚠ {brandStatus.total} off-brand · Fix</button>)}
    </>
  );
  const groupAi = (
    <>
      <TkxButton variant="outline" size="sm" onClick={() => setShowAi(true)} title="Generate an image with your own AI model (online)">✨ AI image</TkxButton>
      {!room && <TkxButton variant="outline" size="sm" onClick={() => setShowTranslate(true)} title="Translate this design into another language as a new page">🌐 Translate</TkxButton>}
    </>
  );
  const groupShare = (
    <>
      {!room && <TkxButton variant="outline" size="sm" onClick={() => void share()} title="Create a private link to design this together in real time">🔗 {t('studio_share', lang)}</TkxButton>}
      {room && isHost && <TkxButton variant="outline" size="sm" onClick={() => setShowInvite(true)} title="Invite specific people with per-person links (forwarding blocked)">👥 Invite</TkxButton>}
      {room && <TkxButton variant={showCall ? 'solid' : 'outline'} colorScheme={showCall ? 'primary' : undefined} size="sm" onClick={() => setShowCall((v) => !v)} title="Share your screen with everyone in the room">🖥 Share screen</TkxButton>}
    </>
  );
  const groupExport = (
    <>
      <TkxButton variant="outline" size="sm" disabled={busy} onClick={() => run(() => exportDesignPdf(design, name, fontCssFor([design]), false))}>{t('studio_download_pdf', lang)}</TkxButton>
      <ToolbarMenu label={`⋯ ${t('more_label', lang)}`} items={[
        ...(pages.length > 1 ? [{ label: `📑 ${t('mm_all_pages_pdf', lang)}`, onClick: () => run(() => exportDesignsPdf(pagesWithActive(), name, fontCssFor(pagesWithActive()), false)), disabled: busy }] : []),
        { label: 'SVG', onClick: () => exportDesignSvg(design, name, fontCssFor([design]), false) },
        { label: `📨 ${t('mm_mail_merge', lang)}`, onClick: () => setShowMerge(true) },
        { label: `⬗ ${t('mm_save_template', lang)}`, onClick: saveTemplate, title: 'Save this design as a reusable .json template' },
        { label: `⬖ ${t('mm_open_template', lang)}`, onClick: () => tplFileRef.current?.click() },
        ...(docId ? [{ label: `🕑 ${t('mm_version_history', lang)}`, onClick: () => setShowHistory(true) }] : []),
        ...(docId ? [{ label: `💬 ${t('mm_comments', lang)}`, onClick: () => setShowComments(true) }] : []),
        { label: `📄 ${t('mm_open_in_pdf', lang)}`, onClick: () => run(async () => onOpenInPdf(await designToPdf(design), name)), disabled: busy },
      ]} />
    </>
  );
  // Flat for a wide bar; grouped with headings inside the compact sheet.
  const secondaryActions = (<>{groupCanvas}{groupAi}{groupShare}{groupExport}</>);
  const secondaryGrouped = (
    <>
      <div className="studio-sheet-group"><span className="studio-sheet-head">🎨 Canvas &amp; brand</span><div className="studio-sheet-row">{groupCanvas}</div></div>
      <div className="studio-sheet-group"><span className="studio-sheet-head">✨ AI &amp; language</span><div className="studio-sheet-row">{groupAi}</div></div>
      <div className="studio-sheet-group"><span className="studio-sheet-head">🤝 Share &amp; collaborate</span><div className="studio-sheet-row">{groupShare}</div></div>
      <div className="studio-sheet-group"><span className="studio-sheet-head">⤓ Export</span><div className="studio-sheet-row">{groupExport}</div></div>
    </>
  );

  return (
    <div className="ed studio">
      <div className="ed-bar">
        <span className="ed-kind">Design · {name} · {design.w}×{design.h}</span>
        <div className="ed-actions">
          {/* Primary actions — always visible, even on the smallest phone. */}
          <TkxButton variant="ghost" size="sm" disabled={!canUndo} onClick={undo} title="Undo (Ctrl/Cmd+Z)">↶</TkxButton>
          <TkxButton variant="ghost" size="sm" disabled={!canRedo} onClick={redo} title="Redo (Ctrl/Cmd+Shift+Z)">↷</TkxButton>
          <TkxButton variant="outline" size="sm" className="studio-tpl-btn" onClick={() => setShowGallery(true)} title="Browse templates with pictures, by category">
            {appliedTplObj ? `${appliedTplObj.icon} ${appliedTplObj.name}` : '✨ Templates…'}
          </TkxButton>
          <TkxButton variant={defaultAnim ? 'solid' : 'outline'} colorScheme={defaultAnim ? 'primary' : undefined} size="sm" onClick={() => setShowAnimate(true)} title="Animate the design and export a GIF/video">🎬 {t('studio_animate', lang)}</TkxButton>
          <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy} onClick={() => run(() => exportDesignPng(design, name, fontCssFor([design]), false))}>{t('studio_save_png', lang)}</TkxButton>
          {/* Secondary actions: inline on desktop, one ⋯ More button → bottom sheet on phones. */}
          {compactBar
            ? <TkxButton variant="outline" size="sm" className="studio-more-btn" onClick={() => setMoreOpen(true)} title="More tools & export options">⋯ {t('more_label', lang)}</TkxButton>
            : secondaryActions}
          <input ref={tplFileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importTemplate(f); }} />
          {tplErr && <span className="cmp-row-note cmp-row-note--warn" role="alert">{tplErr}</span>}
        </div>
      </div>
      {compactBar && (
        <TkxDrawer isOpen={moreOpen} onClose={() => setMoreOpen(false)} placement="bottom" size="md" title="More tools · export options">
          {/* Picking a tool closes the sheet — EXCEPT controls that open in place
              (selects, colour pickers) and the ⋯ export dropdown (.tbm), which
              must stay anchored in the open sheet or its menu can never show. */}
          <div className="studio-sheet-actions" onClickCapture={(e) => { const el = e.target as HTMLElement; if (el.closest('button') && !el.closest('.studio-sheet-keep') && !el.closest('.tbm')) setMoreOpen(false); }}>
            {secondaryGrouped}
          </div>
        </TkxDrawer>
      )}
      {room && <CollabBar room={room} peers={collab.peers} ready={collab.ready} relayStatus={collab.relayStatus} copied={copied} onCopy={() => void copyLink()} />}
      {room && <ChatPanel log={chatLog} myId={myId} peerIds={collab.peers.map((p) => p.id)} cursors={readCursors} media={media} onSend={sendChat} onSendFile={sendChatFile} onMarkRead={markRead} />}
      {incomingCall && (
        <div className="call-banner" role="alert">
          <span>🖥 Someone is sharing a screen</span>
          <TkxButton variant="solid" colorScheme="primary" size="sm" onClick={() => setShowCall(true)}>View</TkxButton>
          <button className="call-banner-x" onClick={() => setCallInfo(null)} aria-label="Dismiss">✕</button>
        </div>
      )}
      {showInvite && room && <InviteModal shareUrl={buildGatedUrl(typeof location !== 'undefined' ? location.origin : '', room)} invites={invites} onChange={updateInvites} onClose={() => setShowInvite(false)} />}
      {showCall && room && <ScreenSharePanel myId={myId} sendSignal={sendSignal} registerIncoming={registerIncoming} onClose={() => setShowCall(false)} onRecorded={(file) => { setShowCall(false); onEditVideo?.(file); }} />}

      <div className={'studio-body' + (mobilePanel ? ' studio-body--sheet' : '')}>
        <div className={'studio-rail' + (mobilePanel === 'add' ? ' studio-rail--open' : '')} role="toolbar" aria-label="Add elements">
          <TkxButton variant="ghost" size="sm" isFullWidth onClick={addText} title="Add text">🅣 {t('tool_text', lang)}</TkxButton>
          <TkxButton variant="ghost" size="sm" isFullWidth onClick={addRect} title="Add rectangle">▭ {t('tool_box', lang)}</TkxButton>
          <TkxButton variant="ghost" size="sm" isFullWidth onClick={addEllipse} title="Add ellipse">⬭ {t('tool_oval', lang)}</TkxButton>
          <TkxButton variant="ghost" size="sm" isFullWidth onClick={addLine} title="Add line">― {t('tool_line', lang)}</TkxButton>
          <TkxButton variant="ghost" size="sm" isFullWidth onClick={() => fileRef.current?.click()} title="Add image">🖼 {t('tool_image', lang)}</TkxButton>
          <TkxButton variant="ghost" size="sm" isFullWidth onClick={() => { setShowStickers((v) => !v); setShowClipart(false); }} title="Add a fun sticker" aria-expanded={showStickers}>😊 Sticker</TkxButton>
          <TkxButton variant="ghost" size="sm" isFullWidth onClick={() => { setShowClipart((v) => !v); setShowStickers(false); setShowGods(false); }} title="Add vector clipart — flowers, balloons, hearts and more" aria-expanded={showClipart}>🎨 Clipart</TkxButton>
          <TkxButton variant="ghost" size="sm" isFullWidth onClick={() => { setShowGods((v) => !v); setShowStickers(false); setShowClipart(false); }} title="Add a real deity painting (public-domain classical art)" aria-expanded={showGods}>🕉️ Gods</TkxButton>
          <TkxButton variant="ghost" size="sm" isFullWidth onClick={() => setShowAvatar(true)} title="Build a cartoon avatar of yourself">🧑 Avatar</TkxButton>
          <TkxButton variant="ghost" size="sm" isFullWidth onClick={() => setShowDraw(true)} title="Draw something with your finger or mouse and drop it on the design">✏️ Draw</TkxButton>
          <TkxButton variant="ghost" size="sm" isFullWidth onClick={() => setShowImgLink(true)} title="Add a picture from a web link (paste an image address)">🔗 From link</TkxButton>
          {brand?.logo && <TkxButton variant="ghost" size="sm" isFullWidth onClick={addLogo} title="Add your brand logo">★ {t('tool_logo', lang)}</TkxButton>}
          <TkxButton variant="ghost" size="sm" isFullWidth onClick={() => setShowQr(true)} title="Generate a QR code">▦ QR</TkxButton>
          {showGods && (
            <div className="studio-stickers studio-gods" role="dialog" aria-label="Deity images">
              <div className="studio-stickers-head"><strong>🕉️ Tap a deity to add it</strong><button className="brand-x" aria-label="Close" onClick={() => setShowGods(false)}>✕</button></div>
              <div className="studio-gods-grid">
                {SACRED_IMAGES.map((s) => (
                  <button key={s.id} className="studio-god-btn" disabled={godsBusy} title={`Add ${s.name} — ${s.festival}`} onClick={() => addSacredImage(s.file, s.name)}>
                    <img src={s.file} alt={s.name} decoding="async" />
                    <span>{s.name}</span>
                  </button>
                ))}
              </div>
              <p className="studio-gods-note">{SACRED_ATTRIBUTION}</p>
            </div>
          )}
          {showStickers && (
            <div className="studio-stickers" role="dialog" aria-label="Stickers">
              <div className="studio-stickers-head"><strong>Tap a sticker to add it</strong><button className="brand-x" aria-label="Close stickers" onClick={() => setShowStickers(false)}>✕</button></div>
              {([
                ['Party', ['🎈', '🎂', '🎉', '🎊', '🎁', '🎀', '🍰', '🧁', '🕯️', '🥳']],
                ['Desi', ['🪔', '🕉️', '🙏', '🛕', '🦚', '🪷', '🛺', '🧿', '🌺', '🥭', '🌶️', '🥥', '🍛', '🫖', '🏏', '🪘', '🥁', '🎆', '🎇', '🇮🇳']],
                ['Animals', ['🧸', '🦁', '🐯', '🐘', '🦊', '🐰', '🐻', '🦒', '🐼', '🐣']],
                ['Nature', ['🌸', '🌼', '🌺', '🌈', '⭐', '🌟', '✨', '☀️', '🌙', '🦋']],
                ['Fun', ['🚂', '🚗', '✈️', '⚽', '🎠', '👑', '💖', '🍭', '🎵', '📚']],
              ] as [string, string[]][]).map(([cat, list]) => (
                <div key={cat} className="studio-stickers-cat">
                  <span className="studio-stickers-cat-name">{cat}</span>
                  <div className="studio-stickers-grid">
                    {list.map((e) => <button key={e} className="studio-sticker-btn" title={`Add ${e}`} onClick={() => addSticker(e)}>{e}</button>)}
                  </div>
                </div>
              ))}
              <div className="studio-stickers-cat">
                <span className="studio-stickers-cat-name">Greetings — अपनी भाषा में</span>
                <div className="studio-stickers-words">
                  {([
                    ['जन्मदिन मुबारक', '#e0559a'], ['शुभ विवाह', '#b45309'], ['शुभ दीपावली', '#d97706'],
                    ['ईद मुबारक', '#0d9488'], ['शुभ आशीर्वाद', '#7c3aed'], ['বিয়ের শুভেচ্ছা', '#be185d'],
                    ['শুভ জন্মদিন', '#2563eb'], ['பிறந்தநாள் வாழ்த்துக்கள்', '#c2410c'], ['జన్మదిన శుభాకాంక్షలు', '#15803d'],
                    ['ਜਨਮਦਿਨ ਮੁਬਾਰਕ', '#b91c1c'], ['જન્મદિવસ મુબારક', '#9333ea'], ['वाढदिवसाच्या शुभेच्छा', '#0e7490'],
                  ] as [string, string][]).map(([txt, color]) => (
                    <button key={txt} className="studio-word-btn" style={{ color }} title={`Add “${txt}”`} onClick={() => addWordSticker(txt, color)}>{txt}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {showClipart && (
            <div className="studio-stickers" role="dialog" aria-label="Clipart">
              <div className="studio-stickers-head"><strong>Tap clipart to add it</strong><button className="brand-x" aria-label="Close clipart" onClick={() => setShowClipart(false)}>✕</button></div>
              {CLIPART_CATEGORIES.map((cat) => (
                <div key={cat} className="studio-stickers-cat">
                  <span className="studio-stickers-cat-name">{cat}</span>
                  <div className="studio-stickers-grid">
                    {clipartByCategory(cat).map((c) => {
                      const locked = false;
                      return (
                        <button
                          key={c.id}
                          className={'studio-clip-btn' + (locked ? ' studio-clip-btn--locked' : '')}
                          title={locked ? `${c.name} — Pyntra Pro` : `Add ${c.name}`}
                          aria-label={locked ? `${c.name} (Pro)` : `Add ${c.name}`}
                          onClick={() => addGraphic(c.svg)}
                        >
                          <img src={svgToDataUrl(c.svg)} alt="" width={34} height={34} />
                          {locked && <span className="studio-lock" aria-hidden>🔒</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          <input ref={placeholderPhotoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
            const f = e.target.files?.[0]; e.target.value = '';
            const target = photoTargetRef.current; photoTargetRef.current = null;
            if (!f || !target) return;
            const rd = new FileReader();
            rd.onload = () => { record(); patch(target, { href: String(rd.result), placeholder: undefined } as Partial<Element>); setFlash('✓ Photo added — drag or resize it any time'); };
            rd.readAsDataURL(f);
          }} />
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImage(f); }} />
          <input ref={fontFileRef} type="file" accept=".ttf,.otf,.woff,.woff2,font/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void addFontFile(f); }} />
        </div>

        <div
          className={'studio-stage' + (placing ? ' studio-stage--placing' : '')}
          onPointerDownCapture={(e) => {
            // Tap-to-place intercepts the pointer BEFORE element move/selection
            // handlers, so a tap anywhere on the canvas drops the armed element.
            if (!placingRef.current) return;
            const svg = svgRef.current;
            if (svg) {
              const r = svg.getBoundingClientRect();
              if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
                e.stopPropagation(); e.preventDefault();
                const { x, y } = toArt(e.clientX, e.clientY);
                placeArmed(x, y);
                return;
              }
            }
            setPlacing(null); // tapped off the canvas → cancel
          }}
          onPointerDown={() => { setSelected([]); setMobilePanel(null); }}
        >
          {placing && (
            <div className="studio-place-banner" role="status" aria-live="polite">
              <span>👆 Tap where you want your {placing.label} — or just drag it</span>
              <button onClick={() => setPlacing(null)}>Got it</button>
            </div>
          )}
          <svg
            ref={svgRef}
            className="studio-art"
            viewBox={`0 0 ${design.w} ${design.h}`}
            style={{ background: design.background, aspectRatio: `${design.w} / ${design.h}` }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Keyframes for the live motion preview (animated emoji/text). */}
            {(design.effect || design.elements.some((el) => el.motion)) && <style>{MOTION_CSS}</style>}
            {/* Animated background layer — confetti/snow/hearts drifting live.
                pointerEvents off so particles never block element clicks. */}
            {design.effect && (
              <g pointerEvents="none" opacity={0.9}>
                {effectParticles(design.effect).map((p, i) => {
                  const rises = effectRises(design.effect!);
                  const dur = 7 / p.speed;
                  return (
                    <text key={i} x={p.fx * design.w} y={rises ? design.h * 1.08 : -design.h * 0.08} fontSize={p.sizeFrac * Math.min(design.w, design.h)} textAnchor="middle"
                      style={{ ['--fh' as never]: `${Math.round(design.h * 1.16)}px`, animation: `${rises ? 'ptx-rise' : 'ptx-fall'} ${dur.toFixed(2)}s linear infinite`, animationDelay: `${(-p.fy * dur).toFixed(2)}s` }}>
                      {p.glyph}
                    </text>
                  );
                })}
              </g>
            )}
            {design.elements.filter((el) => !el.hidden).map((el) => (
              <ElementView key={el.id} el={el} unit={Math.max(design.w, design.h)} selected={selected.includes(el.id)} onDown={(e) => startMove(e, el)} onResize={(e) => startResize(e, el)} />
            ))}
            {guides.map((g, i) => (g.axis === 'x'
              ? <line key={i} x1={g.pos} y1={0} x2={g.pos} y2={design.h} stroke="#ec4899" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
              : <line key={i} x1={0} y1={g.pos} x2={design.w} y2={g.pos} stroke="#ec4899" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />))}
            {/* Comment pins: an amber marker on elements with open comments. */}
            {[...annotatedElements(comments, active)].map((eid) => {
              const el = design.elements.find((e) => e.id === eid && !e.hidden);
              if (!el) return null;
              const r = Math.max(16, Math.round(Math.max(design.w, design.h) * 0.022));
              return (
                <g key={'cm' + eid} onPointerDown={(e) => { e.stopPropagation(); setSelected([eid]); }} style={{ cursor: 'pointer' }}>
                  <circle cx={el.x + el.w} cy={el.y} r={r} fill="#f59e0b" stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                  <text x={el.x + el.w} y={el.y} fontSize={r * 1.05} textAnchor="middle" dominantBaseline="central">💬</text>
                </g>
              );
            })}
          </svg>
        </div>

        <aside className={'studio-props' + (mobilePanel === 'edit' ? ' studio-props--open' : '')} onFocusCapture={beginInteraction} onBlurCapture={endInteraction}>
          {mobilePanel === 'edit' && <button className="studio-sheet-close" onClick={() => setMobilePanel(null)} aria-label="Close panel">{t('studio_done', lang)}</button>}
          <div className="studio-props-layers">
            <LayersPanel
              elements={design.elements}
              selected={selected}
              onSelect={(id, additive) => setSelected((cur) => additive ? (cur.includes(id) ? cur.filter((s) => s !== id) : [...cur, id]) : [id])}
              onReorder={reorderLayer}
              onToggleHidden={toggleHidden}
              onToggleLocked={toggleLocked}
            />
          </div>
          {selected.length === 0 && <p className="studio-hint">{t('studio_select_hint', lang)}</p>}
          {selected.length > 1 && (
            <div className="studio-multi">
              <div className="studio-prop-row"><strong>{selected.length} {t('studio_selected', lang)}</strong>
                <span className="studio-spacer" />
                <button onClick={duplicateSelected} title="Duplicate (Ctrl/Cmd+D)">⧉</button>
                <button onClick={removeSelected} title="Delete">🗑</button>
              </div>
              <div className="brand-section">{t('prop_align', lang)}</div>
              <div className="studio-align">
                <button onClick={() => alignSelected('left')} title="Align left">⊢</button>
                <button onClick={() => alignSelected('centerX')} title="Align centre">⊥</button>
                <button onClick={() => alignSelected('right')} title="Align right">⊣</button>
                <button onClick={() => alignSelected('top')} title="Align top">⊤</button>
                <button onClick={() => alignSelected('centerY')} title="Align middle">⊟</button>
                <button onClick={() => alignSelected('bottom')} title="Align bottom">⊥</button>
              </div>
            </div>
          )}
          {sel && (
            <>
              <div className="studio-prop-row"><strong>{sel.type}</strong>
                <span className="studio-spacer" />
                {sel.type === 'image' && <button onClick={() => setEditingImg({ id: sel.id, href: (sel as ImageEl).href })} title="Edit image (crop, filter, rotate)">✎</button>}
                <button onClick={duplicateSelected} title="Duplicate (Ctrl/Cmd+D)">⧉</button>
                <button onClick={() => reorder(sel.id, 1)} title="Bring forward">⬆</button>
                <button onClick={() => reorder(sel.id, -1)} title="Send backward">⬇</button>
                <button onClick={removeSelected} title="Delete">🗑</button>
              </div>

              {sel.type === 'text' && <TextProps el={sel} patch={patch} palette={palette} fonts={fonts} onAddFont={() => fontFileRef.current?.click()} />}
              {(sel.type === 'rect' || sel.type === 'ellipse') && <FillProps el={sel} patch={patch} palette={palette} />}
              {sel.type === 'line' && <LineProps el={sel} patch={patch} palette={palette} />}
              {sel.type === 'image' && <ImageProps el={sel} patch={patch} snapshot={record} />}

              <div className="studio-prop-grid">
                <label>X<input type="number" value={Math.round(sel.x)} onChange={(e) => patch(sel.id, { x: Number(e.target.value) })} /></label>
                <label>Y<input type="number" value={Math.round(sel.y)} onChange={(e) => patch(sel.id, { y: Number(e.target.value) })} /></label>
                <label>W<input type="number" value={Math.round(sel.w)} onChange={(e) => patch(sel.id, { w: Math.max(1, Number(e.target.value)) })} /></label>
                <label>H<input type="number" value={Math.round(sel.h)} onChange={(e) => patch(sel.id, { h: Math.max(1, Number(e.target.value)) })} /></label>
                <label>{t('prop_rotation', lang)}<input type="number" value={Math.round(sel.rotation ?? 0)} onChange={(e) => patch(sel.id, { rotation: Number(e.target.value) })} /></label>
              </div>

              <label className="studio-inline">✨ Motion (animated)
                <TkxSelect size="sm" value={sel.motion ?? 'none'} options={[{ value: 'none', label: 'Still (no motion)' }, ...ELEMENT_MOTIONS.map((m) => ({ value: m.id, label: m.label }))]} onChange={(v) => { const val = Array.isArray(v) ? v[0] : v; patch(sel.id, { motion: val === 'none' ? undefined : val as ElementMotion }); }} />
              </label>
              {sel.motion && (
                <label className="studio-inline">Motion speed
                  <TkxSelect size="sm" value={String(sel.motionSpeed ?? 1)} options={[
                    { value: '0.5', label: '🐢 Slow' },
                    { value: '1', label: 'Normal' },
                    { value: '2', label: '🐇 Fast' },
                  ]} onChange={(v) => { const val = Number(Array.isArray(v) ? v[0] : v); patch(sel.id, { motionSpeed: val === 1 ? undefined : val }); }} />
                </label>
              )}
              <p className="studio-hint" style={{ margin: 0 }}>Motion plays here and in the 🎬 Animate export (GIF / video).</p>

              <ElementComments
                thread={commentsFor(comments, active, sel.id)}
                onAdd={addCommentToSel}
                onResolve={(id) => setComments((c) => resolveComment(c, id, true))}
                onDelete={(id) => setComments((c) => deleteComment(c, id))}
              />
            </>
          )}
        </aside>
      </div>
      {/* Mobile-only: collapse the tools so the canvas gets the whole screen. */}
      <div className="studio-mobilebar">
        <button className={mobilePanel === 'add' ? 'on' : ''} onClick={() => setMobilePanel((p) => (p === 'add' ? null : 'add'))}>＋ {t('studio_add', lang)}</button>
        <button className={(mobilePanel === 'edit' ? 'on' : '') + (selected.length ? ' has-sel' : '')} onClick={() => setMobilePanel((p) => (p === 'edit' ? null : 'edit'))}>✎ {t('studio_edit', lang)}{selected.length ? ` (${selected.length})` : ''}</button>
      </div>
      {!room && (
        <PagesRail
          pages={pagesWithActive()}
          active={active}
          onSelect={gotoPage}
          onAdd={addPage}
          onDuplicate={duplicatePage}
          onDelete={deletePage}
          onMove={movePage}
        />
      )}
      {showBrand && <BrandManager onClose={() => { setShowBrand(false); loadBrand(); }} />}
      {showAi && <AiImageModal onClose={() => setShowAi(false)} onInsert={(src) => addImageFromSrc(src)} />}
      {showMerge && <MailMergeModal design={design} name={name} onClose={() => setShowMerge(false)} />}
      {showMagicResize && <MagicResizeModal design={design} name={name} fontCss={fontCssFor([design])} onClose={() => setShowMagicResize(false)} />}
      {showTranslate && <TranslateDesignModal design={design} onClose={() => setShowTranslate(false)} onTranslated={(dz) => { setShowTranslate(false); addDesignAsPage(dz); }} />}
      {flash && <div className="v2-toast" role="status" aria-live="polite">{flash}</div>}
      {showGallery && (
        <TemplateGalleryModal
          applied={appliedTpl}
          onPick={(tpl) => { commit(() => tpl.make()); setSelected([]); setAppliedTpl(tpl.id); setShowGallery(false); setFlash(`✓ Template applied: ${tpl.name}`); }}
          onClose={() => setShowGallery(false)}
        />
      )}
      {showDraw && <DrawModal onDone={(url) => { addImageFromSrc(url); setShowDraw(false); }} onClose={() => setShowDraw(false)} />}
      {showImgLink && <ImageLinkModal onAdd={(url) => { addImageFromSrc(url); setShowImgLink(false); }} onClose={() => setShowImgLink(false)} />}
      {showAnimate && <AnimateModal design={design} pages={pagesWithActive()} name={name} fontCss={fontCssFor(pagesWithActive())} defaultPreset={defaultAnim} onClose={() => setShowAnimate(false)} />}
      {showHistory && docId && (
        <VersionHistoryModal
          docId={docId}
          currentContent={() => ({ design })}
          onRestore={(c) => { if (c.design) commit(() => c.design!); }}
          onClose={() => setShowHistory(false)}
        />
      )}
      {showComments && docId && <CommentsModal docId={docId} onClose={() => setShowComments(false)} />}
       {showQr && <QrModal onClose={() => setShowQr(false)} onInsert={(src) => { addImageFromSrc(src); }} />}
      {showAvatar && <AvatarModal onClose={() => setShowAvatar(false)} onInsert={(url) => { addImageFromSrc(url, { fit: 'contain', frac: 0.4 }); }} />}
      {editingImg && (
        <div className="v2-modal" onClick={() => setEditingImg(null)}>
          <div className="v2-modal__inner imgstudio-modal" onClick={(e) => e.stopPropagation()}>
            <ImageStudio
              src={editingImg.href}
              name="image"
              onClose={() => setEditingImg(null)}
              onApply={(dataUrl, w, h) => {
                const cur = design.elements.find((e) => e.id === editingImg.id);
                const width = cur ? cur.w : w;
                record();
                patch(editingImg.id, { href: dataUrl, h: Math.round((width * h) / w) } as Partial<Element>);
                setEditingImg(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Swatches({ value, onPick, palette }: { value: string; onPick: (c: string) => void; palette: string[] }) {
  return (
    <div className="studio-swatches">
      {palette.map((c) => <button key={c} className={'studio-swatch' + (c.toLowerCase() === value.toLowerCase() ? ' studio-swatch--on' : '')} style={{ background: c }} onClick={() => onPick(c)} title={c} />)}
      <label className="studio-swatch studio-swatch--custom" title="Custom colour">+<input type="color" value={value} onChange={(e) => onPick(e.target.value)} /></label>
    </div>
  );
}

/** Review-comment thread for the selected element (Pillar D). */
function ElementComments({ thread, onAdd, onResolve, onDelete }: { thread: AnchoredComment[]; onAdd: (t: string) => void; onResolve: (id: string) => void; onDelete: (id: string) => void }) {
  const [text, setText] = useState('');
  const open = thread.filter((c) => !c.resolved);
  return (
    <div className="el-comments">
      <div className="brand-section">💬 Comments{open.length ? ` (${open.length})` : ''}</div>
      {thread.map((c) => (
        <div key={c.id} className={'el-comment' + (c.resolved ? ' el-comment--done' : '')}>
          <div className="el-comment-body"><strong>{c.author}</strong> {c.text}</div>
          <div className="el-comment-ctl">
            {!c.resolved && <button onClick={() => onResolve(c.id)} title="Resolve">✓</button>}
            <button onClick={() => onDelete(c.id)} title="Delete">✕</button>
          </div>
        </div>
      ))}
      <div className="el-comment-add">
        <input value={text} placeholder="Add a comment…" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) { onAdd(text); setText(''); } }} />
        <button disabled={!text.trim()} onClick={() => { onAdd(text); setText(''); }}>Post</button>
      </div>
    </div>
  );
}

interface FontOpt { value: string; label: string }

function TextProps({ el, patch, palette, fonts, onAddFont }: { el: TextEl; patch: (id: string, p: Partial<Element>) => void; palette: string[]; fonts: FontOpt[]; onAddFont: () => void }) {
  const lang = useLang();
  return (
    <>
      <textarea className="studio-text-input" value={el.text} rows={3} onChange={(e) => patch(el.id, { text: e.target.value })} />
      <div className="studio-prop-grid">
        <label>{t('pd_size', lang)}<input type="number" value={el.size} onChange={(e) => patch(el.id, { size: Math.max(1, Number(e.target.value)) })} /></label>
        <label>{t('prop_weight', lang)}
          <select value={el.weight} onChange={(e) => patch(el.id, { weight: Number(e.target.value) })}>
            <option value={400}>{t('wt_regular', lang)}</option><option value={600}>{t('wt_semibold', lang)}</option><option value={700}>{t('wt_bold', lang)}</option><option value={900}>{t('wt_black', lang)}</option>
          </select>
        </label>
        <label>{t('prop_font', lang)}
          <div className="studio-font-row">
            <select value={el.font} onChange={(e) => patch(el.id, { font: e.target.value })}>{fonts.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select>
            <button type="button" className="studio-font-add" title="Upload a font file (TTF/OTF/WOFF) — including Google Fonts you've downloaded" onClick={onAddFont}>＋</button>
          </div>
        </label>
        <label>{t('prop_align', lang)}
          <select value={el.align} onChange={(e) => patch(el.id, { align: e.target.value as TextEl['align'] })}>
            <option value="left">{t('al_left', lang)}</option><option value="center">{t('al_center', lang)}</option><option value="right">{t('al_right', lang)}</option>
          </select>
        </label>
      </div>
      <Swatches value={el.color} onPick={(c) => patch(el.id, { color: c })} palette={palette} />
    </>
  );
}

function FillProps({ el, patch, palette }: { el: RectEl | EllipseEl; patch: (id: string, p: Partial<Element>) => void; palette: string[] }) {
  const lang = useLang();
  return (
    <>
      <Swatches value={el.fill} onPick={(c) => patch(el.id, { fill: c })} palette={palette} />
      {el.type === 'rect' && <label className="studio-inline">{t('prop_corner_radius', lang)}<input type="number" value={(el as RectEl).radius ?? 0} onChange={(e) => patch(el.id, { radius: Number(e.target.value) } as Partial<Element>)} /></label>}
    </>
  );
}

function LineProps({ el, patch, palette }: { el: LineEl; patch: (id: string, p: Partial<Element>) => void; palette: string[] }) {
  const lang = useLang();
  return (
    <>
      <Swatches value={el.stroke} onPick={(c) => patch(el.id, { stroke: c } as Partial<Element>)} palette={palette} />
      <label className="studio-inline">{t('prop_thickness', lang)}<input type="number" value={el.strokeWidth} onChange={(e) => patch(el.id, { strokeWidth: Math.max(1, Number(e.target.value)) } as Partial<Element>)} /></label>
    </>
  );
}

function ImageProps({ el, patch, snapshot }: { el: ImageEl; patch: (id: string, p: Partial<Element>) => void; snapshot: () => void }) {
  const lang = useLang();
  const [tilting, setTilting] = useState(false);
  const [styling, setStyling] = useState(false);
  // Free, on-device art filter (sketch / cartoon / painting / …). Bakes into the
  // layer bitmap like tilt/flip; the first tap remembers the pre-filter source
  // on the element (via a data-* we stash in a ref map keyed by id) so switching
  // filters restyles the original, not the filtered result.
  const origRef = useRef<Map<string, string>>((ImageProps as unknown as { _orig?: Map<string, string> })._orig ??= new Map());
  const stylize = (fxId: string | null) => {
    setStyling(true);
    void (async () => {
      try {
        if (!origRef.current.has(el.id)) origRef.current.set(el.id, el.href);
        const src = origRef.current.get(el.id)!;
        const { stylizePhoto } = await import('./photoFxRender.js');
        const href = fxId ? await stylizePhoto(src, fxId as 'sketch') : src;
        snapshot();
        patch(el.id, { href } as Partial<Element>);
      } catch { /* leave the layer untouched on failure */ }
      finally { setStyling(false); }
    })();
  };
  // An unfilled photo slot: the panel is just "add a photo" (a discoverable
  // button, in addition to tapping the slot on the canvas).
  if (el.placeholder && !el.href) {
    return (
      <>
        <p className="studio-hint" style={{ margin: '0 0 8px' }}>This is a photo slot — tap it on the design, or use the button below.</p>
        <label className="ed-slide-imgbtn">🖼 Choose a photo
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; const rd = new FileReader(); rd.onload = () => { snapshot(); patch(el.id, { href: String(rd.result), placeholder: undefined } as Partial<Element>); }; rd.readAsDataURL(f); }} />
        </label>
      </>
    );
  }
  // Bake a perspective tilt into the layer's bitmap. Repeated taps compound;
  // each tap snapshots history explicitly so Undo steps back one tilt at a
  // time (focus-based coalescing is for sliders, not destructive bakes).
  const tilt = (dir: 'left' | 'right' | 'up' | 'down') => {
    setTilting(true);
    void (async () => {
      try {
        const { tiltQuad, warpRectToQuad } = await import('./perspective.js');
        const img = new Image();
        await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('load')); img.src = el.href; });
        const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const cx = c.getContext('2d', { willReadFrequently: true })!;
        cx.drawImage(img, 0, 0);
        const src = cx.getImageData(0, 0, w, h);
        const out = cx.createImageData(w, h);
        out.data.set(warpRectToQuad(src.data, w, h, tiltQuad(w, h, dir, 0.16), w, h));
        cx.putImageData(out, 0, 0);
        snapshot();
        patch(el.id, { href: c.toDataURL('image/png') } as Partial<Element>);
      } catch { /* leave the layer untouched on failure */ }
      finally { setTilting(false); }
    })();
  };
  // Mirror the bitmap — same bake-with-snapshot pattern as tilt.
  const flip = (axis: 'h' | 'v') => {
    setTilting(true);
    void (async () => {
      try {
        const img = new Image();
        await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('load')); img.src = el.href; });
        const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const cx = c.getContext('2d')!;
        if (axis === 'h') { cx.translate(w, 0); cx.scale(-1, 1); } else { cx.translate(0, h); cx.scale(1, -1); }
        cx.drawImage(img, 0, 0);
        snapshot();
        patch(el.id, { href: c.toDataURL('image/png') } as Partial<Element>);
      } catch { /* leave the layer untouched on failure */ }
      finally { setTilting(false); }
    })();
  };
  return (
    <>
      <label className="studio-inline">Shape
        <TkxSelect size="sm" value={el.shape ?? 'rect'} options={IMAGE_SHAPES.map((s) => ({ value: s.id, label: s.label }))} onChange={(v) => patch(el.id, { shape: (Array.isArray(v) ? v[0] : v) as ImageShape } as Partial<Element>)} />
      </label>
      {(el.shape ?? 'rect') === 'rect' && <label className="studio-inline">{t('prop_corner_radius', lang)}<input type="number" value={el.radius ?? 0} onChange={(e) => patch(el.id, { radius: Number(e.target.value) } as Partial<Element>)} /></label>}
      <label className="studio-inline">Shadow
        <TkxSelect size="sm" value={el.shadow ?? 'none'} options={[
          { value: 'none', label: 'None' },
          { value: 'soft', label: '🌥️ Soft' },
          { value: 'strong', label: '⬛ Strong' },
        ]} onChange={(v) => { const val = (Array.isArray(v) ? v[0] : v); patch(el.id, { shadow: val === 'none' ? undefined : val as ImageShadow } as Partial<Element>); }} />
      </label>
      <label className="studio-inline">3D tilt &amp; flip
        <span className="studio-tilt-row">
          <button disabled={tilting} title="Tilt left (the left side leans away)" onClick={() => tilt('left')}>⬅️</button>
          <button disabled={tilting} title="Tilt right (the right side leans away)" onClick={() => tilt('right')}>➡️</button>
          <button disabled={tilting} title="Tilt back (the top leans away)" onClick={() => tilt('up')}>⬆️</button>
          <button disabled={tilting} title="Tilt forward (the bottom leans away)" onClick={() => tilt('down')}>⬇️</button>
          <button disabled={tilting} title="Mirror left-to-right" onClick={() => flip('h')}>↔️</button>
          <button disabled={tilting} title="Flip upside-down" onClick={() => flip('v')}>↕️</button>
        </span>
      </label>
      <p className="studio-hint" style={{ margin: 0 }}>Tap again for a stronger tilt · Ctrl/Cmd+Z undoes.</p>
      <label className="studio-inline">✨ Art filter
        <span className="studio-tilt-row studio-fx-row">
          {PHOTO_FX.map((fx) => <button key={fx.id} disabled={styling} title={`${fx.label} — free, on your device`} onClick={() => stylize(fx.id)}>{fx.emoji}</button>)}
          <button disabled={styling} title="Back to the original photo" onClick={() => stylize(null)}>↩︎</button>
        </span>
      </label>
      <p className="studio-hint" style={{ margin: 0 }}>Turn a photo into a sketch, cartoon or painting — free & private. Ctrl/Cmd+Z undoes.</p>
    </>
  );
}

/** The clip the export applies to a shaped image — mirrored on the live canvas
 *  so what you see is exactly what saves. */
function imageClipStyle(el: ImageEl): React.CSSProperties | undefined {
  if (el.shape && el.shape !== 'rect') return { clipPath: IMAGE_SHAPE_CLIPS[el.shape] };
  if (el.radius) return { clipPath: `inset(0 round ${el.radius}px)` };
  return undefined;
}

/** One element rendered as interactive SVG, with a selection outline + resize handle. */
function ElementView({ el, unit, selected, onDown, onResize }: { el: Element; unit: number; selected: boolean; onDown: (e: React.PointerEvent) => void; onResize: (e: React.PointerEvent) => void }) {
  const rot = el.rotation ? `rotate(${el.rotation} ${el.x + el.w / 2} ${el.y + el.h / 2})` : undefined;
  const common = { onPointerDown: onDown, style: { cursor: 'move', touchAction: 'none' } as React.CSSProperties, transform: rot };
  // Handles are sized in artboard units relative to the canvas. `hit` is a large
  // transparent tap target (comfortable on a phone where the artboard is scaled
  // down); `vis` is the smaller visible marker drawn on top.
  const hit = Math.max(44, Math.round(unit * 0.07));
  const vis = Math.max(16, Math.round(unit * 0.026));
  const cx = el.x + el.w, cy = el.y + el.h;
  let shape: React.ReactNode = null;
  if (el.type === 'rect') shape = <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={el.radius} ry={el.radius} fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth} {...common} />;
  else if (el.type === 'ellipse') shape = <ellipse cx={el.x + el.w / 2} cy={el.y + el.h / 2} rx={el.w / 2} ry={el.h / 2} fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth} {...common} />;
  else if (el.type === 'line') shape = <line x1={el.x} y1={el.y} x2={el.x + el.w} y2={el.y + el.h} stroke={el.stroke} strokeWidth={el.strokeWidth} strokeLinecap="round" {...common} />;
  else if (el.type === 'image' && (el as ImageEl).placeholder && !el.href) {
    // Unfilled photo slot - tap (pointerup with no drag) opens the picker.
    const fs = Math.max(14, Math.min(el.w, el.h) * 0.11);
    shape = (
      <g {...common} style={{ ...common.style, cursor: 'pointer' }}>
        <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={14} fill="#f8fafc" fillOpacity={0.85} stroke="#94a3b8" strokeWidth={2.5} strokeDasharray="12 9" />
        <text x={el.x + el.w / 2} y={el.y + el.h / 2 - fs * 0.2} fontFamily="system-ui, sans-serif" fontSize={fs * 1.8} textAnchor="middle">📷</text>
        <text x={el.x + el.w / 2} y={el.y + el.h / 2 + fs * 1.4} fontFamily="system-ui, sans-serif" fontSize={fs} fontWeight={600} fill="#64748b" textAnchor="middle">Tap to add photo</text>
      </g>
    );
  }
  else if (el.type === 'image') {
    const img = <image x={el.x} y={el.y} width={el.w} height={el.h} href={el.href} preserveAspectRatio={el.fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice'} {...common} style={{ ...common.style, ...imageClipStyle(el) }} />;
    const sh = imageShadowParams(el);
    // Same SVG-native filter as the export path — WYSIWYG.
    shape = sh ? (
      <g filter={`url(#lsh-${el.id})`}>
        <defs><filter id={`lsh-${el.id}`} x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy={sh.dy} stdDeviation={sh.blur} floodColor="#000000" floodOpacity={sh.opacity} /></filter></defs>
        {img}
      </g>
    ) : img;
  }
  else if (el.type === 'text') {
    const anchor = el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start';
    const tx = el.align === 'center' ? el.x + el.w / 2 : el.align === 'right' ? el.x + el.w : el.x;
    shape = (
      <text x={tx} y={el.y} fontFamily={el.font} fontSize={el.size} fontWeight={el.weight} fill={el.color} textAnchor={anchor} {...common}>
        {el.text.split('\n').map((ln, i) => <tspan key={i} x={tx} dy={i === 0 ? el.size : el.size * 1.25}>{ln || ' '}</tspan>)}
      </text>
    );
  }
  // A motion class on an OUTER group animates via CSS without colliding with the
  // shape's own rotation transform. Selection handles sit outside so they don't
  // jitter with the preview.
  const spd = el.motionSpeed && el.motionSpeed > 0 ? el.motionSpeed : 1;
  const moving = el.motion
    ? <g className={`ptx-mo-${el.motion}`} style={spd !== 1 ? { animationDuration: `${(MOTION_BASE_SECONDS[el.motion] / spd).toFixed(2)}s` } : undefined}>{shape}</g>
    : shape;
  return (
    <g>
      {moving}
      {selected && el.type === 'line' && (
        <g transform={rot}>
          {/* Endpoint handle: drag it anywhere to point the line in any direction. */}
          <circle cx={el.x} cy={el.y} r={vis * 0.4} fill="#fff" stroke="#2e5bff" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
          <circle cx={cx} cy={cy} r={hit / 2} fill="transparent" onPointerDown={onResize} style={{ cursor: 'grab', touchAction: 'none' }} />
          <circle cx={cx} cy={cy} r={vis * 0.55} fill="#2e5bff" stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        </g>
      )}
      {selected && el.type !== 'line' && (
        <g transform={rot}>
          <rect x={el.x} y={el.y} width={el.w} height={el.h} fill="none" stroke="#2e5bff" strokeWidth={2} strokeDasharray="6 4" pointerEvents="none" vectorEffect="non-scaling-stroke" />
          {/* Big transparent tap target + smaller visible marker, centred on the corner. */}
          <rect x={cx - hit / 2} y={cy - hit / 2} width={hit} height={hit} fill="transparent" onPointerDown={onResize} style={{ cursor: 'nwse-resize', touchAction: 'none' }} />
          <rect x={cx - vis / 2} y={cy - vis / 2} width={vis} height={vis} rx={Math.round(vis * 0.25)} fill="#2e5bff" stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        </g>
      )}
    </g>
  );
}
