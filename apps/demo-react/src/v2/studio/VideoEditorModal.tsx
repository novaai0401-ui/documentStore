/**
 * Video editor — join several clips into ONE movie, entirely in the browser:
 * add videos, trim each, put them in order, lay timed text on top, add music,
 * export. Playback runs clip-by-clip onto a canvas whose stream (plus a
 * WebAudio mix of the clips' own sound and/or music) is captured by
 * MediaRecorder in real time — the same no-upload machinery as Video Studio,
 * extended to a multi-clip timeline. The timeline maths live in videoEdit.ts
 * (pure, unit-tested); this file is the browser glue and UI.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { TkxButton, TkxInput, TkxSelect } from 'tekivex-ui';
import { t, useLang } from '../../i18n.js';
import { outputDims, coverSrcRect, type VideoAspect } from './video.js';
import { formatDuration } from './record.js';
import { bestRecorderMime, recorderExt } from './canvasRecord.js';
import { webCodecsSupported } from './animateEncode.js';
import { encodeTimelineWebM, type TimelineClipSource } from './videoEncode.js';
import { PLATFORM_PRESETS, platformPresetById, matchPreset } from './platformPresets.js';
import { startVoiceOver, type VoiceRecording } from './voiceOver.js';
import { splitScript, autoTimeCaptions, parseSrt, toSrt } from './captions.js';
import {
  clampClip, clipLength, clipSpeed, clipVolume, clipStarts, fadeAlpha, totalDuration, moveItem, overlaysAt, textPoint, editId,
  imageOverlaysAt, imageBox,
  LOOK_FILTERS, type ClipLook, type EditClip, type TextOverlay, type ImageOverlay, type OverlayPos,
} from './videoEdit.js';

/** Fade length when "Smooth start & end" is on. */
const FADE_SEC = 0.8;

interface LoadedClip extends EditClip { file: File; url: string; w: number; h: number }
interface LoadedImage extends ImageOverlay { url: string; el: HTMLImageElement; name: string }

/** Read duration + dimensions from a file without attaching anything to the DOM. */
function probeVideo(file: File): Promise<{ url: string; duration: number; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    const finish = () => resolve({ url, duration: v.duration || 0, w: v.videoWidth || 640, h: v.videoHeight || 360 });
    v.onloadedmetadata = () => {
      // MediaRecorder-produced WebM (e.g. our own screen recordings) reports
      // duration: Infinity until you seek past the end — force the real value.
      if (!isFinite(v.duration)) {
        v.ondurationchange = () => { if (isFinite(v.duration)) { v.ondurationchange = null; finish(); } };
        v.currentTime = Number.MAX_SAFE_INTEGER;
      } else finish();
    };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Couldn't read ${file.name} — is it a video?`)); };
    v.src = url;
  });
}

/** Wait until a video element can seek/play. */
const ready = (v: HTMLVideoElement) => new Promise<void>((resolve, reject) => {
  if (v.readyState >= 1) { resolve(); return; }
  v.addEventListener('loadedmetadata', () => resolve(), { once: true });
  v.addEventListener('error', () => reject(new Error('Could not load a clip')), { once: true });
});

const seekTo = (v: HTMLVideoElement, t: number) => new Promise<void>((resolve) => {
  const on = () => { v.removeEventListener('seeked', on); resolve(); };
  v.addEventListener('seeked', on);
  v.currentTime = t;
  // No 'seeked' fires when the position doesn't actually change (e.g. seeking
  // to 0 on a fresh element) — without this check the export hangs forever.
  if (!v.seeking) { v.removeEventListener('seeked', on); resolve(); }
});

/** True if the canvas is essentially all-black/empty (no decoded frame drawn) —
 *  used to detect the "black cover" case and fall back to the video grab. */
function isBlankCanvas(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  try {
    const pts = [[w * 0.5, h * 0.5], [w * 0.25, h * 0.25], [w * 0.75, h * 0.75], [w * 0.5, h * 0.15]];
    for (const [x, y] of pts) {
      const d = ctx.getImageData(Math.floor(x!), Math.floor(y!), 1, 1).data;
      if (d[0]! > 8 || d[1]! > 8 || d[2]! > 8) return false; // some real colour present
    }
    return true;
  } catch { return false; }
}

