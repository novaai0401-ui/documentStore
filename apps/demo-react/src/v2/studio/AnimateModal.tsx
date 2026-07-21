/**
 * Animate modal — give the design a staggered entrance animation and export it,
 * entirely in the browser. Multi-page designs can render as a SEQUENCE OF
 * SCENES (each page animates in, holds, then crossfades or cuts to the next),
 * so a campaign becomes a real short video. Outputs:
 *   • GIF (no audio) — frames rasterized from the design's SVG, encoded with gifenc.
 *   • Video / WebM (with optional background music) — WebCodecs fast path, with a
 *     real-time MediaRecorder fallback.
 * Custom fonts are embedded so animated text matches the canvas. Nothing uploads.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TkxButton, TkxInput, TkxSelect } from 'tekivex-ui';
import { type Design } from './model.js';
import { rasterizeDesign } from './designRaster.js';
import { ANIM_PRESETS, frameDesign, progressSamples, type AnimPreset } from './animate.js';
import { scenePlan, planSeconds, type SceneTransition } from './scenes.js';
import { gifDelayCs, videoScale } from './video.js';
import { pickRecorderMime, extForMime, formatDuration } from './record.js';
import { webCodecsSupported, encodeAnimationWebM } from './animateEncode.js';
import { startVoiceOver, type VoiceRecording } from './voiceOver.js';
import { saveBlob } from '../smart/util.js';

export function AnimateModal({ design, pages, name, fontCss, defaultPreset, onClose }: { design: Design; pages?: Design[]; name: string; fontCss?: string; defaultPreset?: AnimPreset; onClose: () => void }) {
  const multi = (pages?.length ?? 0) > 1;
  const [preset, setPreset] = useState<AnimPreset>(defaultPreset ?? 'rise');
  const [format, setFormat] = useState<'gif' | 'apng' | 'video'>('gif');
  const [seconds, setSeconds] = useState(2);
  const [fps, setFps] = useState(15);
  const [scope, setScope] = useState<'one' | 'all'>(multi ? 'all' : 'one');
  const [transition, setTransition] = useState<SceneTransition>('cross');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioIsVoice, setAudioIsVoice] = useState(false);
  const [recSecs, setRecSecs] = useState<number | null>(null); // null = not recording
  const recRef = useRef<VoiceRecording | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string; kind: 'video' | 'image'; blob: Blob } | null>(null);
  const audioRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  // Share/download the already-made Blob directly (no `await fetch` first) so the
  // user gesture stays active — otherwise iOS Safari blocks navigator.share and
  // the <a download> fallback navigates the page to the blob. See saveBlob.
  const download = async () => { if (!result) return; await saveBlob(result.name, result.blob); };
  const canShareFiles = (() => { try { return typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [new File([], 'x.mp4', { type: 'video/mp4' })] }); } catch { return false; } })();
  const shareResult = async () => {
    if (!result) return;
    try {
      const file = new File([result.blob], result.name, { type: result.blob.type || 'application/octet-stream' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'My card' });
      else await download();
    } catch (e) { if (!(e instanceof Error && e.name === 'AbortError')) setErr('Could not open the share sheet — use Download instead.'); }
  };

  // Voice message → "talking card": the recorded narration becomes the sound.
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
    try { setAudioFile(await r.stop()); setAudioIsVoice(true); setFormat('video'); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Recording failed.'); }
  }, []);
  // Long encodes (many scenes × high fps) must be abandonable — checked between
  // frames by every export loop.
  const stopRef = useRef(false);
  const bail = () => { if (stopRef.current) throw new Error('__cancelled__'); };

  /** The scenes being exported: every page, or just the one on screen. */
  const sceneList = useMemo(() => (scope === 'all' && pages && pages.length > 1 ? pages : [design]), [scope, pages, design]);
  /** First scene sets the output dimensions (campaign pages share a format). */
  const baseD = sceneList[0] ?? design;

  /** Frame progress samples (entrance) + a brief hold on the finished design. */
  const frameProgress = useCallback(() => {
    const moving = Math.max(2, Math.min(1800, Math.round(seconds * fps)));
    const hold = Math.round(fps * 0.5);
    return [...progressSamples(moving), ...Array(hold).fill(1)] as number[];
  }, [seconds, fps]);

  /** Pre-render every frame — SVG → Image, plus composited canvases for the
   *  crossfade seams in multi-scene mode. Renders in parallel with a cache so
   *  hold frames (all progress 1) rasterize once per page, not once per frame. */
  // ~0.85 loops per second of clip, so motion speed feels consistent whatever
  // the chosen length. Matches the CSS-preview periods closely enough.
  const LOOP_RATE = 0.85;
  // Frames are composited at the export size (w×h): the SVG (rects/images/effect)
  // is drawn, then text is drawn natively — so text renders reliably everywhere
  // (iOS drops SVG <text> in <img> rasterization). See designRaster.ts.
  const renderFrames = useCallback(async (w: number, h: number): Promise<CanvasImageSource[]> => {
    if (sceneList.length === 1) {
      const samples = frameProgress();
      const cycles = Math.max(1, (seconds + 0.5) * LOOP_RATE);
      const n = samples.length;
      return Promise.all(samples.map((p, i) => rasterizeDesign(frameDesign(sceneList[0]!, p, preset, 0.4, (i / Math.max(1, n - 1)) * cycles), w, h, fontCss, (i / Math.max(1, n - 1)) * cycles)));
    }
    const plan = scenePlan({ pages: sceneList.length, fps, enterSec: seconds, holdSec: 1, transition, crossSec: 0.6 });
    const totalCycles = Math.max(1, (plan.length / fps) * LOOP_RATE);
    const cache = new Map<string, Promise<HTMLCanvasElement>>();
    // Motion phase is keyed to the plan-frame index so it advances smoothly
    // across scenes; entrance progress `g` stays per-scene.
    const img = (p: number, g: number, phase: number) => {
      const k = `${p}:${g.toFixed(5)}:${phase.toFixed(4)}`;
      let v = cache.get(k);
      if (!v) { v = rasterizeDesign(frameDesign(sceneList[p]!, g, preset, 0.4, phase), w, h, fontCss, phase); cache.set(k, v); }
      return v;
    };
    return Promise.all(plan.map(async (f, fi): Promise<CanvasImageSource> => {
      const phase = (fi / Math.max(1, plan.length - 1)) * totalCycles;
      if (f.kind === 'page') return img(f.page, f.progress, phase);
      const [a, b] = await Promise.all([img(f.from, 1, phase), img(f.to, 0, phase)]);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const cx = c.getContext('2d')!;
      const W = c.width, H = c.height, m = f.mix;
      // Compose the seam according to the chosen hand-over style.
      if (transition === 'slide') {
        // Outgoing pushes off to the left while the next scene rides in.
        cx.drawImage(a, -Math.round(m * W), 0, W, H);
        cx.drawImage(b, Math.round((1 - m) * W), 0, W, H);
      } else if (transition === 'wipe') {
        cx.drawImage(a, 0, 0, W, H);
        cx.save(); cx.beginPath(); cx.rect(0, 0, Math.round(m * W), H); cx.clip();
        cx.drawImage(b, 0, 0, W, H); cx.restore();
      } else if (transition === 'zoom') {
        // Outgoing grows past the camera while the next scene fades up.
        const s = 1 + 0.25 * m;
        cx.drawImage(a, (W - W * s) / 2, (H - H * s) / 2, W * s, H * s);
        cx.globalAlpha = m; cx.drawImage(b, 0, 0, W, H); cx.globalAlpha = 1;
      } else {
        cx.drawImage(a, 0, 0, W, H);
        cx.globalAlpha = m; cx.drawImage(b, 0, 0, W, H); cx.globalAlpha = 1;
      }
      return c;
    }));
  }, [sceneList, baseD, preset, fontCss, frameProgress, fps, seconds, transition]);

  /** Estimated clip length shown in the UI (mirrors the export plan). */
  const estSeconds = sceneList.length === 1
    ? seconds + 0.5
    : planSeconds(scenePlan({ pages: sceneList.length, fps, enterSec: seconds, holdSec: 1, transition, crossSec: 0.6 }).length, fps);

  const exportGif = useCallback(async () => {
    const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
    const { w, h } = videoScale(baseD.w, baseD.h, 640);
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    setProgress('Preparing frames…');
    const frames = await renderFrames(w, h);
    const delay = gifDelayCs(fps);
    const gif = GIFEncoder();
    for (let i = 0; i < frames.length; i++) {
      bail();
      ctx.clearRect(0, 0, w, h); ctx.drawImage(frames[i]!, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      const palette = quantize(data, 256);
      gif.writeFrame(applyPalette(data, palette), w, h, { palette, delay });
      if (i % 4 === 0 || i === frames.length - 1) setProgress(`Encoding ${i + 1} / ${frames.length}`);
    }
    gif.finish();
    { const blob = new Blob([gif.bytes() as unknown as BlobPart], { type: 'image/gif' }); setResult({ url: URL.createObjectURL(blob), name: `${name || 'design'}.gif`, kind: 'image', blob }); }
  }, [baseD, name, fps, renderFrames]);

  // Animated PNG — our own byte-verified encoder; sharp 24-bit colour, no sound.
  const exportApng = useCallback(async () => {
    const { w, h } = videoScale(baseD.w, baseD.h, 640);
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    setProgress('Preparing frames…');
    const imgs = await renderFrames(w, h);
    const delayMs = Math.round(1000 / fps);
    const apngFrames = imgs.map((img) => {
      bail();
      ctx.clearRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
      return { rgba: new Uint8Array(ctx.getImageData(0, 0, w, h).data), delayMs };
    });
    const { encodeApng } = await import('./apng.js');
    setProgress('Encoding…');
    { const blob = new Blob([encodeApng(w, h, apngFrames) as unknown as BlobPart], { type: 'image/png' }); setResult({ url: URL.createObjectURL(blob), name: `${name || 'design'}-animated.png`, kind: 'image', blob }); }
  }, [baseD, name, fps, renderFrames]);

  const exportVideo = useCallback(async () => {
    const { w, h } = videoScale(baseD.w, baseD.h, 720);
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    // Pre-render every frame in parallel so real-time recording isn't preceded by
    // a slow one-by-one rasterizing pass.
    setProgress('Preparing frames…');
    const frames = await renderFrames(w, h);

    // Fast path: WebCodecs encodes as fast as the CPU allows (not real time),
    // muxing video + music into WebM. Falls back to MediaRecorder if unavailable
    // or if anything throws.
    if (webCodecsSupported()) {
      try {
        const blob = await encodeAnimationWebM({ frames, w, h, fps, audioFile, onProgress: setProgress, shouldStop: () => stopRef.current });
        setResult({ url: URL.createObjectURL(blob), name: `${name || 'design'}.${extForMime(blob.type)}`, kind: 'video', blob });
        return;
      } catch (e) {
        if (stopRef.current || (e instanceof Error && e.message === '__cancelled__')) throw new Error('__cancelled__');
        setProgress('Falling back to real-time recording…');
      }
    }
    bail();
    ctx.drawImage(frames[0]!, 0, 0, w, h);

    // Capture the canvas; mix in music if provided.
    const stream = canvas.captureStream(fps);
    let actx: AudioContext | null = null;
    let audioEl: HTMLAudioElement | null = null;
    if (audioFile) {
      actx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      await actx.resume();
      const dest = actx.createMediaStreamDestination();
      audioEl = new Audio(URL.createObjectURL(audioFile));
      audioEl.loop = true;
      actx.createMediaElementSource(audioEl).connect(dest);
      for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);
    }

    const mime = pickRecorderMime((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

    const frameMs = 1000 / fps;
    const totalMs = frames.length * frameMs;
    setProgress(`Recording… ${(totalMs / 1000).toFixed(1)}s`);
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      rec.start();
      audioEl?.play().catch(() => { /* autoplay guard — silent video still records */ });
      const start = performance.now();
      let raf = 0;
      const tick = (now: number) => {
        const t = now - start;
        if (t >= totalMs || stopRef.current) { try { rec.stop(); } catch { /* */ } audioEl?.pause(); cancelAnimationFrame(raf); return; }
        const idx = Math.min(frames.length - 1, Math.floor(t / frameMs));
        ctx.drawImage(frames[idx]!, 0, 0, w, h);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    actx?.close().catch(() => { /* */ });
    bail();
    const blob = new Blob(chunks, { type: mime || 'video/webm' });
    setResult({ url: URL.createObjectURL(blob), name: `${name || 'design'}.${extForMime(mime)}`, kind: 'video', blob });
  }, [baseD, name, fps, audioFile, renderFrames]);

  const run = useCallback(async () => {
    setBusy(true); setErr(null); stopRef.current = false;
    if (result) { URL.revokeObjectURL(result.url); setResult(null); }
    try { await (format === 'gif' ? exportGif() : format === 'apng' ? exportApng() : exportVideo()); }
    catch (e) {
      if (!(e instanceof Error && e.message === '__cancelled__')) setErr(e instanceof Error ? e.message : 'Export failed.');
    }
    finally { setBusy(false); setProgress(null); }
  }, [format, exportGif, exportApng, exportVideo, result]);

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner cmp-modal vid-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>🎬 Animate design</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <p className="studio-hint">
            {multi
              ? 'Turn your pages into a short video: each page animates in, holds, then flows into the next. Export as a GIF, a sharp Animated PNG, or a video with background music. Rendered on your device; nothing is uploaded.'
              : 'Give every element a staggered entrance and export it — as a GIF, a sharp Animated PNG, or a video with background music. Rendered on your device; nothing is uploaded.'}
          </p>
          <div className="studio-prop-grid">
            <TkxSelect label="Animation" isDisabled={busy} value={preset} options={ANIM_PRESETS.map((p) => ({ value: p.id, label: p.label }))} onChange={(val) => setPreset(val as AnimPreset)} />
            <TkxSelect label="Export as" isDisabled={busy} value={format} options={[{ value: 'gif', label: 'GIF (small, no sound)' }, { value: 'apng', label: 'Animated PNG (sharp, no sound)' }, { value: 'video', label: '🎬 Video / talking card (MP4)' }]} onChange={(val) => setFormat(val as 'gif' | 'apng' | 'video')} />
            <TkxInput label={multi && scope === 'all' ? 'Seconds per scene' : 'Seconds'} type="number" min={1} max={60} step={0.5} disabled={busy} value={seconds} onChange={(e) => setSeconds(Math.max(1, Math.min(60, Number(e.target.value))))} />
            <TkxInput label="FPS" type="number" min={8} max={24} disabled={busy} value={fps} onChange={(e) => setFps(Math.max(8, Math.min(24, Number(e.target.value))))} />
            {multi && (
              <TkxSelect label="Scenes" isDisabled={busy} value={scope} options={[
                { value: 'all', label: `All ${pages!.length} pages, one video` },
                { value: 'one', label: 'Just this page' },
              ]} onChange={(val) => setScope(val as 'one' | 'all')} />
            )}
            {multi && scope === 'all' && (
              <TkxSelect label="Between scenes" isDisabled={busy} value={transition} options={[
                { value: 'cross', label: '🌫️ Smooth fade' },
                { value: 'slide', label: '➡️ Slide' },
                { value: 'wipe', label: '🧹 Wipe' },
                { value: 'zoom', label: '🔍 Zoom through' },
                { value: 'cut', label: 'Instant cut' },
              ]} onChange={(val) => setTransition(val as SceneTransition)} />
            )}
          </div>
          <p className="cmp-row-note">{sceneList.length > 1 ? `${sceneList.length} scenes · about ${estSeconds.toFixed(1)}s total` : `About ${estSeconds.toFixed(1)}s`}</p>

          {format === 'video' && (
            <div className="anim-music">
              {recSecs === null
                ? <TkxButton variant="outline" size="sm" onClick={() => void startRec()} disabled={busy}>{audioIsVoice ? '↻ Re-record voice' : '🎙️ Record voice message'}</TkxButton>
                : <TkxButton variant="solid" colorScheme="primary" size="sm" onClick={() => void stopRec()}>■ Stop · {formatDuration(recSecs)}</TkxButton>}
              <TkxButton variant="outline" size="sm" onClick={() => audioRef.current?.click()}>{audioFile && !audioIsVoice ? '♫ Change music' : '♫ Add music'}</TkxButton>
              {audioFile && <><span className="anim-music-name">{audioIsVoice ? '🎙️ Your voice message' : audioFile.name}</span><button className="brand-link" onClick={() => { setAudioFile(null); setAudioIsVoice(false); }}>Remove</button></>}
              <input ref={audioRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setAudioFile(f); setAudioIsVoice(false); } }} />
              {recSecs !== null
                ? <p className="cmp-row-note ve-rec" style={{ width: '100%', margin: 0 }}>● Recording… say your message, then press Stop.</p>
                : <p className="cmp-row-note" style={{ width: '100%', margin: 0 }}>🎬 Record a voice message to make a <strong>talking card</strong>, or add music. Exports as a shareable MP4 on modern browsers.</p>}
            </div>
          )}

          {err && <span className="cmp-row-note cmp-row-note--warn">{err}</span>}
          {progress && <div className="cmp-total">{progress}</div>}
          {result && (
            <div className="vid-result">
              {result.kind === 'video'
                ? <video className="scan-video" src={result.url} controls playsInline autoPlay loop muted />
                : <img className="scan-video" src={result.url} alt="animated result" />}
              <span className="cmp-row-note">✅ Ready — {result.name}. Use <strong>Share</strong> or <strong>Download</strong> below.</span>
            </div>
          )}
        </div>
        <div className="resume-foot">
          <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy} onClick={() => void run()}>{busy ? 'Working…' : result ? '↻ Make again' : (format === 'gif' ? '✨ Make GIF' : format === 'apng' ? '✨ Make PNG' : '✨ Make video')}</TkxButton>
          {busy && <TkxButton variant="outline" size="sm" onClick={() => { stopRef.current = true; }}>Stop</TkxButton>}
          {result && canShareFiles && <TkxButton variant="solid" colorScheme="primary" size="sm" onClick={() => void shareResult()}>📤 Share</TkxButton>}
          {result && <TkxButton variant="outline" size="sm" onClick={() => void download()}>⤓ Download</TkxButton>}
          <TkxButton variant="ghost" size="sm" onClick={() => { stopRef.current = true; onClose(); }}>Close</TkxButton>
        </div>
      </div>
    </div>
  );
}
