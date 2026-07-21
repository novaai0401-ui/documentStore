/**
 * Memory-video encoder — renders a photo slideshow (Ken Burns pan-zoom +
 * crossfade/slide + optional captions and music) to a shareable MP4 (H.264/AAC,
 * WebM fallback), entirely on-device via WebCodecs. Timing/motion maths live in
 * slideshow.ts (pure, tested); this is the canvas + encode glue. Mirrors
 * animateEncode/videoEncode so it reuses the same codec-profile picker.
 */
import { frameTimestampsUs, even, pickMuxProfile } from './animateEncode.js';
import { coverSrcRect } from './video.js';
import { kenBurnsFor, kenBurnsAt, slideshowPlan, type SlideTransition, type KenBurns, type SlideFrame } from './slideshow.js';
import { photoRectFor, paintFrameBack, paintFrameFront, roundRectPath, memoryFrameById, type PhotoRect } from './memoryFrames.js';

export interface SlideshowEncodeOpts {
  /** Decoded photos in order. */
  images: HTMLImageElement[];
  w: number;
  h: number;
  fps: number;
  perPhotoSec: number;
  transition: SlideTransition;
  crossSec?: number;
  musicFile?: File | null;
  /** Music level 0…1 (default 1). */
  musicVolume?: number;
  /** A recorded narration (WAV) laid over the slideshow — see voiceOver.ts. */
  voiceFile?: File | null;
  /** Voice-over level 0…1 (default 1). */
  voiceVolume?: number;
  /** When a voice-over is present, scale the music by this (0…1) so the
   *  narration sits on top. 1 = no ducking (default). */
  voiceDuck?: number;
  /** Paint above the photos (captions, title/date). Called every frame. */
  drawTop?: (ctx: CanvasRenderingContext2D, movieT: number, w: number, h: number) => void;
  onProgress?: (msg: string) => void;
  shouldStop?: () => boolean;
}

/** Draw one photo, cover-fitted and Ken-Burns transformed, optionally translated
 *  horizontally by `ox` (for the slide transition) and at the given `alpha`. */
function drawPhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement, kb: KenBurns, p: number, w: number, h: number, alpha: number, ox = 0) {
  const { scale, cx, cy } = kenBurnsAt(kb, p);
  const cr = coverSrcRect(img.naturalWidth || w, img.naturalHeight || h, w, h);
  const dw = w * scale, dh = h * scale;
  const dx = (w - dw) * cx + ox;
  const dy = (h - dh) * cy;
  ctx.globalAlpha = alpha;
  try { ctx.drawImage(img, cr.sx, cr.sy, cr.sw, cr.sh, dx, dy, dw, dh); } catch { /* not decoded */ }
  ctx.globalAlpha = 1;
}

/** Draw one photo cover-fitted + Ken-Burns transformed INSIDE a rounded rect,
 *  clipped to that rect. Used by the decorative frames (rounded/polaroid/film). */