/** Stroke-then-fill text so overlays stay readable on any footage. */
function drawOverlays(ctx: CanvasRenderingContext2D, ovs: TextOverlay[], tSec: number, w: number, h: number) {
  for (const o of overlaysAt(ovs, tSec)) {
    const px = Math.max(10, Math.round(o.sizeFrac * h));
    ctx.font = `700 ${px}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, px / 8);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    const { x, y } = textPoint(o, w, h, px);
    ctx.strokeText(o.text, x, y);
    ctx.fillStyle = o.color;
    ctx.fillText(o.text, x, y);
  }
}

const SIZE_OPTIONS = [
  { value: '0.05', label: 'Small' },
  { value: '0.075', label: 'Medium' },
  { value: '0.11', label: 'Big' },
];

const IMG_SIZE_OPTIONS = [
  { value: '0.25', label: 'Small' },
  { value: '0.4', label: 'Medium' },
  { value: '0.6', label: 'Big' },
  { value: '0.9', label: 'Full width' },
];

/** Draw the image overlays (logo/photo) visible at `tSec`, keeping each one's
 *  aspect ratio, centred horizontally at its chosen top/middle/bottom slot. */
function drawImages(ctx: CanvasRenderingContext2D, imgs: LoadedImage[], tSec: number, w: number, h: number) {
  for (const o of imageOverlaysAt(imgs, tSec)) {
    const el = o.el;
    const nw = el.naturalWidth || 1, nh = el.naturalHeight || 1;
    const dw = Math.max(1, Math.round(o.sizeFrac * w));
    const dh = Math.max(1, Math.round(dw * (nh / nw)));
    const { x, y } = imageBox(o.pos, w, h, dw, dh, o.fx, o.fy);
    try { ctx.drawImage(el, x, y, dw, dh); } catch { /* image not decoded yet — skip this frame */ }
  }
}

/** One-tap trending stickers — added as big emoji text overlays. */
const STICKERS = ['🔥', '😂', '😍', '✅', '👉', '💯', '⭐', '🎉', '❤️', '😮', '🚀', '👀', '💰', '🤯'];

/**
 * Live WYSIWYG preview — a canvas that shows the selected clip framed to the
 * chosen shape with the text, stickers and images drawn exactly as they'll
 * export, so users SEE the result while they edit. Tapping plays/pauses (looping
 * the trimmed region); overlays appear/disappear at their timed moments. The
 * `videoRef` is shared with the parent so "Save cover" can grab the frame.
 */
function ReelPreview({ clip, clips, overlays, imgs, aspect, maxW, videoRef, canvasRef: coverCanvasRef, onMove }: {
  clip: LoadedClip; clips: LoadedClip[]; overlays: TextOverlay[]; imgs: LoadedImage[];
  aspect: VideoAspect; maxW: number; videoRef: RefObject<HTMLVideoElement | null>;
  /** Shared with the parent so "Save cover" grabs the exact composited frame. */
  canvasRef?: RefObject<HTMLCanvasElement | null>;
  /** Drag callback: reposition an overlay's centre to (fx,fy) fractions. */
  onMove?: (kind: 'text' | 'image', id: string, fx: number, fy: number) => void;
}) {
  const localCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = coverCanvasRef ?? localCanvasRef;
  const rafRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  // Which overlay the pointer grabbed, and the grab offset (design px).
  const dragRef = useRef<{ kind: 'text' | 'image'; id: string } | null>(null);
  const movieStart = useMemo(() => {
    const starts = clipStarts(clips); const i = clips.findIndex((c) => c.id === clip.id);
    return starts[i] ?? 0;
  }, [clips, clip.id]);

  const draw = useCallback(() => {
    const cv = canvasRef.current, v = videoRef.current; if (!cv || !v) return;
    const { w, h } = outputDims(clip.w, clip.h, aspect, maxW);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const ctx = cv.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    const cr = coverSrcRect(v.videoWidth || clip.w, v.videoHeight || clip.h, w, h);
    ctx.filter = LOOK_FILTERS[clip.look ?? 'none'];
    try { ctx.drawImage(v, cr.sx, cr.sy, cr.sw, cr.sh, 0, 0, w, h); } catch { /* not decoded yet */ }
    ctx.filter = 'none';
    const movieT = movieStart + Math.max(0, v.currentTime - clip.inS) / clipSpeed(clip);
    drawImages(ctx, imgs, movieT, w, h);
    drawOverlays(ctx, overlays, movieT, w, h);
  }, [clip, aspect, maxW, imgs, overlays, movieStart, videoRef]);

  // Playback loop: keep drawing and loop within the trim window.
  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    if (playing) {
      if (v.currentTime < clip.inS || v.currentTime >= clip.outS - 0.02) v.currentTime = clip.inS;
      v.playbackRate = clipSpeed(clip);
      // The actual play() is kicked off from the tap gesture (below) so it works
      // in iOS Low Power Mode, which blocks even muted non-gesture playback. Here
      // we only ensure it's rolling and drive the redraw loop.
      if (v.paused) void v.play().catch(() => { /* gesture play covers Low Power Mode */ });
      const tick = () => { if (v.currentTime >= clip.outS - 0.02) v.currentTime = clip.inS; draw(); rafRef.current = requestAnimationFrame(tick); };
      rafRef.current = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafRef.current);
    }
    v.pause();
    return undefined;
  }, [playing, clip.inS, clip.outS, clip, draw, videoRef]);

  // Redraw whenever the edit changes while paused — ALWAYS, not only when the
  // hidden <video> has a decoded frame. On iOS a display:none paused video sits
  // below readyState 2, so the old guard skipped the redraw and a just-added
  // sticker/photo/text wouldn't appear until you played or exported. draw()
  // already tolerates an undecoded frame (it paints black then the overlays), so
  // the overlay shows live; the footage fills in on the next seeked/loadeddata.
  useEffect(() => { if (!playing) draw(); }, [draw, playing]);

  // Hit-test the topmost overlay/image visible at the current moment (design px).
  const hitTest = useCallback((dx: number, dy: number, w: number, h: number): { kind: 'text' | 'image'; id: string } | null => {
    const v = videoRef.current; if (!v) return null;
    const movieT = movieStart + Math.max(0, v.currentTime - clip.inS) / clipSpeed(clip);
    // Images first (drawn under text); iterate reverse so the topmost wins.
    const vis = imageOverlaysAt(imgs, movieT);
    for (let i = vis.length - 1; i >= 0; i--) {
      const o = vis[i]!; const el = o.el; const nw = el.naturalWidth || 1, nh = el.naturalHeight || 1;
      const dw = Math.max(1, Math.round(o.sizeFrac * w)), dh = Math.max(1, Math.round(dw * (nh / nw)));
      const { x, y } = imageBox(o.pos, w, h, dw, dh, o.fx, o.fy);
      if (dx >= x && dx <= x + dw && dy >= y && dy <= y + dh) return { kind: 'image', id: o.id };
    }
    const vt = overlaysAt(overlays, movieT);
    for (let i = vt.length - 1; i >= 0; i--) {
      const o = vt[i]!; const px = Math.max(10, Math.round(o.sizeFrac * h));
      const { x, y } = textPoint(o, w, h, px);
      const tw = Math.max(px * 2, o.text.length * px * 0.6);
      if (dx >= x - tw / 2 && dx <= x + tw / 2 && dy >= y - px && dy <= y + px * 0.4) return { kind: 'text', id: o.id };
    }
    return null;
  }, [imgs, overlays, movieStart, clip, videoRef]);
  const hitTestRef = useRef(hitTest); hitTestRef.current = hitTest;
  const onMoveRef = useRef(onMove); onMoveRef.current = onMove;

  // Drag stickers/photos/text with NATIVE, non-passive touch listeners. On iOS
  // Safari this is the only reliable way to move something on a canvas without
  // the page scrolling out from under the finger — you MUST preventDefault()
  // inside a non-passive touchmove (React's onTouchMove is passive and can't).
  // A short tap that doesn't hit an overlay toggles play/pause. Mouse handled too.
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    let drag: { kind: 'text' | 'image'; id: string } | null = null;
    let tapAt: { x: number; y: number } | null = null;
    const toD = (cx: number, cy: number) => { const r = cv.getBoundingClientRect(); return { x: ((cx - r.left) / r.width) * cv.width, y: ((cy - r.top) / r.height) * cv.height, w: cv.width, h: cv.height }; };
    const begin = (cx: number, cy: number): boolean => {
      if (!onMoveRef.current) return false;
      const p = toD(cx, cy); const hit = hitTestRef.current(p.x, p.y, p.w, p.h);
      if (!hit) return false;
      drag = hit; dragRef.current = hit; return true;
    };
    const moveTo = (cx: number, cy: number) => {
      if (!drag) return;
      const p = toD(cx, cy);
      onMoveRef.current?.(drag.kind, drag.id, Math.max(0, Math.min(1, p.x / p.w)), Math.max(0, Math.min(1, p.y / p.h)));
    };
    let moved = false;
    // A touch tap is followed ~300ms later by synthetic mouse events
    // (mousedown/mouseup/click). Without this guard both `te` and `mu` fire for
    // one tap, toggling play twice → it plays then immediately pauses and the
    // video never rolls on a touchscreen. Ignore mouse events right after a touch.
    let lastTouch = 0;
    const clear = () => { drag = null; dragRef.current = null; };
    // Toggle play/pause. Call play() SYNCHRONOUSLY here — this runs inside the
    // touch/click gesture, which iOS Low Power Mode requires (it blocks even
    // muted playback started from a later effect). setPlaying drives the redraw
    // loop; reading v.paused avoids any stale-state races.
    const togglePlay = () => {
      const v = videoRef.current;
      if (v && !v.paused) { v.pause(); setPlaying(false); return; }
      setPlaying(true);
      if (v) { const pr = v.play(); if (pr && typeof pr.catch === 'function') pr.catch(() => { /* keeps trying via the loop */ }); }
    };
    const ts = (e: TouchEvent) => { lastTouch = Date.now(); const t = e.touches[0] || e.changedTouches[0]; if (!t) return; if (begin(t.clientX, t.clientY)) { e.preventDefault(); tapAt = null; } else { tapAt = { x: t.clientX, y: t.clientY }; moved = false; } };
    const tm = (e: TouchEvent) => {
      const t = e.touches[0] || e.changedTouches[0];
      if (drag) { e.preventDefault(); if (t) moveTo(t.clientX, t.clientY); return; }
      if (tapAt && t && (Math.abs(t.clientX - tapAt.x) > 12 || Math.abs(t.clientY - tapAt.y) > 12)) moved = true;
    };
    const te = () => { lastTouch = Date.now(); if (drag) { clear(); return; } if (tapAt && !moved) togglePlay(); tapAt = null; };
    const md = (e: MouseEvent) => { if (Date.now() - lastTouch < 700) return; if (begin(e.clientX, e.clientY)) e.preventDefault(); else { tapAt = { x: e.clientX, y: e.clientY }; moved = false; } };
    const mm = (e: MouseEvent) => { if (drag) { moveTo(e.clientX, e.clientY); return; } if (tapAt && (Math.abs(e.clientX - tapAt.x) > 5 || Math.abs(e.clientY - tapAt.y) > 5)) moved = true; };
    const mu = () => { if (Date.now() - lastTouch < 700) return; if (drag) { clear(); return; } if (tapAt && !moved) togglePlay(); tapAt = null; };
    cv.addEventListener('touchstart', ts, { passive: false });
    cv.addEventListener('touchmove', tm, { passive: false });
    cv.addEventListener('touchend', te);
    cv.addEventListener('touchcancel', () => { clear(); tapAt = null; });
    cv.addEventListener('mousedown', md);
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseup', mu);
    return () => {
      cv.removeEventListener('touchstart', ts); cv.removeEventListener('touchmove', tm);
      cv.removeEventListener('touchend', te);
      cv.removeEventListener('mousedown', md); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu);
    };
  }, [canvasRef]);

  return (
    <div className="ve-preview">
      {/* Fully rendered (NOT display:none, NOT opacity:0) but sitting behind the
          opaque canvas that covers it: iOS Safari won't play() or even keep
          decoding frames for a display:none / opacity:0 video, which is why the
          preview looked frozen. The canvas on top draws the composited frame. */}
      <video ref={videoRef} src={clip.url} muted playsInline preload="auto"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0, pointerEvents: 'none' }}
        onLoadedData={() => { const v = videoRef.current; if (v && v.currentTime < clip.inS) v.currentTime = clip.inS; draw(); }}
        onSeeked={draw} />
      <canvas ref={canvasRef} className="ve-preview-canvas" style={{ touchAction: 'none', position: 'relative', zIndex: 1 }}
        title={onMove ? 'Drag a sticker/photo/text to move it · tap empty space to play' : 'Tap to play / pause'} />
      {/* Visual play/pause indicator ABOVE the canvas (z-index) so it shows; it's
          non-interactive (tapping the video toggles play via the canvas handler). */}
      <button className="ve-preview-play" style={{ pointerEvents: 'none', zIndex: 2 }} aria-hidden>{playing ? '⏸' : '▶'}</button>
      <span className="ve-preview-tag">{onMove ? '✋ Drag stickers/photos/text · tap to play' : 'Preview · what you’ll get'}</span>
    </div>
  );
}

export function VideoEditorModal({ onClose, reel = false }: { onClose: () => void; reel?: boolean }) {
  const lang = useLang();
  const [clips, setClips] = useState<LoadedClip[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<TextOverlay[]>([]);
  const [imgs, setImgs] = useState<LoadedImage[]>([]);
  const [captionText, setCaptionText] = useState('');
  const [music, setMusic] = useState<File | null>(null);
  const [musicMode, setMusicMode] = useState<'keep' | 'mix' | 'replace'>('keep');
  const [musicVol, setMusicVol] = useState(0.6);
  const [fade, setFade] = useState(false);
  const [transition, setTransition] = useState(false);
  // Reel mode opens vertical 9:16 at 1080p (YouTube Shorts / Instagram Reel /
  // TikTok / Status), so an uploaded clip is framed for short-form out of the box.
  // maxW is the LONGEST side, so 1920 → 1080×1920 (matches the yt-shorts preset
  // and the "1080p" Quality option).
  const [aspect, setAspect] = useState<VideoAspect>(reel ? '9:16' : 'source');
  const [maxW, setMaxW] = useState(reel ? 1920 : 1280);
  // Voice-over: a narration track recorded from the mic and mixed over the movie.
  const [voice, setVoice] = useState<File | null>(null);
  const [voiceVol, setVoiceVol] = useState(1);
  const [voiceDuck, setVoiceDuck] = useState(true);
  const [recSecs, setRecSecs] = useState<number | null>(null); // null = not recording
  const recRef = useRef<VoiceRecording | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string; blob: Blob } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const musicRef = useRef<HTMLInputElement | null>(null);
  const imgRef = useRef<HTMLInputElement | null>(null);
  const srtRef = useRef<HTMLInputElement | null>(null);
  const imgsRef = useRef(imgs); imgsRef.current = imgs;
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const clipsRef = useRef(clips); clipsRef.current = clips;
  // Drag a sticker/photo/text on the preview → store its free centre (fx,fy).
  const moveOverlay = useCallback((kind: 'text' | 'image', id: string, fx: number, fy: number) => {
    if (kind === 'text') setOverlays((os) => os.map((o) => (o.id === id ? { ...o, fx, fy } : o)));
    else setImgs((xs) => xs.map((x) => (x.id === id ? { ...x, fx, fy } : x)));
  }, []);
  // Lets the user abandon a long export; checked between frames.
  const stopRef = useRef(false);

  // Object URLs live as long as the modal; revoke everything on unmount.
  useEffect(() => () => { for (const c of clipsRef.current) URL.revokeObjectURL(c.url); }, []);
  useEffect(() => () => { for (const im of imgsRef.current) URL.revokeObjectURL(im.url); }, []);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  const selClip = clips.find((c) => c.id === sel) ?? null;
  const total = totalDuration(clips);
  const noun = reel ? 'reel' : 'movie';
  /** Output filename from the encoded blob's mime (mp4 vs webm), reel-aware. */
  const outName = (mime: string) => `${noun}.${recorderExt(mime)}`;

  const addFiles = useCallback(async (files: File[]) => {
    setErr(null);
    for (const f of files) {
      try {
        const m = await probeVideo(f);
        const clip: LoadedClip = { id: editId(), name: f.name, duration: m.duration, inS: 0, outS: m.duration, file: f, url: m.url, w: m.w, h: m.h };
        setClips((cs) => [...cs, clip]);
        setSel((s) => s ?? clip.id);
      } catch (e) { setErr(e instanceof Error ? e.message : 'Could not add that file.'); }
    }
  }, []);

  const patchClip = (id: string, p: Partial<EditClip>) =>
    setClips((cs) => cs.map((c) => (c.id === id ? clampClip({ ...c, ...p }) : c)));

  const removeClip = (id: string) => setClips((cs) => {
    const gone = cs.find((c) => c.id === id);
    if (gone) URL.revokeObjectURL(gone.url);
    const next = cs.filter((c) => c.id !== id);
    setSel((s) => (s === id ? next[0]?.id ?? null : s));
    return next;
  });

  const addOverlay = () => setOverlays((os) => [...os, {
    id: editId(), text: '', startS: 0, endS: Math.max(1, Math.min(3, Math.round(total * 10) / 10 || 3)),
    pos: 'bottom', sizeFrac: 0.075, color: '#ffffff',
  }]);
  const patchOverlay = (id: string, p: Partial<TextOverlay>) => setOverlays((os) => os.map((o) => (o.id === id ? { ...o, ...p } : o)));

  /** Turn a caption cue into a bottom, caption-styled text overlay. */
  const cueOverlay = (text: string, startS: number, endS: number): TextOverlay =>
    ({ id: editId(), text, startS, endS, pos: 'bottom', sizeFrac: 0.055, color: '#ffffff' });
  /** Spread the typed caption text across the movie as timed bottom captions. */
  const autoCaption = () => {
    const chunks = splitScript(captionText, 42);
    if (!chunks.length || total < 0.2) return;
    setOverlays((os) => [...os, ...autoTimeCaptions(chunks, total).map((c) => cueOverlay(c.text, c.startS, c.endS))]);
    setCaptionText('');
  };
  /** Load captions from an .srt file. */
  const importSrt = async (file: File) => {
    try { const cues = parseSrt(await file.text()); if (cues.length) setOverlays((os) => [...os, ...cues.map((c) => cueOverlay(c.text, c.startS, c.endS))]); else setErr('No captions found in that file.'); }
    catch { setErr('Could not read that .srt file.'); }
  };
  /** Save the current text overlays as an .srt sidecar. */
  const exportSrt = async () => {
    const cues = [...overlays].filter((o) => o.text.trim()).sort((a, b) => a.startS - b.startS).map((o) => ({ startS: o.startS, endS: o.endS, text: o.text }));
    if (!cues.length) return;
    const { saveBlob } = await import('../smart/util.js');
    await saveBlob('captions.srt', new Blob([toSrt(cues)], { type: 'text/plain' }));
  };

  /** Drop a big emoji sticker as an overlay covering the first few seconds. */
  const addSticker = (emoji: string) => setOverlays((os) => [...os, {
    id: editId(), text: emoji, startS: 0, endS: Math.max(1.5, Math.min(4, Math.round(total * 10) / 10 || 3)),
    pos: 'middle', sizeFrac: 0.16, color: '#ffffff',
  }]);

  /** Add an image/logo/photo overlay from a picture file. */
  const addImages = useCallback(async (files: File[]) => {
    setErr(null);
    for (const f of files) {
      if (!f.type.startsWith('image/')) { setErr('Please choose an image file (PNG, JPG…).'); continue; }
      const url = URL.createObjectURL(f);
      try {
        const el = await new Promise<HTMLImageElement>((resolve, reject) => {
          const im = new Image(); im.onload = () => resolve(im); im.onerror = () => reject(new Error('bad image')); im.src = url;
        });
        const t = totalDuration(clipsRef.current);
        setImgs((xs) => [...xs, { id: editId(), url, el, name: f.name, startS: 0, endS: Math.max(1.5, Math.min(5, Math.round(t * 10) / 10 || 3)), pos: 'top', sizeFrac: 0.4 }]);
      } catch { URL.revokeObjectURL(url); setErr(`Couldn't read ${f.name} — is it an image?`); }
    }
  }, []);
  const patchImage = (id: string, p: Partial<ImageOverlay>) => setImgs((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const removeImage = (id: string) => setImgs((xs) => { const g = xs.find((x) => x.id === id); if (g) URL.revokeObjectURL(g.url); return xs.filter((x) => x.id !== id); });

  // ── Voice-over recording ────────────────────────────────────────────────
  useEffect(() => { // live elapsed timer while recording
    if (recSecs === null) return;
    const id = setInterval(() => setRecSecs((s) => (s === null ? s : s + 1)), 1000);
    return () => clearInterval(id);
  }, [recSecs === null]);
  useEffect(() => () => { recRef.current?.cancel(); }, []); // release mic on unmount

  const startRec = useCallback(async () => {
    setErr(null);
    try { recRef.current = await startVoiceOver(); setRecSecs(0); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not start the microphone.'); }
  }, []);
  const stopRec = useCallback(async () => {
    const r = recRef.current; if (!r) return;
    recRef.current = null; setRecSecs(null);
    try { setVoice(await r.stop()); } catch (e) { setErr(e instanceof Error ? e.message : 'Recording failed.'); }
  }, []);

  /** Save a cover image (thumbnail) — the selected clip's current frame,
   *  cropped to the export shape with the text/stickers of that moment baked in. */
  const saveCover = useCallback(async () => {
    const v = previewRef.current, c = selClip;
    if (!v || !c) return;
    const { w, h } = outputDims(c.w, c.h, aspect, maxW);
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    // Prefer the live preview canvas — it already holds the exact composited
    // frame (footage + overlays), so the cover is never a blank/black frame the
    // way re-grabbing the hidden <video> can be if it hasn't a decoded frame.
    const pv = previewCanvasRef.current;
    let painted = false;
    if (pv && pv.width > 0 && pv.height > 0) {
      try {
        ctx.drawImage(pv, 0, 0, pv.width, pv.height, 0, 0, w, h);
        painted = !isBlankCanvas(ctx, w, h);
      } catch { /* fall through to the video path */ }
    }
    if (!painted) {
      // Fallback: seek the video to the previewed instant and wait for a frame.
      try { if (v.readyState < 2) await new Promise((r) => { const on = () => { v.removeEventListener('loadeddata', on); r(null); }; v.addEventListener('loadeddata', on); }); } catch { /* */ }
      const cr = coverSrcRect(v.videoWidth || c.w, v.videoHeight || c.h, w, h);
      ctx.filter = LOOK_FILTERS[c.look ?? 'none'];
      try { ctx.drawImage(v, cr.sx, cr.sy, cr.sw, cr.sh, 0, 0, w, h); } catch { /* */ }
      ctx.filter = 'none';
      const starts = clipStarts(clips);
      const idx = clips.findIndex((x) => x.id === c.id);
      const movieT = (starts[idx] ?? 0) + Math.max(0, v.currentTime - c.inS) / clipSpeed(c);
      drawImages(ctx, imgs, movieT, w, h);
      drawOverlays(ctx, overlays, movieT, w, h);
    }
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) return;
    const { saveBlob } = await import('../smart/util.js');
    await saveBlob('cover.png', blob);
  }, [selClip, clips, overlays, imgs, aspect, maxW]);

  // ── Export ────────────────────────────────────────────────────────────────
  // Fast path: WebCodecs seeks every source frame and encodes with exact
  // timestamps — the movie is exactly as long as the timeline. Fallback:
  // real-time MediaRecorder capture (older browsers), which runs at playback
  // speed and can add a fraction of a second of recorder slack.
  const exportMovie = useCallback(async () => {
    const list = clips.map(clampClip).filter((c) => clipLength(c) > 0.05);
    if (!list.length) return;
    setBusy(true); setErr(null); setProgress('Preparing…'); stopRef.current = false;
    if (result) { URL.revokeObjectURL(result.url); setResult(null); }

    // WebCodecs only when it can ALSO encode audio. iOS Safari 16.4–18.7 ships
    // WebCodecs video-only (AudioEncoder is undefined), so the voice-over/music
    // would silently vanish from the file — there, fall through to the real-time
    // MediaRecorder path below, which mixes the audio into the recording.
    const audioEncoderOk = typeof (globalThis as { AudioEncoder?: unknown }).AudioEncoder !== 'undefined';
    if (webCodecsSupported() && audioEncoderOk) {
      try {
        const { w, h } = outputDims(list[0]!.w, list[0]!.h, aspect, maxW);
        const sources: TimelineClipSource[] = list.map((c) => {
          const v = document.createElement('video');
          v.src = c.url; v.playsInline = true; v.preload = 'auto'; v.muted = true;
          return { ...c, el: v };
        });
        await Promise.all(sources.map((s) => ready(s.el)));
        const movieLen = totalDuration(list);
        const blob = await encodeTimelineWebM({
          clips: sources, w, h, fps: 30, musicFile: music, musicMode,
          musicVolume: musicVol, fadeSec: fade ? FADE_SEC : 0,
          transitionSec: transition ? 0.6 : 0,
          voiceFile: voice, voiceVolume: voiceVol, voiceStartS: 0, voiceDuck: voice && voiceDuck ? 0.35 : 1,
          drawClip: (ctx, clip, alpha, ow, oh) => {
            const cr = coverSrcRect(clip.el.videoWidth || clip.w, clip.el.videoHeight || clip.h, ow, oh);
            ctx.globalAlpha = alpha;
            ctx.filter = LOOK_FILTERS[clip.look ?? 'none'];
            ctx.drawImage(clip.el, cr.sx, cr.sy, cr.sw, cr.sh, 0, 0, ow, oh);
            ctx.filter = 'none';
            ctx.globalAlpha = 1;
          },
          drawTop: (ctx, movieT, ow, oh) => {
            drawImages(ctx, imgs, movieT, ow, oh);
            drawOverlays(ctx, overlays, movieT, ow, oh);
            const fa = fadeAlpha(movieT, movieLen, fade ? FADE_SEC : 0);
            if (fa > 0) { ctx.fillStyle = `rgba(0,0,0,${fa.toFixed(3)})`; ctx.fillRect(0, 0, ow, oh); }
          },
          onProgress: setProgress,
          shouldStop: () => stopRef.current,
        });
        setResult({ url: URL.createObjectURL(blob), name: outName(blob.type), blob });
        setProgress(null); setBusy(false);
        return;
      } catch (e) {
        if (stopRef.current || (e instanceof Error && e.message === '__cancelled__')) { setProgress(null); setBusy(false); return; }
        setProgress('Falling back to real-time recording…'); // then run the path below
      }
    }

    let actx: AudioContext | null = null;
    let musicEl: HTMLAudioElement | null = null;
    let musicUrl: string | null = null;
    let voiceEl: HTMLAudioElement | null = null;
    let voiceUrl: string | null = null;
    try {
      const { w, h } = outputDims(list[0]!.w, list[0]!.h, aspect, maxW);
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      const stream = canvas.captureStream(30);

      // One hidden element per clip; audio is routed through WebAudio so the mix
      // (original sound, music and/or voice-over) lands in the recording, not
      // the speakers. When a voice-over exists, background is ducked under it.
      const useOriginal = musicMode !== 'replace';
      const useMusic = !!music && musicMode !== 'keep';
      const useVoice = !!voice;
      const bg = useVoice && voiceDuck ? 0.35 : 1;
      const els = list.map((c) => {
        const v = document.createElement('video');
        v.src = c.url; v.playsInline = true; v.preload = 'auto';
        v.volume = clipVolume(c) * bg; // element volume flows through the WebAudio graph
        if (!useOriginal) v.muted = true;
        return v;
      });
      if (useOriginal || useMusic || useVoice) {
        actx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        await actx.resume().catch(() => { /* */ });
        const dest = actx.createMediaStreamDestination();
        if (useOriginal) for (const v of els) actx.createMediaElementSource(v).connect(dest);
        if (useMusic) {
          musicUrl = URL.createObjectURL(music!);
          musicEl = new Audio(musicUrl);
          musicEl.loop = true;
          musicEl.volume = musicVol * bg;
          actx.createMediaElementSource(musicEl).connect(dest);
        }
        if (useVoice) {
          voiceUrl = URL.createObjectURL(voice!);
          voiceEl = new Audio(voiceUrl);
          voiceEl.volume = Math.max(0, Math.min(1, voiceVol));
          actx.createMediaElementSource(voiceEl).connect(dest);
        }
        dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
      }

      // Pre-load and pre-seek EVERY clip before recording starts — the recorder
      // runs on wall-clock, so any loading done while it rolls becomes frozen
      // dead time in the user's movie.
      setProgress('Preparing clips…');
      for (let i = 0; i < list.length; i++) { const v = els[i]!; await ready(v); await seekTo(v, list[i]!.inS); }

      const mime = bestRecorderMime(); // mp4/H.264+AAC first (iOS), then webm
      const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 6_000_000 });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

      const totalLen = totalDuration(list);
      let done = 0;
      for (let i = 0; i < list.length; i++) {
        const c = list[i]!, v = els[i]!;
        const cr = coverSrcRect(v.videoWidth || c.w, v.videoHeight || c.h, w, h);
        const look = LOOK_FILTERS[c.look ?? 'none'];
        v.playbackRate = clipSpeed(c);
        // Paint the first frame before the recorder rolls so there's no blank lead-in.
        ctx.filter = look;
        ctx.drawImage(v, cr.sx, cr.sy, cr.sw, cr.sh, 0, 0, w, h);
        ctx.filter = 'none';
        drawImages(ctx, imgs, done, w, h);
        drawOverlays(ctx, overlays, done, w, h);
        try { await v.play(); } catch { v.muted = true; await v.play().catch(() => { /* keep going — frame paints still work */ }); }
        if (i === 0) { rec.start(); musicEl?.play().catch(() => { /* silent-music fallback */ }); voiceEl?.play().catch(() => { /* silent-voice fallback */ }); }
        else rec.resume();
        await new Promise<void>((resolve) => {
          let raf = 0;
          const tick = () => {
            // v.currentTime is SOURCE time; the movie advances 1/speed as fast.
            const local = Math.max(0, v.currentTime - c.inS) / clipSpeed(c);
            ctx.filter = look;
            ctx.drawImage(v, cr.sx, cr.sy, cr.sw, cr.sh, 0, 0, w, h);
            ctx.filter = 'none';
            drawImages(ctx, imgs, done + local, w, h);
            drawOverlays(ctx, overlays, done + local, w, h);
            const fa = fadeAlpha(done + local, totalLen, fade ? FADE_SEC : 0);
            if (fa > 0) { ctx.fillStyle = `rgba(0,0,0,${fa.toFixed(3)})`; ctx.fillRect(0, 0, w, h); }
            setProgress(`Recording clip ${i + 1} / ${list.length} — ${formatDuration(Math.min(totalLen, done + local))} / ${formatDuration(totalLen)}`);
            if (v.currentTime >= c.outS - 0.02 || v.ended) { cancelAnimationFrame(raf); resolve(); return; }
            raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
        });
        v.pause();
        // Freeze the recorder while the next clip spins up — its start latency
        // must not become frozen frames in the movie.
        if (i < list.length - 1) rec.pause();
        done += clipLength(c);
      }

      rec.stop(); musicEl?.pause(); voiceEl?.pause();
      await new Promise<void>((resolve) => { rec.onstop = () => resolve(); });
      const type = chunks[0]?.type || 'video/webm';
      { const blob = new Blob(chunks, { type }); setResult({ url: URL.createObjectURL(blob), name: outName(type), blob }); }
      setProgress(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      musicEl?.pause(); voiceEl?.pause();
      if (musicUrl) URL.revokeObjectURL(musicUrl);
      if (voiceUrl) URL.revokeObjectURL(voiceUrl);
      await actx?.close().catch(() => { /* */ });
      setBusy(false);
    }
  }, [clips, overlays, imgs, music, musicMode, musicVol, voice, voiceVol, voiceDuck, fade, transition, aspect, maxW, result]);

  // Use the already-encoded Blob directly (no `await fetch` first) so the user
  // gesture stays active — otherwise iOS Safari blocks navigator.share and the
  // <a download> fallback navigates the page to the blob instead of saving.
  const download = async () => { if (!result) return; const { saveBlob } = await import('../smart/util.js'); await saveBlob(result.name, result.blob); };

  /** Native share sheet (WhatsApp/Instagram/…) — the reliable way to send the
   *  reel from a phone. Available when the browser can share files. */
  const canShareFiles = (() => {
    try { return typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [new File([], 'x.mp4', { type: 'video/mp4' })] }); }
    catch { return false; }
  })();
  const shareResult = async () => {
    if (!result) return;
    try {
      const file = new File([result.blob], result.name, { type: result.blob.type || 'video/mp4' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'My reel' });
      else await download();
    } catch (e) { if (!(e instanceof Error && e.name === 'AbortError')) setErr('Could not open the share sheet — use Download instead.'); }
  };

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner cmp-modal vid-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>{reel ? '🎬 Make a reel' : '🎞️ Video editor'}</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <p className="studio-hint">Upload your own video{reel ? '' : 's'} and turn {reel ? 'it into a reel' : 'them into one movie'}: cut each clip, add text &amp; stickers, record a voice-over, add music, pick the platform, save a cover — everything on your device, nothing uploaded.</p>

          <input ref={fileRef} type="file" accept="video/*" multiple style={{ display: 'none' }} onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; if (fs.length) void addFiles(fs); }} />

          {clips.length === 0 && (
            <div className="cmp-drop" onClick={() => fileRef.current?.click()} role="button" tabIndex={0}>
              <span className="cmp-drop-icon" aria-hidden>{reel ? '🎬' : '🎞️'}</span>
              <span>{reel ? 'Upload your video to start your reel (MP4, WebM, MOV…), or ' : 'Choose one or more videos (MP4, WebM, MOV…), or '}<strong>browse</strong></span>
            </div>
          )}

          {clips.length > 0 && (
            <>
              <div className="ve-strip" role="list" aria-label="Clips in order">
                {clips.map((c, i) => (
                  <div key={c.id} role="listitem" className={`ve-clip${c.id === sel ? ' ve-clip--sel' : ''}`} onClick={() => setSel(c.id)}>
                    <span className="ve-clip-n">{i + 1}</span>
                    <span className="ve-clip-name" title={c.name}>{c.name}</span>
                    <span className="ve-clip-len">{formatDuration(clipLength(c))}</span>
                    <span className="ve-clip-acts">
                      <button title="Move earlier" aria-label={`Move ${c.name} earlier`} disabled={i === 0} onClick={(e) => { e.stopPropagation(); setClips((cs) => moveItem(cs, i, -1)); }}>←</button>
                      <button title="Move later" aria-label={`Move ${c.name} later`} disabled={i === clips.length - 1} onClick={(e) => { e.stopPropagation(); setClips((cs) => moveItem(cs, i, 1)); }}>→</button>
                      <button title="Remove clip" aria-label={`Remove ${c.name}`} onClick={(e) => { e.stopPropagation(); removeClip(c.id); }}>✕</button>
                    </span>
                  </div>
                ))}
                <button className="ve-add" onClick={() => fileRef.current?.click()}>＋ Add videos</button>
              </div>

              {selClip && (
                <>
                  <ReelPreview key={selClip.id} clip={selClip} clips={clips} overlays={overlays} imgs={imgs} aspect={aspect} maxW={maxW} videoRef={previewRef} canvasRef={previewCanvasRef} onMove={moveOverlay} />
                  <div className="vid-trim">
                    <span className="ve-trim-which">✂ Cutting <strong>{selClip.name}</strong></span>
                    <label className="cmp-ctrl cmp-ctrl--wide">
                      <span>Keep from <strong>{formatDuration(selClip.inS)}</strong></span>
                      <input type="range" min={0} max={selClip.duration} step={0.1} value={selClip.inS} onChange={(e) => patchClip(selClip.id, { inS: Number(e.target.value) })} />
                    </label>
                    <label className="cmp-ctrl cmp-ctrl--wide">
                      <span>to <strong>{formatDuration(selClip.outS)}</strong></span>
                      <input type="range" min={0} max={selClip.duration} step={0.1} value={selClip.outS} onChange={(e) => patchClip(selClip.id, { outS: Number(e.target.value) })} />
                    </label>
                    <label className="cmp-ctrl">Speed
                      <TkxSelect size="sm" value={String(clipSpeed(selClip))} options={[
                        { value: '0.5', label: '🐢 Slow (0.5×)' },
                        { value: '1', label: 'Normal' },
                        { value: '1.5', label: 'Quick (1.5×)' },
                        { value: '2', label: '🐇 Fast (2×)' },
                      ]} onChange={(v) => patchClip(selClip.id, { speed: Number(v) })} />
                    </label>
                    <label className="cmp-ctrl">Look
                      <TkxSelect size="sm" value={selClip.look ?? 'none'} options={[
                        { value: 'none', label: 'Normal' },
                        { value: 'bw', label: 'Black and white' },
                        { value: 'warm', label: '🌅 Warm' },
                        { value: 'cool', label: '❄️ Cool' },
                        { value: 'bright', label: '☀️ Bright' },
                      ]} onChange={(v) => patchClip(selClip.id, { look: v as ClipLook })} />
                    </label>
                    <label className="cmp-ctrl">This clip’s sound
                      <TkxSelect size="sm" value={String(clipVolume(selClip))} options={[
                        { value: '1', label: '🔊 Full' },
                        { value: '0.4', label: '🔉 Quiet' },
                        { value: '0', label: '🔇 Muted' },
                      ]} onChange={(v) => patchClip(selClip.id, { volume: Number(v) })} />
                    </label>
                  </div>
                </>
              )}

              <div className="ve-section">
                <div className="ve-section-head">
                  <strong>Text, stickers &amp; images on the video</strong>
                  <span className="ve-head-acts">
                    <TkxButton variant="outline" size="sm" onClick={addOverlay}>＋ Add text</TkxButton>
                    <TkxButton variant="outline" size="sm" onClick={() => imgRef.current?.click()}>🖼️ Add image</TkxButton>
                  </span>
                </div>
                <input ref={imgRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; if (fs.length) void addImages(fs); }} />
                <div className="ve-stickers" role="group" aria-label="Add a sticker">
                  {STICKERS.map((s) => (
                    <button key={s} className="ve-sticker" title={`Add ${s}`} onClick={() => addSticker(s)}>{s}</button>
                  ))}
                </div>
                <div className="ve-captions">
                  <textarea className="ve-cap-text" rows={2} placeholder="Captions: type or paste what's said — it's split into timed subtitles across the video." value={captionText} onChange={(e) => setCaptionText(e.target.value)} />
                  <div className="ve-cap-acts">
                    <TkxButton variant="outline" size="sm" disabled={!captionText.trim() || total < 0.2} onClick={autoCaption}>💬 Auto-caption</TkxButton>
                    <TkxButton variant="ghost" size="sm" onClick={() => srtRef.current?.click()}>Import .srt</TkxButton>
                    {overlays.length > 0 && <TkxButton variant="ghost" size="sm" onClick={() => void exportSrt()}>Export .srt</TkxButton>}
                    <input ref={srtRef} type="file" accept=".srt,text/plain" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importSrt(f); }} />
                  </div>
                </div>
                {imgs.map((im) => (
                  <div key={im.id} className="ve-ovl ve-img-ovl">
                    <img className="ve-img-thumb" src={im.url} alt={im.name} />
                    <span className="ve-img-name" title={im.name}>{im.name}</span>
                    <label>From<input type="number" min={0} max={Math.max(0, total)} step={0.5} value={im.startS} onChange={(e) => patchImage(im.id, { startS: Math.max(0, Number(e.target.value)) })} />s</label>
                    <label>to<input type="number" min={0} max={Math.max(0, Math.ceil(total))} step={0.5} value={im.endS} onChange={(e) => patchImage(im.id, { endS: Math.max(0, Number(e.target.value)) })} />s</label>
                    <TkxSelect size="sm" value={im.fx !== undefined ? 'custom' : im.pos} options={[{ value: 'top', label: 'Top' }, { value: 'middle', label: 'Middle' }, { value: 'bottom', label: 'Bottom' }, ...(im.fx !== undefined ? [{ value: 'custom', label: '✋ Dragged' }] : [])]} onChange={(v) => patchImage(im.id, { pos: v as OverlayPos, fx: undefined, fy: undefined })} />
                    <TkxSelect size="sm" value={String(im.sizeFrac)} options={IMG_SIZE_OPTIONS} onChange={(v) => patchImage(im.id, { sizeFrac: Number(v) })} />
                    <button className="ve-ovl-x" title="Remove image" onClick={() => removeImage(im.id)}>✕</button>
                  </div>
                ))}
                {overlays.map((o) => (
                  <div key={o.id} className="ve-ovl">
                    <input className="ve-ovl-text" type="text" value={o.text} placeholder="Write something…" onChange={(e) => patchOverlay(o.id, { text: e.target.value })} />
                    <label>From<input type="number" min={0} max={Math.max(0, total)} step={0.5} value={o.startS} onChange={(e) => patchOverlay(o.id, { startS: Math.max(0, Number(e.target.value)) })} />s</label>
                    <label>to<input type="number" min={0} max={Math.max(0, Math.ceil(total))} step={0.5} value={o.endS} onChange={(e) => patchOverlay(o.id, { endS: Math.max(0, Number(e.target.value)) })} />s</label>
                    <TkxSelect size="sm" value={o.fx !== undefined ? 'custom' : o.pos} options={[{ value: 'top', label: 'Top' }, { value: 'middle', label: 'Middle' }, { value: 'bottom', label: 'Bottom' }, ...(o.fx !== undefined ? [{ value: 'custom', label: '✋ Dragged' }] : [])]} onChange={(v) => patchOverlay(o.id, { pos: v as OverlayPos, fx: undefined, fy: undefined })} />
                    <TkxSelect size="sm" value={String(o.sizeFrac)} options={SIZE_OPTIONS} onChange={(v) => patchOverlay(o.id, { sizeFrac: Number(v) })} />
                    <input type="color" value={o.color} title="Text colour" onChange={(e) => patchOverlay(o.id, { color: e.target.value })} />
                    <button className="ve-ovl-x" title="Remove text" onClick={() => setOverlays((os) => os.filter((x) => x.id !== o.id))}>✕</button>
                  </div>
                ))}
              </div>

              <div className="ve-section">
                <div className="ve-section-head">
                  <strong>🎙️ Voice-over</strong>
                  {recSecs === null
                    ? <TkxButton variant="outline" size="sm" onClick={() => void startRec()} disabled={busy}>{voice ? '↻ Record again' : '● Record'}</TkxButton>
                    : <TkxButton variant="solid" colorScheme="primary" size="sm" onClick={() => void stopRec()}>■ Stop · {formatDuration(recSecs)}</TkxButton>}
                </div>
                {recSecs !== null && <span className="cmp-row-note ve-rec">● Recording… speak now, then press Stop.</span>}
                {voice && recSecs === null && (
                  <div className="ve-voice-row">
                    <span className="ve-voice-ok">✓ Voice-over added</span>
                    <label className="cmp-ctrl">Voice loudness
                      <TkxSelect size="sm" value={String(voiceVol)} options={[
                        { value: '1', label: '📢 Full' }, { value: '0.7', label: '🔊 Medium' }, { value: '0.4', label: '🔉 Soft' },
                      ]} onChange={(v) => setVoiceVol(Number(v))} />
                    </label>
                    <label className="cmp-ctrl">Lower other sounds
                      <TkxSelect size="sm" value={voiceDuck ? 'y' : 'n'} options={[
                        { value: 'y', label: 'Yes, duck under my voice' }, { value: 'n', label: 'No, keep them level' },
                      ]} onChange={(v) => setVoiceDuck(v === 'y')} />
                    </label>
                    <button className="ve-ovl-x" title="Remove voice-over" onClick={() => setVoice(null)}>✕</button>
                  </div>
                )}
              </div>

              <div className="cmp-controls">
                <label className="cmp-ctrl cmp-ctrl--wide">Made for
                  <TkxSelect size="sm" value={matchPreset(aspect, maxW)} options={[
                    ...PLATFORM_PRESETS.map((p) => ({ value: p.id, label: `${p.icon} ${p.label}` })),
                    ...(matchPreset(aspect, maxW) === 'custom' ? [{ value: 'custom', label: '⚙️ Custom' }] : []),
                  ]} onChange={(v) => { const p = platformPresetById(v as string); if (p) { setAspect(p.aspect); setMaxW(p.maxW); } }} />
                </label>
                <label className="cmp-ctrl">Sound
                  <TkxSelect size="sm" value={musicMode} options={[
                    { value: 'keep', label: 'Keep the videos’ sound' },
                    { value: 'mix', label: 'Add music on top' },
                    { value: 'replace', label: 'Music only' },
                  ]} onChange={(v) => setMusicMode(v as 'keep' | 'mix' | 'replace')} />
                </label>
                {musicMode !== 'keep' && (
                  <>
                    <TkxButton variant="outline" size="sm" onClick={() => musicRef.current?.click()}>{music ? `♫ ${music.name.slice(0, 16)}` : '♫ Choose music'}</TkxButton>
                    <input ref={musicRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setMusic(f); }} />
                    <label className="cmp-ctrl">Music loudness
                      <TkxSelect size="sm" value={String(musicVol)} options={[
                        { value: '0.3', label: '🔉 Soft (behind voices)' },
                        { value: '0.6', label: '🔊 Medium' },
                        { value: '1', label: '📢 Full' },
                      ]} onChange={(v) => setMusicVol(Number(v))} />
                    </label>
                  </>
                )}
                <label className="cmp-ctrl">Start &amp; end
                  <TkxSelect size="sm" value={fade ? 'fade' : 'none'} options={[
                    { value: 'none', label: 'Start instantly' },
                    { value: 'fade', label: '🌘 Smooth fade in and out' },
                  ]} onChange={(v) => setFade(v === 'fade')} />
                </label>
                {clips.length > 1 && (
                  <label className="cmp-ctrl">Between clips
                    <TkxSelect size="sm" value={transition ? 'cross' : 'cut'} options={[
                      { value: 'cut', label: 'Instant cut' },
                      { value: 'cross', label: '🎞️ Smooth crossfade' },
                    ]} onChange={(v) => setTransition(v === 'cross')} />
                  </label>
                )}
                <label className="cmp-ctrl">Shape
                  <TkxSelect size="sm" value={aspect} options={[
                    { value: 'source', label: 'Original' },
                    { value: '9:16', label: 'Short 9:16' },
                    { value: '1:1', label: 'Square 1:1' },
                    { value: '16:9', label: 'Wide 16:9' },
                  ]} onChange={(v) => setAspect(v as VideoAspect)} />
                </label>
                <label className="cmp-ctrl">Quality
                  <TkxSelect size="sm" value={String(maxW)} options={[
                    { value: '1920', label: '1080p' }, { value: '1280', label: '720p' }, { value: '854', label: '480p' },
                  ]} onChange={(v) => setMaxW(Number(v))} />
                </label>
              </div>
              <span className="cmp-row-note">{reel ? 'Reel' : 'Movie'} length: <strong>{formatDuration(total)}</strong>. Exports as an MP4 you can post or share on WhatsApp.{webCodecsSupported() ? '' : ' Export happens in real time, so it takes about as long as the video.'}</span>
            </>
          )}

          {err && <span className="cmp-row-note cmp-row-note--warn">{err}</span>}
          {busy && progress && <div className="cmp-total">{progress}</div>}
          {result && (
            <div className="vid-result">
              <video className="scan-video" src={result.url} controls />
              <span className="cmp-row-note">{result.name}</span>
            </div>
          )}
        </div>
        <div className="resume-foot">
          <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy || totalDuration(clips) < 0.1} onClick={() => void exportMovie()}>{busy ? 'Working…' : (reel ? '🎬 Make my reel' : '⤓ Make my movie')}</TkxButton>
          {selClip && !busy && <TkxButton variant="outline" size="sm" title="Save the current frame as a cover / thumbnail image" onClick={() => void saveCover()}>🖼️ Save cover</TkxButton>}
          {busy && <TkxButton variant="outline" size="sm" onClick={() => { stopRef.current = true; }}>Stop</TkxButton>}
          {result && canShareFiles && <TkxButton variant="solid" colorScheme="primary" size="sm" onClick={() => void shareResult()}>📤 Share</TkxButton>}
          {result && <TkxButton variant="outline" size="sm" onClick={() => void download()}>⤓ Download</TkxButton>}
          <TkxButton variant="ghost" size="sm" onClick={() => { stopRef.current = true; onClose(); }}>{t('act_close', lang)}</TkxButton>
        </div>
      </div>
    </div>
  );
}
