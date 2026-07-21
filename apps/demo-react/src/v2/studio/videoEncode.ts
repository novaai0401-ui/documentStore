/**
 * Frame-accurate movie export for the video editor via WebCodecs + webm-muxer.
 * Unlike the MediaRecorder path (real-time capture, so loading gaps and recorder
 * slack stretch the file), this SEEKS each source clip to every output frame's
 * midpoint and encodes with exact timestamps — the movie's length is exactly
 * frameCount/fps. Audio is mixed sample-exactly with an OfflineAudioContext
 * (clip sound at each clip's offset, music looped over the top) and encoded to
 * Opus. Timeline maths live in videoEdit.ts (pure, tested); this is browser glue.
 */
import { frameTimestampsUs, even, pickMuxProfile } from './animateEncode.js';
import { clipLength, clipSourceAt, clipSpeed, clipStarts, clipVolume, frameSourceTimes, seamBlend, type EditClip } from './videoEdit.js';

export interface TimelineClipSource extends EditClip {
  /** Element already loaded with the clip (metadata ready, not attached to DOM). */
  el: HTMLVideoElement;
  /** Original file — decoded for the audio mix. */
  file: File;
  w: number;
  h: number;
}

export interface TimelineEncodeOpts {
  clips: TimelineClipSource[];
  w: number;
  h: number;
  fps: number;
  musicFile?: File | null;
  musicMode: 'keep' | 'mix' | 'replace';
  /** Music level 0…1 in the final mix (default 1). */
  musicVolume?: number;
  /** A recorded narration track laid over the movie (see voiceOver.ts). */
  voiceFile?: File | null;
  /** Voice-over level 0…1 (default 1). */
  voiceVolume?: number;
  /** Where the narration starts on the movie timeline, seconds (default 0). */
  voiceStartS?: number;
  /** When a voice-over is present, scale the clips' + music level by this
   *  (0…1) so the narration sits on top. 1 = no ducking (default). */
  voiceDuck?: number;
  /** Fade the movie's sound in/out over this many seconds (default 0 = off). */
  fadeSec?: number;
  /** Crossfade between clips over this many seconds (default 0 = hard cut). */
  transitionSec?: number;
  /** Paints ONE clip's current frame (cover-crop + look) at the given opacity. */
  drawClip: (ctx: CanvasRenderingContext2D, clip: TimelineClipSource, alpha: number, w: number, h: number) => void;
  /** Paints everything above the footage (text overlays, fade-to-black). */
  drawTop: (ctx: CanvasRenderingContext2D, movieT: number, w: number, h: number) => void;
  onProgress?: (msg: string) => void;
  shouldStop?: () => boolean;
}

const AUDIO_SR = 48000;

const seekExact = (v: HTMLVideoElement, t: number) => new Promise<void>((resolve) => {
  const on = () => { v.removeEventListener('seeked', on); resolve(); };
  v.addEventListener('seeked', on);
  v.currentTime = t;
  if (!v.seeking) { v.removeEventListener('seeked', on); resolve(); }
});

/** Mix the timeline's audio into one buffer of exactly `totalSec` seconds.
 *  Returns undefined when nothing is audible (no track is added then). */
interface VoiceMix { file?: File | null; volume?: number; startS?: number; duck?: number }