function drawPhotoInRect(ctx: CanvasRenderingContext2D, img: HTMLImageElement, kb: KenBurns, p: number, rect: PhotoRect, alpha: number) {
  const { scale, cx, cy } = kenBurnsAt(kb, p);
  const cr = coverSrcRect(img.naturalWidth || rect.rw, img.naturalHeight || rect.rh, rect.rw, rect.rh);
  const dw = rect.rw * scale, dh = rect.rh * scale;
  const dx = rect.x + (rect.rw - dw) * cx;
  const dy = rect.y + (rect.rh - dh) * cy;
  ctx.save();
  roundRectPath(ctx, rect.x, rect.y, rect.rw, rect.rh, rect.radius); ctx.clip();
  ctx.globalAlpha = alpha;
  try { ctx.drawImage(img, cr.sx, cr.sy, cr.sw, cr.sh, dx, dy, dw, dh); } catch { /* not decoded */ }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Paint a single planned slideshow frame (photo hold or transition) onto `ctx`.
 *  Shared by the encoder and the live preview so they look identical. `frame`
 *  (default 'none') draws a decorative matte/border around each photo. */
export function paintSlideFrame(ctx: CanvasRenderingContext2D, f: SlideFrame, images: HTMLImageElement[], kbs: KenBurns[], w: number, h: number, transition: SlideTransition, frame = 'none') {
  // 'vignette' is full-bleed + an overlay, so it shares the plain photo path.
  if (frame === 'none' || frame === 'vignette') {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    if (f.kind === 'photo') {
      drawPhoto(ctx, images[f.index]!, kbs[f.index]!, f.p, w, h, 1);
    } else if (transition === 'slide') {
      drawPhoto(ctx, images[f.from]!, kbs[f.from]!, f.pFrom, w, h, 1, -f.mix * w);
      drawPhoto(ctx, images[f.to]!, kbs[f.to]!, f.pTo, w, h, 1, (1 - f.mix) * w);
    } else {
      drawPhoto(ctx, images[f.from]!, kbs[f.from]!, f.pFrom, w, h, 1);
      drawPhoto(ctx, images[f.to]!, kbs[f.to]!, f.pTo, w, h, f.mix);
    }
    if (frame === 'vignette') paintFrameFront(ctx, 'vignette', photoRectFor('vignette', w, h), w, h);
    return;
  }
  // Matted frames (rounded / polaroid / film): fill the mat, draw the photo(s)
  // clipped inside the inner rect (crossfade only — a hard slide would leave the
  // mat), then the decorative border/sprockets on top.
  const rect = photoRectFor(frame, w, h);
  ctx.fillStyle = memoryFrameById(frame).bg; ctx.fillRect(0, 0, w, h);
  paintFrameBack(ctx, frame, rect, w, h);
  if (f.kind === 'photo') {
    drawPhotoInRect(ctx, images[f.index]!, kbs[f.index]!, f.p, rect, 1);
  } else {
    drawPhotoInRect(ctx, images[f.from]!, kbs[f.from]!, f.pFrom, rect, 1);
    drawPhotoInRect(ctx, images[f.to]!, kbs[f.to]!, f.pTo, rect, f.mix);
  }
  paintFrameFront(ctx, frame, rect, w, h);
}

const AUDIO_SR = 48000;

/** Mix looped music + a once-through voice-over into one buffer of `totalSec`
 *  seconds (music ducked under the narration). Returns undefined when silent.
 *  Decoding is per-source and non-fatal so one bad file never kills the export. */
async function renderSlideshowAudio(opts: SlideshowEncodeOpts, totalSec: number): Promise<AudioBuffer | undefined> {
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
      } catch { /* undecodable music — keep going */ }
    }
    if (useVoice) {
      try {
        const buf = await dctx.decodeAudioData(await opts.voiceFile!.arrayBuffer());
        const src = octx.createBufferSource(); src.buffer = buf;
        const g = octx.createGain(); g.gain.value = Math.max(0, Math.min(1, opts.voiceVolume ?? 1));
        src.connect(g).connect(octx.destination); src.start(0); any = true;
      } catch { /* undecodable narration — keep going */ }
    }
    if (!any) return undefined;
    return await octx.startRendering();
  } finally { await dctx.close().catch(() => { /* */ }); }
}

export async function encodeSlideshow(opts: SlideshowEncodeOpts): Promise<Blob> {
  const { images, fps, onProgress, shouldStop } = opts;
  const w = even(opts.w), h = even(opts.h);
  const plan = slideshowPlan({ photos: images.length, perPhotoSec: opts.perPhotoSec, fps, transition: opts.transition, crossSec: opts.crossSec });
  const frameCount = Math.max(1, plan.length);
  const totalSec = frameCount / fps;
  const kbs = images.map((_, i) => kenBurnsFor(i));

  // ── Audio: music (looped) + voice-over (once), mixed to the slideshow length ──
  onProgress?.('Reading the sound…');
  const audioBuffer = await renderSlideshowAudio(opts, totalSec);
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

  // ── Video ──
  const venc = new G.VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c as never, m as never), error: (e) => { throw e; } });
  venc.configure({ codec: profile.vCodec, width: w, height: h, bitrate: 6_000_000, framerate: fps, ...(profile.container === 'mp4' ? { avc: { format: 'avc' } } : {}) });
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const ts = frameTimestampsUs(frameCount, fps);
  const frameDurUs = Math.round(1_000_000 / fps);
  const gop = Math.max(1, Math.round(fps * 2));
  for (let i = 0; i < frameCount; i++) {
    if (shouldStop?.()) { try { venc.close(); } catch { /* */ } throw new Error('__cancelled__'); }
    paintSlideFrame(ctx, plan[i]!, images, kbs, w, h, opts.transition);
    opts.drawTop?.(ctx, (i + 0.5) / fps, w, h);
    const vf = new G.VideoFrame(canvas, { timestamp: ts[i]!, duration: frameDurUs });
    venc.encode(vf, { keyFrame: i % gop === 0 });
    vf.close();
    if (i % 5 === 0 || i === frameCount - 1) onProgress?.(`Frame ${i + 1} / ${frameCount}`);
  }
  await venc.flush();
  venc.close();

  // ── Audio: the pre-mixed buffer (music + voice-over), chunked to the codec ──
  if (audioBuffer) {
    onProgress?.('Adding the sound…');
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
