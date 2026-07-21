/**
 * Script→reel renderer + encoder. Draws each scene as a gradient background with
 * big, wrapped, centred caption text (fade in/out + a subtle zoom) and muxes to
 * a shareable MP4 (H.264/AAC, WebM fallback) with looped music + optional
 * voice-over. Shares `paintScriptFrame` with the modal's live preview. Scene
 * planning is pure/tested in scriptReel.ts.
 */
import { frameTimestampsUs, even, pickMuxProfile } from './animateEncode.js';
import { sceneAt, scriptStyleById, type ScriptScene, type ScriptPattern } from './scriptReel.js';

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const TAU = Math.PI * 2;
// Deterministic pseudo-random so the decorative layer is stable frame-to-frame.
const rnd = (i: number) => { const x = Math.sin(i * 127.1 + 3.71) * 43758.5453; return x - Math.floor(x); };

/** One hand-drawn doodle glyph (star/heart/spiral/…) centred at (x,y). Simple
 *  strokes so it reads as a marker sketch, not clip-art. */
function doodle(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number, s: number, rot: number) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath();
  switch (kind % 6) {
    case 0: // star burst
      for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU - Math.PI / 2; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s); } break;
    case 1: // heart
      ctx.moveTo(0, s * 0.3); ctx.bezierCurveTo(s, -s * 0.5, s * 0.5, -s, 0, -s * 0.35); ctx.bezierCurveTo(-s * 0.5, -s, -s, -s * 0.5, 0, s * 0.3); break;
    case 2: // spiral
      for (let a = 0; a < TAU * 2; a += 0.3) { const r = (a / (TAU * 2)) * s; const px = Math.cos(a) * r, py = Math.sin(a) * r; a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); } break;
    case 3: // squiggle
      for (let k = 0; k <= 12; k++) { const px = (k / 12 - 0.5) * s * 2; const py = Math.sin(k * 0.9) * s * 0.4; k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); } break;
    case 4: // little sun
      ctx.arc(0, 0, s * 0.5, 0, TAU); for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; ctx.moveTo(Math.cos(a) * s * 0.7, Math.sin(a) * s * 0.7); ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s); } break;
    default: // sparkle plus
      ctx.moveTo(-s, 0); ctx.lineTo(s, 0); ctx.moveTo(0, -s); ctx.lineTo(0, s);
  }
  ctx.stroke(); ctx.restore();
}

/** Draw the static decorative background layer for a style's pattern. Kept calm
 *  (behind the text) and deterministic so it doesn't shimmer between frames. */
