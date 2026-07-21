/**
 * Faster-than-real-time animation export via WebCodecs + webm-muxer. Frames are
 * encoded as fast as the CPU allows (not played back in real time like
 * MediaRecorder), and optional music is decoded and Opus-encoded separately, then
 * both are muxed into a WebM. Everything is on-device. Browsers without WebCodecs
 * fall back to the MediaRecorder path in the modal. The timing/audio-looping maths
 * are pure and unit-tested; the encode itself needs browser APIs.
 */

/** WebCodecs video + audio encoding is available. */
export function webCodecsSupported(): boolean {
  const g = globalThis as unknown as { VideoEncoder?: unknown; AudioEncoder?: unknown; VideoFrame?: unknown };
  return typeof g.VideoEncoder !== 'undefined' && typeof g.VideoFrame !== 'undefined';
}

/** Per-frame presentation timestamps in microseconds for a clip at `fps`. */
export function frameTimestampsUs(count: number, fps: number): number[] {
  const dur = 1_000_000 / fps;
  return Array.from({ length: Math.max(0, count) }, (_, i) => Math.round(i * dur));
}

/** Loop (or truncate) one audio channel to exactly `targetLen` samples, so music
 *  shorter than the clip repeats and longer music is cut to length. */
export function loopAudioChannel(src: Float32Array, targetLen: number): Float32Array {
  const out = new Float32Array(Math.max(0, targetLen));
  if (!src.length) return out;
  for (let i = 0; i < out.length; i++) out[i] = src[i % src.length]!;
  return out;
}

/** Even integer ≥ 2 — VP9/VP8 want even dimensions. */
export const even = (n: number): number => Math.max(2, Math.round(n / 2) * 2);

export type Codec = { codec: string; muxerCodec: string };
export async function pickVideoCodec(w: number, h: number, fps: number): Promise<Codec> {
  const VE = (globalThis as unknown as { VideoEncoder: { isConfigSupported(c: unknown): Promise<{ supported?: boolean }> } }).VideoEncoder;
  const candidates: Codec[] = [{ codec: 'vp09.00.10.08', muxerCodec: 'V_VP9' }, { codec: 'vp8', muxerCodec: 'V_VP8' }];
  for (const c of candidates) {
    try { const s = await VE.isConfigSupported({ codec: c.codec, width: w, height: h, bitrate: 5_000_000, framerate: fps }); if (s.supported) return c; } catch { /* try next */ }
  }
  return candidates[0]!;
}

/** A full container + codec plan for an export. */
export interface MuxProfile {
  container: 'mp4' | 'webm';
  /** WebCodecs video codec string (VideoEncoder.configure). */
  vCodec: string;
  /** Muxer's video codec id (mp4-muxer 'avc' / webm-muxer 'V_VP9'…). */
  vMux: string;
  /** WebCodecs audio codec string (AudioEncoder.configure). */
  aCodec: string;
  /** Muxer's audio codec id ('aac' / 'A_OPUS'). */
  aMux: string;
  mime: string;
  ext: 'mp4' | 'webm';
}

/**
 * Choose the best container the browser can actually encode, **preferring MP4
 * (H.264 + AAC)** because that is the format WhatsApp, iOS, and every social app
 * accept and can play. Falls back to WebM (VP9/VP8 + Opus) only when H.264/AAC
 * encoding isn't available. WebM does NOT play on iOS and is rejected by
 * WhatsApp, so MP4 is worth preferring even though H.264 is a touch larger.
 */
export async function pickMuxProfile(w: number, h: number, fps: number): Promise<MuxProfile> {
  const g = globalThis as unknown as {
    VideoEncoder?: { isConfigSupported(c: unknown): Promise<{ supported?: boolean }> };
    AudioEncoder?: { isConfigSupported(c: unknown): Promise<{ supported?: boolean }> };
  };
  const canV = async (codec: string): Promise<boolean> => {
    try { return !!(await g.VideoEncoder?.isConfigSupported({ codec, width: w, height: h, bitrate: 5_000_000, framerate: fps }))?.supported; } catch { return false; }
  };
  const canA = async (codec: string): Promise<boolean> => {
    try { return !!(await g.AudioEncoder?.isConfigSupported({ codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 128_000 }))?.supported; } catch { return false; }
  };

  // MP4 first — universally shareable/playable.
  if (await canA('mp4a.40.2')) {
    for (const c of ['avc1.640028', 'avc1.4d0028', 'avc1.42e01e']) {
      if (await canV(c)) return { container: 'mp4', vCodec: c, vMux: 'avc', aCodec: 'mp4a.40.2', aMux: 'aac', mime: 'video/mp4', ext: 'mp4' };
    }
  }
  // WebM fallback.
  for (const c of [{ v: 'vp09.00.10.08', m: 'V_VP9' }, { v: 'vp8', m: 'V_VP8' }]) {
    if (await canV(c.v)) return { container: 'webm', vCodec: c.v, vMux: c.m, aCodec: 'opus', aMux: 'A_OPUS', mime: 'video/webm', ext: 'webm' };
  }
  return { container: 'webm', vCodec: 'vp09.00.10.08', vMux: 'V_VP9', aCodec: 'opus', aMux: 'A_OPUS', mime: 'video/webm', ext: 'webm' };
}

