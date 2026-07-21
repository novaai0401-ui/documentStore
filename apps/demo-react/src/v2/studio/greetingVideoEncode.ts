/**
 * Greeting-video encoder — renders the occasion animation (occasionAnim.ts) with
 * the wish text + optional photo to a shareable MP4 (H.264/AAC, WebM fallback),
 * with music + optional voice message, all on-device. The frame painting is
 * shared with the modal's live preview via paintGreetingFrame.
 */
import { frameTimestampsUs, even, pickMuxProfile } from './animateEncode.js';
import { paintGreetingFrame, type OccasionAnim, type GreetingContent } from './occasionAnim.js';

export interface GreetingEncodeOpts {
  occ: OccasionAnim;
  content: GreetingContent;
  durationSec: number;
  w: number;
  h: number;
  fps: number;
  musicFile?: File | null;
  musicVolume?: number;
  voiceFile?: File | null;
  voiceVolume?: number;
  voiceDuck?: number;
  onProgress?: (msg: string) => void;
  shouldStop?: () => boolean;
}

const AUDIO_SR = 48000;

async function mixAudio(opts: GreetingEncodeOpts, totalSec: number): Promise<AudioBuffer | undefined> {
  const frames = Math.round(totalSec * AUDIO_SR);
  if (frames < 1) return undefined;
  const useMusic = !!opts.musicFile, useVoice = !!opts.voiceFile;
  if (!useMusic && !useVoice) return undefined;
  const bg = useVoice && opts.voiceDuck !== undefined && opts.voiceDuck < 1 ? Math.max(0, opts.voiceDuck) : 1;
  const octx = new OfflineAudioContext(2, frames, AUDIO_SR);
  const dctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  let any = false;
  try {
    if (useMusic) {
      try {
        const buf = await dctx.decodeAudioData(await opts.musicFile!.arrayBuffer());
        const src = octx.createBufferSource(); src.buffer = buf; src.loop = true;
        const g = octx.createGain(); g.gain.value = Math.max(0, Math.min(1, opts.musicVolume ?? 1)) * bg;
        src.connect(g).connect(octx.destination); src.start(0); src.stop(totalSec); any = true;
      } catch { /* keep going */ }
    }
    if (useVoice) {
      try {
        const buf = await dctx.decodeAudioData(await opts.voiceFile!.arrayBuffer());
        const src = octx.createBufferSource(); src.buffer = buf;
        const g = octx.createGain(); g.gain.value = Math.max(0, Math.min(1, opts.voiceVolume ?? 1));
        src.connect(g).connect(octx.destination); src.start(0); any = true;
      } catch { /* keep going */ }
    }
    if (!any) return undefined;
    return await octx.startRendering();
  } finally { await dctx.close().catch(() => { /* */ }); }
}

export async function encodeGreetingVideo(opts: GreetingEncodeOpts): Promise<Blob> {
  const { occ, content, fps, onProgress, shouldStop } = opts;
  const w = even(opts.w), h = even(opts.h);
  const totalSec = Math.max(1, opts.durationSec);
  const frameCount = Math.max(1, Math.round(totalSec * fps));

  onProgress?.('Reading the sound…');
  const audioBuffer = await mixAudio(opts, totalSec);
  if (shouldStop?.()) throw new Error('__cancelled__');

  const G = globalThis as unknown as {
    VideoEncoder: new (init: { output: (c: unknown, m: unknown) => void; error: (e: Error) => void }) => { configure(c: unknown): void; encode(f: unknown, o?: unknown): void; flush(): Promise<void>; close(): void };
    AudioEncoder: new (init: { output: (c: unknown, m: unknown) => void; error: (e: Error) => void }) => { configure(c: unknown): void; encode(d: unknown): void; flush(): Promise<void>; close(): void };
    VideoFrame: new (src: CanvasImageSource, init: { timestamp: number; duration?: number }) => { close(): void };
    AudioData: new (init: Record<string, unknown>) => { close(): void };
  };

  const profile = await pickMuxProfile(w, h, fps);
  const audioCfg = audioBuffer ? { codec: profile.aMux, numberOfChannels: audioBuffer.numberOfChannels, sampleRate: audioBuffer.sampleRate } : undefined;
  let muxer: { addVideoChunk(c: unknown, m: unknown): void; addAudioChunk(c: unknown, m: unknown): void; finalize(): void; target: { buffer: ArrayBuffer } };
  if (profile.container === 'mp4') {
    const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
    muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: profile.vMux as 'avc', width: w, height: h }, ...(audioCfg ? { audio: audioCfg as { codec: 'aac'; numberOfChannels: number; sampleRate: number } } : {}), fastStart: 'in-memory', firstTimestampBehavior: 'offset' }) as never;
  } else {
    const { Muxer, ArrayBufferTarget } = await import('webm-muxer');
    muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: profile.vMux, width: w, height: h, frameRate: fps }, ...(audioCfg ? { audio: audioCfg } : {}), firstTimestampBehavior: 'offset' }) as never;
  }

  const venc = new G.VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c as never, m as never), error: (e) => { throw e; } });
  venc.configure({ codec: profile.vCodec, width: w, height: h, bitrate: 6_000_000, framerate: fps, ...(profile.container === 'mp4' ? { avc: { format: 'avc' } } : {}) });
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const ts = frameTimestampsUs(frameCount, fps);
  const frameDurUs = Math.round(1_000_000 / fps);
  const gop = Math.max(1, Math.round(fps * 2));
  for (let i = 0; i < frameCount; i++) {
    if (shouldStop?.()) { try { venc.close(); } catch { /* */ } throw new Error('__cancelled__'); }
    paintGreetingFrame(ctx, occ, (i + 0.5) / frameCount, w, h, content);
    const vf = new G.VideoFrame(canvas, { timestamp: ts[i]!, duration: frameDurUs });
    venc.encode(vf, { keyFrame: i % gop === 0 });
    vf.close();
    if (i % 5 === 0 || i === frameCount - 1) onProgress?.(`Frame ${i + 1} / ${frameCount}`);
  }
  await venc.flush();
  venc.close();

  if (audioBuffer) {
    onProgress?.('Adding the sound…');
    const sr = audioBuffer.sampleRate, ch = audioBuffer.numberOfChannels, total = audioBuffer.length;
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
