/**
 * Real-time canvas → video recorder (MediaRecorder + canvas.captureStream), with
 * mixed audio (voice + looped/ducked music) fed through a WebAudio
 * MediaStreamDestination.
 *
 * This is the RELIABLE cross-device path — especially on iOS Safari, where the
 * WebCodecs frame-by-frame encoder is memory-heavy (HD/long clips crash the tab,
 * which reloads and dumps you back on a draft) and its AudioEncoder is flaky
 * (voice silently vanishes). MediaRecorder streams to disk in real time (low
 * memory) and, on iOS, produces an mp4/H.264+AAC the Photos app plays with sound.
 * The whole recorded audio comes from ONE mixed MediaStream track, so there's no
 * separate audio-encode step that can fail. Nothing is uploaded.
 */

/** One audio layer to mix into the recording. */
export interface AudioLayer { file: File; gain: number; loop: boolean }

export interface CanvasRecordOpts {
  w: number;
  h: number;
  fps: number;
  durationSec: number;
  /** Paint one frame at normalized progress t01 (0→1). */
  draw: (ctx: CanvasRenderingContext2D, t01: number) => void;
  audio?: AudioLayer[];
  onProgress?: (msg: string) => void;
  shouldStop?: () => boolean;
}

/** Best MediaRecorder mimeType for this device — mp4 first (what iOS Safari
 *  makes and what shares/saves cleanly), then WebM for Chrome/Firefox/Android. */
export function bestRecorderMime(isSupported: (m: string) => boolean = (m) => {
  try { return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m); } catch { return false; }
}): string {
  const candidates = [
    // Safari (iOS + macOS) accepts ONLY mp4/H.264+AAC — list it first so iPhones
    // lock onto it. Chrome/Firefox skip past to a webm variant.
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm',
  ];
  for (const m of candidates) if (isSupported(m)) return m;
  return '';
}

export function recorderExt(mime: string): string { return /mp4/i.test(mime) ? 'mp4' : 'webm'; }

/** True where the recorder path can run (needs MediaRecorder + captureStream). */
export function canRecordCanvas(): boolean {
  return typeof MediaRecorder !== 'undefined'
    && typeof HTMLCanvasElement !== 'undefined'
    && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

/**
 * Record `durationSec` of the drawn canvas with mixed audio, returning the video
 * Blob. Real-time: it takes about `durationSec` to run (progress is reported).
 */
export async function recordCanvasVideo(opts: CanvasRecordOpts): Promise<Blob> {
  const { w, h, fps, durationSec, draw, audio = [], onProgress, shouldStop } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(w));
  canvas.height = Math.max(2, Math.round(h));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available on this device.');

  onProgress?.('Preparing…');
  draw(ctx, 0); // first frame so the stream starts non-blank

  const stream = canvas.captureStream(fps);

  // ── Mix the audio into the recorded stream ──
  // The AudioContext must be created + resumed inside the user gesture (this runs
  // synchronously from the "Make" tap) or iOS feeds a SILENT track. All layers go
  // through gains into ONE MediaStreamDestination whose track we add to the video
  // stream — recording the canvas stream alone is the #1 cause of "no sound".
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  let actx: AudioContext | null = null;
  const sources: AudioBufferSourceNode[] = [];
  const layers = audio.filter((a) => a.file);
  if (layers.length && AC) {
    actx = new AC();
    await actx.resume().catch(() => { /* */ });
    const dest = actx.createMediaStreamDestination();
    for (const layer of layers) {
      try {
        const buf = await actx.decodeAudioData(await layer.file.arrayBuffer());
        const src = actx.createBufferSource();
        src.buffer = buf; src.loop = layer.loop;
        const g = actx.createGain(); g.gain.value = Math.max(0, layer.gain);
        src.connect(g).connect(dest);
        sources.push(src);
      } catch { /* skip a track that won't decode rather than fail the whole render */ }
    }
    if (sources.length) for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);
    else { await actx.close().catch(() => { /* */ }); actx = null; }
  }

  const mime = bestRecorderMime();
  const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 6_000_000 });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise<void>((resolve) => { rec.onstop = () => resolve(); });
  // A timeslice keeps data flowing on iOS (some versions emit nothing until stop).
  rec.start(250);
  // Start the audio the instant recording begins, so nothing is clipped off the front.
  const t0 = actx ? actx.currentTime : 0;
  for (const src of sources) { try { src.start(t0); } catch { /* */ } }

  const totalMs = Math.max(500, durationSec * 1000);
  onProgress?.(`Recording your video… ${(totalMs / 1000).toFixed(0)}s`);
  await new Promise<void>((resolve) => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = now - start;
      if (shouldStop?.() || t >= totalMs) { cancelAnimationFrame(raf); resolve(); return; }
      draw(ctx, Math.min(1, t / totalMs));
      if (Math.round(t) % 500 < 20) onProgress?.(`Recording your video… ${Math.ceil((totalMs - t) / 1000)}s`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });

  onProgress?.('Finishing…');
  try { rec.requestData(); } catch { /* */ } // flush the last chunk before stopping
  try { rec.stop(); } catch { /* */ }
  await stopped;
  await actx?.close().catch(() => { /* */ });
  for (const t of stream.getTracks()) { try { t.stop(); } catch { /* */ } }

  if (shouldStop?.()) throw new Error('__cancelled__');
  const outType = (mime || chunks[0] && (chunks[0] as Blob).type || 'video/webm').split(';')[0];
  const blob = new Blob(chunks, { type: outType });
  if (!blob.size) throw new Error('The recording came out empty — please try again.');
  return blob;
}