async function renderTimelineAudio(
  clips: TimelineClipSource[], musicFile: File | null | undefined, musicMode: 'keep' | 'mix' | 'replace', totalSec: number,
  musicVolume = 1, fadeSec = 0, voice: VoiceMix = {},
): Promise<AudioBuffer | undefined> {
  const frames = Math.round(totalSec * AUDIO_SR);
  if (frames < 1) return undefined;
  const useClips = musicMode !== 'replace';
  const useMusic = !!musicFile && musicMode !== 'keep';
  const useVoice = !!voice.file;
  if (!useClips && !useMusic && !useVoice) return undefined;
  // Duck the clips + music under the narration so speech stays intelligible.
  const bg = useVoice && voice.duck !== undefined && voice.duck < 1 ? Math.max(0, voice.duck) : 1;

  const octx = new OfflineAudioContext(2, frames, AUDIO_SR);
  // Everything runs through a master gain so the fade shapes the whole mix.
  const master = octx.createGain();
  master.connect(octx.destination);
  if (fadeSec > 0) {
    const f = Math.min(fadeSec, totalSec / 2);
    master.gain.setValueAtTime(0, 0);
    master.gain.linearRampToValueAtTime(1, f);
    master.gain.setValueAtTime(1, Math.max(f, totalSec - f));
    master.gain.linearRampToValueAtTime(0, totalSec);
  }
  // decodeAudioData needs a live context in some browsers; use a throwaway one.
  const dctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  let any = false;
  try {
    if (useClips) {
      const starts = clipStarts(clips);
      for (let i = 0; i < clips.length; i++) {
        const c = clips[i]!;
        if (clipLength(c) <= 0 || clipVolume(c) === 0) continue;
        try {
          const buf = await dctx.decodeAudioData(await c.file.arrayBuffer());
          const src = octx.createBufferSource();
          src.buffer = buf;
          // Speed changes pitch too (tape-style) — fine for the fun looks this powers.
          src.playbackRate.value = clipSpeed(c);
          const g = octx.createGain();
          g.gain.value = clipVolume(c) * bg;
          src.connect(g).connect(master);
          // start()'s offset/duration are in BUFFER time; the trim window plays at
          // `speed`, occupying clipLength(c) seconds of the movie.
          src.start(starts[i]!, Math.min(c.inS, Math.max(0, buf.duration - 0.001)), Math.max(0, c.outS - c.inS));
          any = true;
        } catch { /* silent clip (no track / undecodable container) — video still exports */ }
      }
    }
    if (useMusic) {
      try {
        const buf = await dctx.decodeAudioData(await musicFile!.arrayBuffer());
        const src = octx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const g = octx.createGain();
        g.gain.value = Math.max(0, Math.min(1, musicVolume)) * bg;
        src.connect(g).connect(master);
        src.start(0);
        src.stop(totalSec);
        any = true;
      } catch { /* undecodable music — keep going */ }
    }
    if (useVoice) {
      try {
        const buf = await dctx.decodeAudioData(await voice.file!.arrayBuffer());
        const src = octx.createBufferSource();
        src.buffer = buf;
        const g = octx.createGain();
        g.gain.value = Math.max(0, Math.min(1, voice.volume ?? 1));
        src.connect(g).connect(master);
        // Narration is NOT looped — it plays once from its start offset.
        const start = Math.max(0, Math.min(voice.startS ?? 0, totalSec));
        src.start(start);
        any = true;
      } catch { /* undecodable narration — keep going */ }
    }
    if (!any) return undefined;
    return await octx.startRendering();
  } finally { await dctx.close().catch(() => { /* */ }); }
}

/** Encode the whole timeline to a WebM Blob with an exact duration.
 *  Throws on any WebCodecs/muxing failure so the caller can fall back. */
