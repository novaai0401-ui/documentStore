/**
 * Memory video — turn a set of photos into a wedding/birthday-style slideshow
 * video, entirely on-device: each photo gets a gentle Ken Burns pan-zoom and
 * crossfades into the next, with optional captions, a title, and music, exported
 * as a shareable MP4. Upload → reorder → preview → share. The motion/timing
 * maths live in slideshow.ts (pure, tested) and the encode in slideshowEncode.ts;
 * this is the browser glue and UI. No upload, nothing leaves the device.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TkxButton, TkxInput, TkxSelect } from 'tekivex-ui';
import { t, useLang } from '../../i18n.js';
import { outputDims, type VideoAspect } from './video.js';
import { formatDuration } from './record.js';
import { PLATFORM_PRESETS, platformPresetById, matchPreset } from './platformPresets.js';
import { kenBurnsFor, scaleKenBurns, slideshowPlan, slideshowDuration, type SlideTransition } from './slideshow.js';
import { paintSlideFrame } from './slideshowEncode.js';
import { MEMORY_FRAMES } from './memoryFrames.js';
import { recordCanvasVideo, recorderExt, canRecordCanvas } from './canvasRecord.js';
import { startVoiceOver, type VoiceRecording } from './voiceOver.js';
import { MEMORY_THEMES, memoryThemeById } from './memoryThemes.js';
import { MUSIC_MOODS, generateMusic } from './musicGen.js';

interface LoadedPhoto { id: string; url: string; el: HTMLImageElement; name: string; caption: string }

const PREVIEW_FPS = 30;
const CROSS_SEC = 0.7;
let pid = 0;
const photoId = () => `mp${Date.now().toString(36)}${(pid++).toString(36)}`;

const PACE_OPTIONS = [
  { value: '3.5', label: '🐢 Slow · relaxed' },
  { value: '2.5', label: 'Medium' },
  { value: '1.8', label: '⚡ Fast · snappy' },
];

/** Bottom caption — stroke then fill so it reads on any photo. */
function drawCaption(ctx: CanvasRenderingContext2D, text: string, w: number, h: number) {
  const px = Math.max(14, Math.round(0.045 * h));
  ctx.font = `700 ${px}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, px / 8);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  const y = Math.round(h - px * 0.9);
  ctx.strokeText(text, w / 2, y); ctx.fillStyle = '#ffffff'; ctx.fillText(text, w / 2, y);
}

/** Centred title/date card (multi-line via \n), faded by `alpha`. */
function drawTitle(ctx: CanvasRenderingContext2D, text: string, w: number, h: number, alpha: number) {
  const px = Math.max(22, Math.round(0.072 * h));
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.font = `800 ${px}px Georgia, serif`; ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, px / 7);
  const lines = text.split('\n'); const n = lines.length;
  lines.forEach((ln, i) => {
    const y = h / 2 + (i - (n - 1) / 2) * px * 1.2;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.strokeText(ln, w / 2, y);
    ctx.fillStyle = '#ffffff'; ctx.fillText(ln, w / 2, y);
  });
  ctx.restore();
}

export function MemoryVideoModal({ onClose }: { onClose: () => void }) {
  const lang = useLang();
  const [photos, setPhotos] = useState<LoadedPhoto[]>([]);
  const [title, setTitle] = useState('');
  const [music, setMusic] = useState<File | null>(null);
  const [musicMood, setMusicMood] = useState<string | null>(null); // built-in mood id, or null (file/none)
  const [genBusy, setGenBusy] = useState(false);
  const [theme, setTheme] = useState('classic');
  const [perPhotoSec, setPerPhotoSec] = useState(2.5);
  const [transition, setTransition] = useState<SlideTransition>('cross');
  const [frame, setFrame] = useState('none'); // decorative photo frame (memoryFrames.ts)
  const [motion, setMotion] = useState('gentle'); // Ken Burns intensity: still | gentle | lively
  const [aspect, setAspect] = useState<VideoAspect>('9:16');
  const [maxW, setMaxW] = useState(1920);
  const [voice, setVoice] = useState<File | null>(null);
  const [recSecs, setRecSecs] = useState<number | null>(null); // null = not recording
  const recRef = useRef<VoiceRecording | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string; blob: Blob } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const musicRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const stopRef = useRef(false);
  const photosRef = useRef(photos); photosRef.current = photos;
  const titleRef = useRef(title); titleRef.current = title;

  useEffect(() => () => { for (const p of photosRef.current) URL.revokeObjectURL(p.url); }, []);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  const motionFactor = motion === 'still' ? 0 : motion === 'lively' ? 1.7 : 1;
  const kbs = useMemo(() => photos.map((_, i) => scaleKenBurns(kenBurnsFor(i), motionFactor)), [photos.length, motionFactor]);
  const previewPlan = useMemo(() => slideshowPlan({ photos: photos.length, perPhotoSec, fps: PREVIEW_FPS, transition, crossSec: CROSS_SEC }), [photos.length, perPhotoSec, transition]);
  const total = slideshowDuration(photos.length, perPhotoSec, transition, CROSS_SEC);
  const dims = useMemo(() => {
    const bw = photos[0]?.el.naturalWidth || 1080, bh = photos[0]?.el.naturalHeight || 1080;
    return outputDims(bw, bh, aspect, maxW);
  }, [photos, aspect, maxW]);

  const blockSec = perPhotoSec + (transition === 'cut' ? 0 : CROSS_SEC);
  /** Captions + title, drawn above the photos (shared by preview and export). */
  const drawTop = useCallback((ctx: CanvasRenderingContext2D, movieT: number, w: number, h: number) => {
    const list = photosRef.current;
    const idx = Math.max(0, Math.min(list.length - 1, Math.floor(movieT / blockSec)));
    const cap = list[idx]?.caption.trim();
    if (cap) drawCaption(ctx, cap, w, h);
    const ti = titleRef.current.trim();
    if (ti && movieT < blockSec) { const a = movieT > blockSec - 0.6 ? Math.max(0, (blockSec - movieT) / 0.6) : 1; drawTitle(ctx, ti, w, h, a); }
  }, [blockSec]);

  const addFiles = useCallback(async (files: File[]) => {
    setErr(null);
    for (const f of files) {
      if (!f.type.startsWith('image/')) { setErr('Please choose photos (PNG, JPG, HEIC…).'); continue; }
      const url = URL.createObjectURL(f);
      try {
        const el = await new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('bad')); im.src = url; });
        setPhotos((ps) => [...ps, { id: photoId(), url, el, name: f.name, caption: '' }]);
      } catch { URL.revokeObjectURL(url); setErr(`Couldn't read ${f.name} — is it a photo?`); }
    }
  }, []);
  const patchPhoto = (id: string, p: Partial<LoadedPhoto>) => setPhotos((ps) => ps.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const removePhoto = (id: string) => setPhotos((ps) => { const g = ps.find((x) => x.id === id); if (g) URL.revokeObjectURL(g.url); return ps.filter((x) => x.id !== id); });
  const movePhoto = (i: number, dir: -1 | 1) => setPhotos((ps) => { const j = i + dir; if (j < 0 || j >= ps.length) return ps; const n = ps.slice(); [n[i], n[j]] = [n[j]!, n[i]!]; return n; });

  // ── Built-in music (procedural, royalty-free) + themes ──
  const pickMood = useCallback(async (moodId: string) => {
    setErr(null); setMusicMood(moodId); setGenBusy(true);
    try { setMusic(await generateMusic(moodId)); }
    catch { setErr('Could not prepare the music.'); setMusicMood(null); }
    finally { setGenBusy(false); }
  }, []);
  const applyTheme = useCallback((id: string) => {
    const th = memoryThemeById(id); if (!th) return;
    setTheme(id); setTransition(th.transition); setPerPhotoSec(th.perPhotoSec);
    if (th.music) void pickMood(th.music); else { setMusic(null); setMusicMood(null); }
  }, [pickMood]);
  /** The value shown in the Music dropdown. */
  const musicValue = musicMood ?? (music ? 'file' : 'none');
  const onMusicChange = (v: string) => {
    if (v === 'none') { setMusic(null); setMusicMood(null); }
    else if (v === 'file') { setMusicMood(null); musicRef.current?.click(); }
    else void pickMood(v);
  };

  // ── Voice-over (narration) ──
  useEffect(() => {
    if (recSecs === null) return;
    const id = setInterval(() => setRecSecs((s) => (s === null ? s : s + 1)), 1000);
    return () => clearInterval(id);
  }, [recSecs === null]);
  useEffect(() => () => { recRef.current?.cancel(); }, []);
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

  // ── Live preview loop ──
  const drawAt = useCallback((movieT: number) => {
    const cv = canvasRef.current; if (!cv) return;
    const { w, h } = dims;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const ctx = cv.getContext('2d'); if (!ctx) return;
    if (!photosRef.current.length || !previewPlan.length) { ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, w, h); return; }
    const idx = Math.max(0, Math.min(previewPlan.length - 1, Math.floor(movieT * PREVIEW_FPS)));
    paintSlideFrame(ctx, previewPlan[idx]!, photosRef.current.map((p) => p.el), kbs, w, h, transition, frame);
    drawTop(ctx, movieT, w, h);
  }, [dims, kbs, previewPlan, transition, frame, drawTop]);

  useEffect(() => {
    if (!playing) { cancelAnimationFrame(rafRef.current); drawAt(0); return; }
    startRef.current = performance.now();
    const tick = () => {
      const elapsed = (performance.now() - startRef.current) / 1000;
      const loopT = total > 0 ? elapsed % total : 0;
      drawAt(loopT);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, drawAt, total]);
  // Redraw the first frame when the edit changes while paused.
  useEffect(() => { if (!playing) drawAt(0); }, [playing, drawAt]);

  // ── Export ──
  const exportVideo = useCallback(async () => {
    if (!photos.length) return;
    if (!canRecordCanvas()) { setErr('Making a memory video needs a newer browser (Chrome, Edge, or Safari 14.3+).'); return; }
    setPlaying(false); setBusy(true); setErr(null); setProgress('Preparing…'); stopRef.current = false;
    if (result) { URL.revokeObjectURL(result.url); setResult(null); }
    try {
      const { w, h } = dims;
      const plan = previewPlan;
      const els = photos.map((p) => p.el);
      // Real-time capture with mixed audio — reliable on iOS (WebCodecs there is
      // video-only, so a voice-over/music would silently vanish, and long HD
      // clips crash the tab back to a draft). See canvasRecord.ts.
      const blob = await recordCanvasVideo({
        w, h, fps: PREVIEW_FPS, durationSec: Math.max(1, total),
        draw: (ctx, t01) => {
          if (!plan.length) { ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, w, h); return; }
          const movieT = t01 * total;
          const idx = Math.max(0, Math.min(plan.length - 1, Math.floor(movieT * PREVIEW_FPS)));
          paintSlideFrame(ctx, plan[idx]!, els, kbs, w, h, transition, frame);
          drawTop(ctx, movieT, w, h);
        },
        audio: [
          ...(voice ? [{ file: voice, gain: 1, loop: false }] : []),
          ...(music ? [{ file: music, gain: voice ? 0.32 : 0.85, loop: true }] : []),
        ],
        onProgress: setProgress, shouldStop: () => stopRef.current,
      });
      setResult({ url: URL.createObjectURL(blob), name: `memory.${recorderExt(blob.type)}`, blob });
      setProgress(null);
    } catch (e) {
      if (!(stopRef.current || (e instanceof Error && e.message === '__cancelled__'))) setErr(e instanceof Error ? e.message : 'Could not make the video.');
      setProgress(null);
    } finally { setBusy(false); }
  }, [photos, dims, previewPlan, total, kbs, transition, frame, music, voice, drawTop, result]);

  // Use the already-made Blob directly (no `await fetch` first) so the user
  // gesture stays active — otherwise iOS Safari blocks navigator.share and the
  // <a download> fallback navigates the page to the blob instead of saving.
  const download = async () => { if (!result) return; const { saveBlob } = await import('../smart/util.js'); await saveBlob(result.name, result.blob); };
  const canShareFiles = (() => { try { return typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [new File([], 'x.mp4', { type: 'video/mp4' })] }); } catch { return false; } })();
  const shareResult = async () => {
    if (!result) return;
    try {
      const file = new File([result.blob], result.name, { type: result.blob.type || 'video/mp4' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'My memory video' });
      else await download();
    } catch (e) { if (!(e instanceof Error && e.name === 'AbortError')) setErr('Could not open the share sheet — use Download instead.'); }
  };

  const presetId = matchPreset(aspect, maxW);

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner cmp-modal vid-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>💝 Memory video</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <p className="studio-hint">Turn your photos into a video with gentle motion, smooth fades and music — perfect for weddings, birthdays and trips. Everything stays on your device.</p>

          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; if (fs.length) void addFiles(fs); }} />

          {photos.length === 0 ? (
            <div className="cmp-drop" onClick={() => fileRef.current?.click()} role="button" tabIndex={0}>
              <span className="cmp-drop-icon" aria-hidden>🖼️</span>
              <span>Add your photos (choose several at once), or <strong>browse</strong></span>
            </div>
          ) : (
            <>
              <div className="ve-preview">
                <canvas ref={canvasRef} className="ve-preview-canvas" onClick={() => setPlaying((p) => !p)} title="Tap to play / pause" />
                <button className="ve-preview-play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying((p) => !p)}>{playing ? '⏸' : '▶'}</button>
                <span className="ve-preview-tag">Preview · what you’ll get</span>
              </div>

              <TkxInput label="Title / date (optional — shows at the start)" value={title} placeholder="e.g. Aisha & Rohan · Nov 2026" onChange={(e) => setTitle(e.target.value)} />

              <div className="mv-photos" role="list" aria-label="Photos in order">
                {photos.map((p, i) => (
                  <div key={p.id} role="listitem" className="mv-photo">
                    <img className="mv-photo-thumb" src={p.url} alt={p.name} />
                    <span className="mv-photo-n">{i + 1}</span>
                    <input className="mv-photo-cap" type="text" value={p.caption} placeholder="Caption (optional)…" onChange={(e) => patchPhoto(p.id, { caption: e.target.value })} />
                    <span className="mv-photo-acts">
                      <button title="Move earlier" disabled={i === 0} onClick={() => movePhoto(i, -1)}>←</button>
                      <button title="Move later" disabled={i === photos.length - 1} onClick={() => movePhoto(i, 1)}>→</button>
                      <button title="Remove photo" onClick={() => removePhoto(p.id)}>✕</button>
                    </span>
                  </div>
                ))}
                <button className="ve-add" onClick={() => fileRef.current?.click()}>＋ Add photos</button>
              </div>

              <div className="cmp-controls">
                <label className="cmp-ctrl cmp-ctrl--wide">Theme
                  <TkxSelect size="sm" value={theme} options={MEMORY_THEMES.map((th) => ({ value: th.id, label: `${th.icon} ${th.label}` }))} onChange={(v) => applyTheme(v as string)} />
                </label>
                <label className="cmp-ctrl cmp-ctrl--wide">Made for
                  <TkxSelect size="sm" value={presetId} options={[
                    ...PLATFORM_PRESETS.map((p) => ({ value: p.id, label: `${p.icon} ${p.label}` })),
                    ...(presetId === 'custom' ? [{ value: 'custom', label: '⚙️ Custom' }] : []),
                  ]} onChange={(v) => { const p = platformPresetById(v as string); if (p) { setAspect(p.aspect); setMaxW(p.maxW); } }} />
                </label>
                <label className="cmp-ctrl cmp-ctrl--wide">Music {genBusy && <span className="mv-genning">preparing…</span>}
                  <TkxSelect size="sm" value={musicValue} options={[
                    { value: 'none', label: '🔇 No music' },
                    ...MUSIC_MOODS.map((m) => ({ value: m.id, label: `${m.icon} ${m.label}` })),
                    { value: 'file', label: music && !musicMood ? `♫ ${music.name.slice(0, 14)}` : '📁 My own file…' },
                  ]} onChange={(v) => onMusicChange(v as string)} />
                  <input ref={musicRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setMusic(f); setMusicMood(null); } }} />
                </label>
                <label className="cmp-ctrl">Time per photo
                  <TkxSelect size="sm" value={String(perPhotoSec)} options={PACE_OPTIONS} onChange={(v) => setPerPhotoSec(Number(v))} />
                </label>
                <label className="cmp-ctrl">Between photos
                  <TkxSelect size="sm" value={transition} options={[
                    { value: 'cross', label: '🎞️ Smooth fade' }, { value: 'slide', label: '➡️ Slide' }, { value: 'cut', label: 'Instant cut' },
                  ]} onChange={(v) => setTransition(v as SlideTransition)} />
                </label>
                <label className="cmp-ctrl">Photo frame
                  <TkxSelect size="sm" value={frame} options={MEMORY_FRAMES.map((fr) => ({ value: fr.id, label: `${fr.icon} ${fr.label}` }))} onChange={(v) => setFrame(v as string)} />
                </label>
                <label className="cmp-ctrl">Motion
                  <TkxSelect size="sm" value={motion} options={[
                    { value: 'still', label: '⏸️ Still' }, { value: 'gentle', label: '🌊 Gentle pan' }, { value: 'lively', label: '⚡ Lively zoom' },
                  ]} onChange={(v) => setMotion(v as string)} />
                </label>
              </div>

              <div className="ve-section">
                <div className="ve-section-head">
                  <strong>🎙️ Voice-over (optional)</strong>
                  {recSecs === null
                    ? <TkxButton variant="outline" size="sm" onClick={() => void startRec()} disabled={busy}>{voice ? '↻ Record again' : '● Record'}</TkxButton>
                    : <TkxButton variant="solid" colorScheme="primary" size="sm" onClick={() => void stopRec()}>■ Stop · {formatDuration(recSecs)}</TkxButton>}
                </div>
                {recSecs !== null && <span className="cmp-row-note ve-rec">● Recording… tell your story, then press Stop.</span>}
                {voice && recSecs === null && (
                  <div className="ve-voice-row">
                    <span className="ve-voice-ok">✓ Voice-over added — the music will duck under it.</span>
                    <button className="ve-ovl-x" title="Remove voice-over" onClick={() => setVoice(null)}>✕</button>
                  </div>
                )}
              </div>

              <span className="cmp-row-note">{photos.length} photo{photos.length === 1 ? '' : 's'} · about <strong>{formatDuration(total)}</strong> · exports as a shareable MP4.</span>
            </>
          )}

          {err && <span className="cmp-row-note cmp-row-note--warn">{err}</span>}
          {busy && progress && <div className="cmp-total">{progress}</div>}
          {result && (
            <div className="vid-result">
              <video className="scan-video" src={result.url} controls playsInline />
              <span className="cmp-row-note">{result.name}</span>
            </div>
          )}
        </div>
        <div className="resume-foot">
          <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy || photos.length < 1} onClick={() => void exportVideo()}>{busy ? 'Working…' : '💝 Make my memory video'}</TkxButton>
          {busy && <TkxButton variant="outline" size="sm" onClick={() => { stopRef.current = true; }}>Stop</TkxButton>}
          {result && canShareFiles && <TkxButton variant="solid" colorScheme="primary" size="sm" onClick={() => void shareResult()}>📤 Share</TkxButton>}
          {result && <TkxButton variant="outline" size="sm" onClick={() => void download()}>⤓ Download</TkxButton>}
          <TkxButton variant="ghost" size="sm" onClick={() => { stopRef.current = true; onClose(); }}>{t('act_close', lang)}</TkxButton>
        </div>
      </div>
    </div>
  );
}