function drawPattern(ctx: CanvasRenderingContext2D, pattern: ScriptPattern | undefined, color: string | undefined, w: number, h: number) {
  if (!pattern || pattern === 'none') return;
  const col = color ?? 'rgba(255,255,255,0.14)';
  const unit = Math.min(w, h);
  ctx.save();
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, unit * 0.006);
  if (pattern === 'doodle') {
    const n = 22;
    for (let i = 0; i < n; i++) doodle(ctx, Math.floor(rnd(i) * 6), rnd(i + 9) * w, rnd(i + 21) * h, unit * (0.03 + rnd(i + 4) * 0.03), (rnd(i + 7) - 0.5) * 1.2);
  } else if (pattern === 'confetti') {
    const cols = ['#f472b6', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#fb7185'];
    for (let i = 0; i < 46; i++) {
      const x = rnd(i) * w, y = rnd(i + 3) * h, s = unit * (0.012 + rnd(i + 6) * 0.02);
      ctx.fillStyle = cols[i % cols.length]!; ctx.globalAlpha = 0.85;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rnd(i + 2) * TAU);
      rnd(i + 1) > 0.5 ? ctx.fillRect(-s / 2, -s / 2, s, s * 1.6) : (ctx.beginPath(), ctx.arc(0, 0, s * 0.6, 0, TAU), ctx.fill());
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  } else if (pattern === 'notebook') {
    const gap = h * 0.062;
    ctx.globalAlpha = 1;
    for (let y = h * 0.14; y < h; y += gap) { ctx.beginPath(); ctx.moveTo(w * 0.06, y); ctx.lineTo(w * 0.94, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(244,63,94,0.35)'; ctx.beginPath(); ctx.moveTo(w * 0.13, 0); ctx.lineTo(w * 0.13, h); ctx.stroke();
  } else if (pattern === 'bokeh' || pattern === 'bubbles') {
    for (let i = 0; i < 16; i++) {
      const x = rnd(i) * w, y = rnd(i + 5) * h, r = unit * (0.04 + rnd(i + 2) * 0.11);
      ctx.globalAlpha = 0.10 + rnd(i + 8) * 0.12; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (pattern === 'stars') {
    ctx.globalAlpha = 1;
    for (let i = 0; i < 40; i++) { const x = rnd(i) * w, y = rnd(i + 11) * h, s = unit * (0.006 + rnd(i + 3) * 0.014); ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill(); }
    for (let i = 0; i < 6; i++) doodle(ctx, 5, rnd(i + 30) * w, rnd(i + 40) * h, unit * 0.02, 0);
  }
  ctx.restore();
}

/** Draw an optional decorative frame over the scene. */
function drawFrame(ctx: CanvasRenderingContext2D, frameId: string | undefined, w: number, h: number, color: string) {
  if (!frameId || frameId === 'none') return;
  const m = Math.min(w, h) * 0.05;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(3, Math.min(w, h) * 0.008); ctx.lineJoin = 'round';
  if (frameId === 'thin') { ctx.strokeRect(m, m, w - 2 * m, h - 2 * m); }
  else if (frameId === 'double') { ctx.strokeRect(m, m, w - 2 * m, h - 2 * m); ctx.lineWidth = Math.max(1.5, ctx.lineWidth * 0.5); ctx.strokeRect(m * 1.5, m * 1.5, w - 3 * m, h - 3 * m); }
  else if (frameId === 'dashed') { ctx.setLineDash([Math.min(w, h) * 0.03, Math.min(w, h) * 0.02]); ctx.strokeRect(m, m, w - 2 * m, h - 2 * m); }
  else if (frameId === 'corners') {
    const L = Math.min(w, h) * 0.09;
    for (const [cx, cy, sx, sy] of [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]] as const) {
      ctx.beginPath(); ctx.moveTo(cx + sx * L, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy * L); ctx.stroke();
    }
  } else if (frameId === 'tape') {
    // Four translucent "washi tape" strips across the corners.
    ctx.setLineDash([]);
    const tw = Math.min(w, h) * 0.16, th = Math.min(w, h) * 0.05;
    for (const [x, y, rot] of [[m * 2, m * 1.2, -0.5], [w - m * 2, m * 1.2, 0.5], [m * 2, h - m * 1.2, 0.5], [w - m * 2, h - m * 1.2, -0.5]] as const) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = color.replace(/[\d.]+\)$/, '0.45)'); ctx.fillRect(-tw / 2, -th / 2, tw, th); ctx.restore();
    }
  }
  ctx.restore();
}

/** Greedy word-wrap `text` to `maxWidth` using the ctx's current font. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (line && ctx.measureText(t).width > maxWidth) { lines.push(line); line = w; }
    else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

/** Draw the caption text centred, auto-sized to fit the frame, wrapped. */
function drawText(ctx: CanvasRenderingContext2D, text: string, w: number, h: number, fg: string, font: string, scale: number) {
  const maxW = w * 0.84;
  let size = Math.round(h * 0.095);
  let lines: string[] = [text];
  for (; size > 14; size -= 2) {
    ctx.font = `800 ${size}px ${font}`;
    lines = wrapText(ctx, text, maxW);
    const totalH = lines.length * size * 1.2;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (totalH <= h * 0.72 && widest <= maxW) break;
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const lh = size * 1.2, n = lines.length;
  ctx.save();
  ctx.translate(w / 2, h / 2); ctx.scale(scale, scale); ctx.translate(-w / 2, -h / 2);
  const startY = h / 2 - ((n - 1) / 2) * lh;
  const light = /^#f/i.test(fg);
  lines.forEach((ln, i) => {
    const y = startY + i * lh;
    if (light) { ctx.lineWidth = Math.max(2, size / 9); ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.strokeText(ln, w / 2, y); }
    ctx.fillStyle = fg; ctx.fillText(ln, w / 2, y);
  });
  ctx.restore();
}

/** Paint one script→reel frame (background + decorative pattern + caption +
 *  optional frame). Shared by the live preview and the export. */
export function paintScriptFrame(ctx: CanvasRenderingContext2D, scenes: ScriptScene[], movieT: number, w: number, h: number, styleId: string, frameId = 'none') {
  const style = scriptStyleById(styleId);
  const s = sceneAt(scenes, movieT);
  const bg = s?.bg ?? style.colors[0]!;
  const grad = ctx.createLinearGradient(0, 0, w * 0.4, h);
  grad.addColorStop(0, bg[0]); grad.addColorStop(1, bg[1]);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
  // Decorative "sketched" layer behind the text so it isn't a flat colour block.
  drawPattern(ctx, style.pattern, style.patternColor, w, h);
  if (s && s.text.trim()) {
    const dur = Math.max(0.01, s.endS - s.startS);
    const local = movieT - s.startS;
    const fade = Math.min(0.35, dur * 0.25);
    const alpha = clamp01(Math.min(local / fade, (dur - local) / fade));
    const scale = 1 + 0.03 * clamp01(local / dur);
    ctx.save(); ctx.globalAlpha = alpha;
    drawText(ctx, s.text, w, h, style.fg, style.font, scale);
    ctx.restore();
  }
  // Frame on top so it never gets covered by the pattern or text.
  drawFrame(ctx, frameId, w, h, /^#f|rgba\(2/i.test(style.fg) ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.7)');
}

export interface ScriptReelEncodeOpts {
  scenes: ScriptScene[];
  styleId: string;
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

async function mixAudio(opts: ScriptReelEncodeOpts, totalSec: number): Promise<AudioBuffer | undefined> {
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

export async function encodeScriptReel(opts: ScriptReelEncodeOpts): Promise<Blob> {
  const { scenes, fps, onProgress, shouldStop } = opts;
  const w = even(opts.w), h = even(opts.h);
  const totalSec = scenes.length ? scenes[scenes.length - 1]!.endS : 0;
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
    paintScriptFrame(ctx, scenes, (i + 0.5) / fps, w, h, opts.styleId);
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