export async function encodeTimelineWebM(opts: TimelineEncodeOpts): Promise<Blob> {
  const { clips, fps, onProgress, shouldStop } = opts;
  const w = even(opts.w), h = even(opts.h);
  const totalSec = clips.reduce((s, c) => s + clipLength(c), 0);
  const frameCount = Math.max(1, Math.round(totalSec * fps));
  const plan = frameSourceTimes(clips, fps, frameCount);

  onProgress?.('Reading the sound…');
  const audioBuffer = await renderTimelineAudio(clips, opts.musicFile, opts.musicMode, totalSec, opts.musicVolume ?? 1, opts.fadeSec ?? 0, {
    file: opts.voiceFile, volume: opts.voiceVolume, startS: opts.voiceStartS, duck: opts.voiceDuck,
  });
  if (shouldStop?.()) throw new Error('__cancelled__');

  const G = globalThis as unknown as {
    VideoEncoder: new (init: { output: (c: unknown, m: unknown) => void; error: (e: Error) => void }) => { configure(c: unknown): void; encode(f: unknown, o?: unknown): void; flush(): Promise<void>; close(): void };
    AudioEncoder: new (init: { output: (c: unknown, m: unknown) => void; error: (e: Error) => void }) => { configure(c: unknown): void; encode(d: unknown): void; flush(): Promise<void>; close(): void };
    VideoFrame: new (src: CanvasImageSource, init: { timestamp: number; duration?: number }) => { close(): void };
    AudioData: new (init: Record<string, unknown>) => { close(): void };
  };

  // Prefer MP4 (H.264/AAC) so the reel plays & shares everywhere (WhatsApp, iOS);
  // fall back to WebM only if the browser can't encode it.
  const profile = await pickMuxProfile(w, h, fps);
  const audioCfg = audioBuffer ? { codec: profile.aMux, numberOfChannels: audioBuffer.numberOfChannels, sampleRate: audioBuffer.sampleRate } : undefined;
  let muxer: { addVideoChunk(c: unknown, m: unknown): void; addAudioChunk(c: unknown, m: unknown): void; finalize(): void; target: { buffer: ArrayBuffer } };
  if (profile.container === 'mp4') {
    const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
    muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: profile.vMux as 'avc', width: w, height: h },
      ...(audioCfg ? { audio: audioCfg as { codec: 'aac'; numberOfChannels: number; sampleRate: number } } : {}),
      fastStart: 'in-memory', // moov atom at the front → streams/plays immediately
      firstTimestampBehavior: 'offset',
    }) as never;
  } else {
    const { Muxer, ArrayBufferTarget } = await import('webm-muxer');
    muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: profile.vMux, width: w, height: h, frameRate: fps },
      ...(audioCfg ? { audio: audioCfg } : {}),
      firstTimestampBehavior: 'offset',
    }) as never;
  }

  // ── Video: seek → paint → encode, frame by frame, exact timestamps ──
  const venc = new G.VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c as never, m as never), error: (e) => { throw e; } });
  venc.configure({ codec: profile.vCodec, width: w, height: h, bitrate: 6_000_000, framerate: fps, ...(profile.container === 'mp4' ? { avc: { format: 'avc' } } : {}) });
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const ts = frameTimestampsUs(frameCount, fps);
  const frameDurUs = Math.round(1_000_000 / fps);
  const gop = Math.max(1, Math.round(fps * 2));
  const starts = clipStarts(clips);
  for (let i = 0; i < frameCount; i++) {
    if (shouldStop?.()) { try { venc.close(); } catch { /* */ } throw new Error('__cancelled__'); }
    const movieT = (i + 0.5) / fps;
    const at = plan[i];
    if (at) {
      const blend = seamBlend(clips, movieT, opts.transitionSec ?? 0);
      if (blend) {
        // Crossfade: outgoing holds/plays its tail while the incoming clip
        // fades in over it — both seeked to their clamped source times.
        const a = clips[blend.from]!, b = clips[blend.to]!;
        await seekExact(a.el, clipSourceAt(a, starts[blend.from]!, movieT));
        await seekExact(b.el, clipSourceAt(b, starts[blend.to]!, movieT));
        opts.drawClip(ctx, a, 1, w, h);
        opts.drawClip(ctx, b, blend.mix, w, h);
      } else {
        const clip = clips[at.index]!;
        await seekExact(clip.el, at.sourceTime);
        opts.drawClip(ctx, clip, 1, w, h);
      }
      opts.drawTop(ctx, movieT, w, h);
    }
    const vf = new G.VideoFrame(canvas, { timestamp: ts[i]!, duration: frameDurUs });
    venc.encode(vf, { keyFrame: i % gop === 0 });
    vf.close();
    if (i % 5 === 0 || i === frameCount - 1) onProgress?.(`Frame ${i + 1} / ${frameCount}`);
  }
  await venc.flush();
  venc.close();

  // ── Audio: the pre-mixed buffer, chunked to Opus ──
  if (audioBuffer) {
    onProgress?.('Encoding sound…');
    const sr = audioBuffer.sampleRate, ch = audioBuffer.numberOfChannels;
    const total = audioBuffer.length;
    const chans = Array.from({ length: ch }, (_, c) => audioBuffer.getChannelData(c));
    const aenc = new G.AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c as never, m as never), error: (e) => { throw e; } });
    aenc.configure({ codec: profile.aCodec, sampleRate: sr, numberOfChannels: ch, bitrate: 128_000 });
    const chunk = Math.round(sr * 0.1);
    for (let off = 0; off < total; off += chunk) {
      const n = Math.min(chunk, total - off);
      const data = new Float32Array(n * ch);
      for (let c = 0; c < ch; c++) data.set(chans[c]!.subarray(off, off + n), c * n);
      const ad = new G.AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: ch, timestamp: Math.round((off / sr) * 1_000_000), data });
      aenc.encode(ad); ad.close();
    }
    await aenc.flush();
    aenc.close();
  }

  muxer.finalize();
  const target = (muxer.target as unknown as { buffer: ArrayBuffer });
  return new Blob([target.buffer], { type: profile.mime });
}