export interface EncodeOpts {
  frames: CanvasImageSource[];
  w: number;
  h: number;
  fps: number;
  audioFile?: File | null;
  onProgress?: (msg: string) => void;
  /** Checked between frames; throwing lets the caller abandon a long encode. */
  shouldStop?: () => boolean;
}

/** Encode pre-rendered frames (+ optional music) to a WebM Blob, faster than real
 *  time. Throws if WebCodecs/muxing fails so the caller can fall back. */
export async function encodeAnimationWebM(opts: EncodeOpts): Promise<Blob> {
  const { frames, fps, audioFile, onProgress } = opts;
  const w = even(opts.w), h = even(opts.h);
  const G = globalThis as unknown as {
    VideoEncoder: new (init: { output: (c: unknown, m: unknown) => void; error: (e: Error) => void }) => { configure(c: unknown): void; encode(f: unknown, o?: unknown): void; flush(): Promise<void>; close(): void };
    AudioEncoder: new (init: { output: (c: unknown, m: unknown) => void; error: (e: Error) => void }) => { configure(c: unknown): void; encode(d: unknown): void; flush(): Promise<void>; close(): void };
    VideoFrame: new (src: CanvasImageSource, init: { timestamp: number; duration?: number }) => { close(): void };
    AudioData: new (init: Record<string, unknown>) => { close(): void };
    AudioContext: new () => AudioContext;
  };

  // Decode music first (so we know channel/sample-rate for the muxer header).
  let audioBuffer: AudioBuffer | undefined;
  let actx: AudioContext | undefined;
  if (audioFile) {
    actx = new G.AudioContext();
    try { audioBuffer = await actx.decodeAudioData(await audioFile.arrayBuffer()); } catch { /* undecodable — export silent */ }
  }

  // Prefer MP4 (H.264/AAC) so the result plays & shares everywhere (WhatsApp,
  // iOS); fall back to WebM only if the browser can't encode it.
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

  // ── Video ──
  const venc = new G.VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c as never, m as never), error: (e) => { throw e; } });
  venc.configure({ codec: profile.vCodec, width: w, height: h, bitrate: 6_000_000, framerate: fps, ...(profile.container === 'mp4' ? { avc: { format: 'avc' } } : {}) });
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const ts = frameTimestampsUs(frames.length, fps);
  const frameDurUs = Math.round(1_000_000 / fps);
  const gop = Math.max(1, Math.round(fps * 2));
  for (let i = 0; i < frames.length; i++) {
    if (opts.shouldStop?.()) { try { venc.close(); } catch { /* */ } throw new Error('__cancelled__'); }
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(frames[i]!, 0, 0, w, h);
    const vf = new G.VideoFrame(canvas, { timestamp: ts[i]!, duration: frameDurUs });
    venc.encode(vf, { keyFrame: i % gop === 0 });
    vf.close();
    if (i % 5 === 0 || i === frames.length - 1) onProgress?.(`Encoding ${i + 1} / ${frames.length}`);
  }
  await venc.flush();
  venc.close();

  // ── Audio (looped/truncated to the clip length) ──
  if (audioBuffer) {
    onProgress?.('Encoding audio…');
    const sr = audioBuffer.sampleRate, ch = audioBuffer.numberOfChannels;
    const total = Math.round((frames.length / fps) * sr);
    const looped = Array.from({ length: ch }, (_, c) => loopAudioChannel(audioBuffer!.getChannelData(c), total));
    const aenc = new G.AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c as never, m as never), error: (e) => { throw e; } });
    aenc.configure({ codec: profile.aCodec, sampleRate: sr, numberOfChannels: ch, bitrate: 128_000 });
    const chunk = Math.round(sr * 0.1);
    for (let off = 0; off < total; off += chunk) {
      const n = Math.min(chunk, total - off);
      const data = new Float32Array(n * ch);
      for (let c = 0; c < ch; c++) data.set(looped[c]!.subarray(off, off + n), c * n);
      const ad = new G.AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: ch, timestamp: Math.round((off / sr) * 1_000_000), data });
      aenc.encode(ad); ad.close();
    }
    await aenc.flush();
    aenc.close();
  }

  muxer.finalize();
  await actx?.close().catch(() => { /* */ });
  const target = (muxer.target as unknown as { buffer: ArrayBuffer });
  return new Blob([target.buffer], { type: profile.mime });
}
