/**
 * Greeting video maker — the easy way to make an animated wish: pick the
 * occasion, type a name, (optionally) add a photo and record a voice message,
 * and get a shareable MP4 with a fun animation (a gift box that opens, hearts
 * that float, a trophy that rises…). Deliberately simple — three steps, big
 * choices, live preview — for people new to the tool. All on-device.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TkxButton, TkxInput, TkxSelect } from 'tekivex-ui';
import { t, useLang } from '../../i18n.js';
import { outputDims, type VideoAspect } from './video.js';
import { formatDuration } from './record.js';
import { MUSIC_MOODS, generateMusic } from './musicGen.js';
import { startVoiceOver, type VoiceRecording } from './voiceOver.js';
import { OCCASION_ANIMS, occasionAnimById, paintGreetingFrame, preloadSacred } from './occasionAnim.js';
import { recordCanvasVideo, recorderExt, canRecordCanvas } from './canvasRecord.js';
import { shareToWhatsApp } from './whatsapp.js';

const PREVIEW_FPS = 30;

export function GreetingVideoModal({ onClose, initialOccasion }: { onClose: () => void; initialOccasion?: string }) {
  const lang = useLang();
  const [occId, setOccId] = useState(initialOccasion && occasionAnimById(initialOccasion).id === initialOccasion ? initialOccasion : 'birthday');
  const occ = occasionAnimById(occId);
  const [wish, setWish] = useState(occ.wish);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState(6);
  const [aspect, setAspect] = useState<VideoAspect>('9:16');
  const [maxW, setMaxW] = useState(1920);
  const [music, setMusic] = useState<File | null>(null);
  const [musicMood, setMusicMood] = useState<string | null>('celebration');
  const [genBusy, setGenBusy] = useState(false);
  const [voice, setVoice] = useState<File | null>(null);
  const [recSecs, setRecSecs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string; blob: Blob } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);

  const photoRef = useRef<HTMLInputElement | null>(null);
  const musicRef = useRef<HTMLInputElement | null>(null);
  const recRef = useRef<VoiceRecording | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const stopRef = useRef(false);

  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);
  useEffect(() => () => { recRef.current?.cancel(); }, []);
  // When the occasion changes, adopt its default wish if the user hasn't typed one.
  const pickOccasion = (id: string) => { setOccId(id); const o = occasionAnimById(id); setWish((w) => (OCCASION_ANIMS.some((x) => x.wish === w) || !w.trim() ? o.wish : w)); };

  const dims = useMemo(() => outputDims(1080, 1920, aspect, maxW), [aspect, maxW]);
  const content = useMemo(() => ({ wish, name, message, photo }), [wish, name, message, photo]);

  // ── Built-in music ──
  const pickMood = useCallback(async (moodId: string) => {
    setErr(null); setMusicMood(moodId); setGenBusy(true);
    try { setMusic(await generateMusic(moodId)); } catch { setErr('Could not prepare the music.'); setMusicMood(null); } finally { setGenBusy(false); }
  }, []);
  // Generate the default mood's track once on open.
  useEffect(() => { if (musicMood && !music) void pickMood(musicMood); /* eslint-disable-next-line */ }, []);
  const musicValue = musicMood ?? (music ? 'file' : 'none');
  const onMusicChange = (v: string) => {
    if (v === 'none') { setMusic(null); setMusicMood(null); }
    else if (v === 'file') { setMusicMood(null); musicRef.current?.click(); }
    else void pickMood(v);
  };

  const addPhoto = async (file: File) => {
    if (!file.type.startsWith('image/')) { setErr('Please choose a photo.'); return; }
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    const url = URL.createObjectURL(file);
    try { const el = await new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('bad')); im.src = url; }); setPhoto(el); setPhotoUrl(url); }
    catch { URL.revokeObjectURL(url); setErr('Could not read that photo.'); }
  };
  const removePhoto = () => { if (photoUrl) URL.revokeObjectURL(photoUrl); setPhoto(null); setPhotoUrl(null); };

  // ── Voice message ──
  useEffect(() => {
    if (recSecs === null) return;
    const id = setInterval(() => setRecSecs((s) => (s === null ? s : s + 1)), 1000);
    return () => clearInterval(id);
  }, [recSecs === null]);
  const startRec = useCallback(async () => {
    setErr(null);
    try { recRef.current = await startVoiceOver(); setRecSecs(0); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not start the microphone.'); }
  }, []);
  const stopRec = useCallback(async () => {
    const r = recRef.current; if (!r) return;
    recRef.current = null; setRecSecs(null);
    try {
      const f = await r.stop(); setVoice(f);
      // Make the video long enough to play the WHOLE message (a recorded voice
      // easily exceeds the default 6s), so it isn't cut off in the export.
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ac = new AC(); const buf = await ac.decodeAudioData(await f.arrayBuffer()); await ac.close().catch(() => { /* */ });
        setDurationSec((d) => Math.max(d, Math.min(60, Math.ceil(buf.duration + 0.4))));
      } catch { setDurationSec((d) => Math.max(d, 6)); }
    } catch (e) { setErr(e instanceof Error ? e.message : 'Recording failed.'); }
  }, []);

  // ── Live preview ──
  const drawAt = useCallback((tt: number) => {
    const cv = canvasRef.current; if (!cv) return;
    const { w, h } = dims;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const ctx = cv.getContext('2d'); if (!ctx) return;
    paintGreetingFrame(ctx, occ, tt, w, h, content);
  }, [dims, occ, content]);
  useEffect(() => {
    if (!playing) { cancelAnimationFrame(rafRef.current); drawAt(0.6); return; }
    startRef.current = performance.now();
    const tick = () => { drawAt(((performance.now() - startRef.current) / 1000 / durationSec) % 1); rafRef.current = requestAnimationFrame(tick); };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, drawAt, durationSec]);
  useEffect(() => { if (!playing) drawAt(0.6); }, [playing, drawAt]);
  // Devotional occasions feature a real deity painting: load it before drawing
  // so the very first frame (and every export frame) already has it.
  const [sacredReady, setSacredReady] = useState(0);
  useEffect(() => {
    if (!occ.sacred) return;
    let alive = true;
    void preloadSacred(occ.sacred).then(() => { if (alive) setSacredReady((n) => n + 1); });
    return () => { alive = false; };
  }, [occ.sacred]);
  useEffect(() => { if (sacredReady && !playing) drawAt(0.6); }, [sacredReady, playing, drawAt]);

  // ── Export ──
  // Record the live animation in real time (MediaRecorder + captureStream) with
  // the voice + music mixed straight into the stream. This is the reliable path
  // on phones — iOS Safari plays the resulting mp4 with sound, it uses little
  // memory (no tab crash → no "kicked back to a draft"), and the voice can't get
  // lost because it's part of one mixed audio track. See canvasRecord.ts.
  const makeVideo = useCallback(async () => {
    if (!canRecordCanvas()) { setErr('Making a video needs a newer browser (Chrome, Edge, or Safari 14.3+).'); return; }
    setPlaying(false); setBusy(true); setErr(null); setProgress('Preparing…'); stopRef.current = false;
    if (result) { URL.revokeObjectURL(result.url); setResult(null); }
    try {
      const { w, h } = dims;
      const blob = await recordCanvasVideo({
        w, h, fps: PREVIEW_FPS, durationSec,
        draw: (c, t01) => paintGreetingFrame(c, occ, t01, w, h, content),
        audio: [
          ...(voice ? [{ file: voice, gain: 1, loop: false }] : []),
          ...(music ? [{ file: music, gain: voice ? 0.32 : 0.85, loop: true }] : []),
        ],
        onProgress: setProgress, shouldStop: () => stopRef.current,
      });
      setResult({ url: URL.createObjectURL(blob), name: `${occ.id}-wish.${recorderExt(blob.type)}`, blob });
      setProgress(null);
    } catch (e) {
      if (!(stopRef.current || (e instanceof Error && e.message === '__cancelled__'))) setErr(e instanceof Error ? e.message : 'Could not make the video.');
      setProgress(null);
    } finally { setBusy(false); }
  }, [occ, content, durationSec, dims, music, voice, result]);

  // Use the already-encoded Blob directly (no `await fetch` first) so the user
  // gesture is still active when the share sheet / download fires — on iOS Safari
  // a lost gesture makes navigator.share throw and the <a download> fallback then
  // NAVIGATES the page to the blob (looks like "it opened the image and left the
  // app") instead of saving. See saveBlob in smart/util.ts.
  const download = async () => { if (!result) return; const { saveBlob } = await import('../smart/util.js'); await saveBlob(result.name, result.blob); };
  const canShareFiles = (() => { try { return typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [new File([], 'x.mp4', { type: 'video/mp4' })] }); } catch { return false; } })();
  const shareResult = async () => {
    if (!result) return;
    try {
      const file = new File([result.blob], result.name, { type: result.blob.type || 'video/mp4' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'My wish' });
      else await download();
    } catch (e) { if (!(e instanceof Error && e.name === 'AbortError')) setErr('Could not open the share sheet — use Download instead.'); }
  };
  const shareWhatsApp = async () => {
    if (!result) return;
    const file = new File([result.blob], result.name, { type: result.blob.type || 'video/mp4' });
    const r = await shareToWhatsApp({ file, text: `${wish} 🎉` });
    if (r === 'downloaded') setErr('Wish saved — attach it in WhatsApp to send.');
    else if (r === 'failed') setErr('Could not open WhatsApp — use Download instead.');
  };

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner cmp-modal vid-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>🎁 Animated wish</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <p className="studio-hint">Make a fun animated greeting video in 3 easy steps. Pick the occasion, add a name (and a photo or voice message if you like), then Make &amp; Share. Everything stays on your device.</p>

          <div className="gv-step">1 · Choose the occasion</div>
          <div className="gv-occasions" role="group" aria-label="Occasion">
            {OCCASION_ANIMS.map((o) => (
              <button key={o.id} className={`gv-occ${o.id === occId ? ' is-on' : ''}`} onClick={() => pickOccasion(o.id)}>
                <span className="gv-occ-emoji" aria-hidden>{o.icon}</span>
                <span className="gv-occ-label">{o.label}</span>
              </button>
            ))}
          </div>

          <div className="gv-step">2 · Preview</div>
          <div className="ve-preview">
            <canvas ref={canvasRef} className="ve-preview-canvas" onClick={() => setPlaying((p) => !p)} title="Tap to play / pause" />
            <button className="ve-preview-play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying((p) => !p)}>{playing ? '⏸' : '▶'}</button>
          </div>

          <div className="gv-step">3 · Personalise</div>
          <TkxInput label="Wish" value={wish} onChange={(e) => setWish(e.target.value)} />
          <TkxInput label="To (name)" value={name} placeholder="e.g. Aisha" onChange={(e) => setName(e.target.value)} />
          <TkxInput label="Short message (optional)" value={message} placeholder="e.g. Have a wonderful day!" onChange={(e) => setMessage(e.target.value)} />

          <div className="cmp-controls">
            <label className="cmp-ctrl">Photo (optional)
              <span className="mv-music">
                <TkxButton variant="outline" size="sm" onClick={() => photoRef.current?.click()}>{photo ? '🖼️ Change' : '🖼️ Add photo'}</TkxButton>
                {photo && <button className="ve-ovl-x" title="Remove photo" onClick={removePhoto}>✕</button>}
              </span>
              <input ref={photoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void addPhoto(f); }} />
            </label>
            <label className="cmp-ctrl cmp-ctrl--wide">Music {genBusy && <span className="mv-genning">preparing…</span>}
              <TkxSelect size="sm" value={musicValue} options={[
                { value: 'none', label: '🔇 No music' },
                ...MUSIC_MOODS.map((m) => ({ value: m.id, label: `${m.icon} ${m.label}` })),
                { value: 'file', label: music && !musicMood ? `♫ ${music.name.slice(0, 12)}` : '📁 My file…' },
              ]} onChange={(v) => onMusicChange(v as string)} />
              <input ref={musicRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setMusic(f); setMusicMood(null); } }} />
            </label>
            <label className="cmp-ctrl">Length
              <TkxSelect size="sm" value={String(durationSec)} options={[{ value: '5', label: 'Short · 5s' }, { value: '8', label: 'Medium · 8s' }, { value: '12', label: 'Long · 12s' }]} onChange={(v) => setDurationSec(Number(v))} />
            </label>
            <label className="cmp-ctrl">Shape
              <TkxSelect size="sm" value={aspect} options={[{ value: '9:16', label: '📱 Vertical' }, { value: '1:1', label: '⬛ Square' }, { value: '16:9', label: '🖥️ Wide' }]} onChange={(v) => { setAspect(v as VideoAspect); setMaxW(v === '1:1' ? 1080 : 1920); }} />
            </label>
          </div>

          <div className="ve-section">
            <div className="ve-section-head">
              <strong>🎙️ Voice message (optional)</strong>
              {recSecs === null
                ? <TkxButton variant="outline" size="sm" onClick={() => void startRec()} disabled={busy}>{voice ? '↻ Record again' : '● Record'}</TkxButton>
                : <TkxButton variant="solid" colorScheme="primary" size="sm" onClick={() => void stopRec()}>■ Stop · {formatDuration(recSecs)}</TkxButton>}
            </div>
            {recSecs !== null
              ? <span className="cmp-row-note ve-rec">● Recording… say your message, then press Stop.</span>
              : voice && <div className="ve-voice-row"><span className="ve-voice-ok">✓ Voice message added</span><button className="ve-ovl-x" title="Remove" onClick={() => setVoice(null)}>✕</button></div>}
          </div>

          {err && <span className="cmp-row-note cmp-row-note--warn">{err}</span>}
          {busy && progress && <div className="cmp-total">{progress}</div>}
          {result && (
            <div className="vid-result">
              {/* NOT muted and NOT autoplaying — the whole point is to hear the
                  voice/music. Shows the first frame with a play button; tap to play. */}
              <video className="scan-video" src={result.url} controls playsInline loop preload="auto" />
              <span className="cmp-row-note">✅ Ready! Use <strong>Share</strong> or <strong>Download</strong> below.</span>
            </div>
          )}
        </div>
        <div className="resume-foot">
          <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy} onClick={() => void makeVideo()}>{busy ? 'Working…' : result ? '↻ Make again' : '🎬 Make my wish'}</TkxButton>
          {busy && <TkxButton variant="outline" size="sm" onClick={() => { stopRef.current = true; }}>Stop</TkxButton>}
          {result && <TkxButton variant="solid" size="sm" className="wa-btn" onClick={() => void shareWhatsApp()}>📲 WhatsApp</TkxButton>}
          {result && canShareFiles && <TkxButton variant="solid" colorScheme="primary" size="sm" onClick={() => void shareResult()}>📤 Share</TkxButton>}
          {result && <TkxButton variant="outline" size="sm" onClick={() => void download()}>⤓ Download</TkxButton>}
          <TkxButton variant="ghost" size="sm" onClick={() => { stopRef.current = true; onClose(); }}>{t('act_close', lang)}</TkxButton>
        </div>
      </div>
    </div>
  );
}
