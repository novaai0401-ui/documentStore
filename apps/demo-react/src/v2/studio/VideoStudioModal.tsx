/**
 * Video Studio — trim, compress/convert, extract audio and make a GIF from a
 * local video, 100% in the browser. Clips/audio use native <video> +
 * captureStream + MediaRecorder (real-time re-encode, no upload, no heavy wasm);
 * GIFs use the bundled gifenc. Logic/helpers in video.ts. Local files only — no
 * site-downloading (that's a legal/technical non-starter; see the research).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { TkxButton, TkxSelect, TkxInput } from 'tekivex-ui';
import { t, useLang } from '../../i18n.js';
import { clampTrim, videoScale, gifFrameTimes, gifDelayCs, outputDims, coverSrcRect, type VideoAspect } from './video.js';
import { pickRecorderMime, extForMime, RECORDER_MIMES } from './record.js';
import { formatDuration } from './record.js';
import { wavEncode, sliceChannels, applyFades } from './audioWav.js';

type Op = 'trim' | 'gif' | 'audio';

export function VideoStudioModal({ onClose, initialFile, initialOp }: { onClose: () => void; initialFile?: File | null; initialOp?: Op }) {
  const lang = useLang();
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [url, setUrl] = useState<string | null>(null);
  const [dur, setDur] = useState(0);
  const [inS, setInS] = useState(0);
  const [outS, setOutS] = useState(0);
  const [op, setOp] = useState<Op>(initialOp ?? 'trim');
  const [maxW, setMaxW] = useState(1280);
  const [aspect, setAspect] = useState<VideoAspect>('source');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioMode, setAudioMode] = useState<'keep' | 'mix' | 'replace'>('keep');
  const [urlInput, setUrlInput] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlErr, setUrlErr] = useState<string | null>(null);
  const [vfmt, setVfmt] = useState<'auto' | 'mp4' | 'webm'>('auto');
  const [afmt, setAfmt] = useState<'wav' | 'webm'>('wav');
  const [afade, setAfade] = useState(true);
  const mp4Supported = typeof MediaRecorder !== 'undefined' && (MediaRecorder.isTypeSupported('video/mp4') || MediaRecorder.isTypeSupported('video/mp4;codecs=h264'));
  const [fps, setFps] = useState(12);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { if (file) { const u = URL.createObjectURL(file); setUrl(u); return () => URL.revokeObjectURL(u); } }, [file]);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  const onMeta = () => {
    const v = videoRef.current;
    if (!v) return;
    // MediaRecorder-made WebM (e.g. our own screen recordings) reports
    // duration: Infinity until you seek past the end — force the real value.
    if (!isFinite(v.duration)) {
      const fix = () => { if (isFinite(v.duration)) { v.removeEventListener('durationchange', fix); v.currentTime = 0; setDur(v.duration); setInS(0); setOutS(v.duration); } };
      v.addEventListener('durationchange', fix);
      v.currentTime = Number.MAX_SAFE_INTEGER;
      return;
    }
    setDur(v.duration); setInS(0); setOutS(v.duration);
  };

  /** Fast audio extraction: decode the file's audio track directly and write a
   *  WAV — instant (no real-time playback) and it opens anywhere. Throws when
   *  the browser can't decode this container; caller falls back to real-time. */
  const exportAudioWav = useCallback(async (): Promise<{ blob: Blob; ext: string }> => {
    const { in: a, out: b } = clampTrim(inS, outS, dur);
    setProgress('Reading the sound…');
    const actx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    try {
      const ab = await actx.decodeAudioData(await file!.arrayBuffer());
      const chans = Array.from({ length: ab.numberOfChannels }, (_, c) => ab.getChannelData(c));
      const sliced = sliceChannels(chans, ab.sampleRate, a, b);
      if (!sliced[0]?.length) throw new Error('No sound found in that part of the video.');
      if (afade) applyFades(sliced, ab.sampleRate, 0.35, 0.35); // no clicks at the cut points
      return { blob: new Blob([wavEncode(sliced, ab.sampleRate)], { type: 'audio/wav' }), ext: 'wav' };
    } finally { await actx.close().catch(() => { /* */ }); }
  }, [file, inS, outS, dur, afade]);

  // Import a DIRECT media URL (a .mp4/.webm/.mov/.mp3… link that allows cross-origin
  // reads). Platform pages (YouTube/TikTok) can't be fetched in-browser — they block
  // CORS and require a server — so we surface a clear message for those.
  const loadFromUrl = useCallback(async () => {
    const u = urlInput.trim();
    if (!u) return;
    setUrlBusy(true); setUrlErr(null);
    try {
      if (/youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|vimeo\.com\/\d/i.test(u)) {
        throw new Error('Platform pages (YouTube, TikTok, Instagram…) can’t be fetched in the browser — paste a direct video/audio file link (ending in .mp4, .webm, .mov, .mp3…).');
      }
      const res = await fetch(u, { mode: 'cors' });
      if (!res.ok) throw new Error(`Couldn’t fetch (${res.status}).`);
      const blob = await res.blob();
      if (!/^(video|audio)\//.test(blob.type) && !/\.(mp4|webm|mov|m4v|mkv|mp3|m4a|wav|ogg)(\?|$)/i.test(u)) {
        throw new Error('That link isn’t a direct video/audio file.');
      }
      const name = (u.split('/').pop() || 'video').split('?')[0] || 'video';
      setFile(new File([blob], name, { type: blob.type || 'video/mp4' }));
    } catch (e) {
      setUrlErr(e instanceof Error ? e.message : 'Could not load that URL. The site may block cross-origin access (CORS).');
    } finally { setUrlBusy(false); }
  }, [urlInput]);
  const trim = clampTrim(inS, outS, dur);
  const baseName = (file?.name ?? 'video').replace(/\.[^.]+$/, '') || 'video';

  // Trim/compress/convert → WebM via a (optionally scaled) canvas capture stream.
  const exportClip = useCallback(async (audioOnly: boolean): Promise<{ blob: Blob; ext: string }> => {
    const v = videoRef.current!;
    const { in: a, out: b } = clampTrim(inS, outS, dur);
    const videoCandidates = vfmt === 'mp4'
      ? ['video/mp4;codecs=h264,aac', 'video/mp4;codecs=avc1', 'video/mp4', ...RECORDER_MIMES]
      : vfmt === 'webm'
        ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
        : RECORDER_MIMES;
    const mime = pickRecorderMime((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m), audioOnly ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'] : videoCandidates);
    let stream: MediaStream;
    let raf = 0;
    const srcStream = (v as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.() ?? new MediaStream();

    // Build the audio track set: original (keep), original+added (mix), or added only (replace).
    let actx: AudioContext | null = null;
    let addedEl: HTMLAudioElement | null = null;
    const buildAudio = async (): Promise<MediaStreamTrack[]> => {
      const wantAdded = !!audioFile && (audioMode === 'mix' || audioMode === 'replace');
      if (audioMode === 'keep' || (!wantAdded && audioMode !== 'replace')) return srcStream.getAudioTracks();
      actx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      await actx.resume().catch(() => {});
      const dest = actx.createMediaStreamDestination();
      if (audioMode === 'mix') { const oa = srcStream.getAudioTracks(); if (oa.length) actx.createMediaStreamSource(new MediaStream(oa)).connect(dest); }
      if (wantAdded) { addedEl = new Audio(URL.createObjectURL(audioFile!)); addedEl.loop = true; actx.createMediaElementSource(addedEl).connect(dest); }
      return dest.stream.getAudioTracks();
    };

    if (audioOnly) {
      stream = new MediaStream(srcStream.getAudioTracks());
    } else {
      const sw0 = v.videoWidth || 640, sh0 = v.videoHeight || 360;
      const { w, h } = outputDims(sw0, sh0, aspect, maxW);
      const cr = coverSrcRect(sw0, sh0, w, h);
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      const cstream = canvas.captureStream(30);
      (await buildAudio()).forEach((t) => cstream.addTrack(t));
      stream = cstream;
      const paint = () => { ctx.drawImage(v, cr.sx, cr.sy, cr.sw, cr.sh, 0, 0, w, h); raf = requestAnimationFrame(paint); };
      paint();
    }
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    v.currentTime = a; await v.play();
    if (addedEl) { try { (addedEl as HTMLAudioElement).currentTime = 0; await (addedEl as HTMLAudioElement).play(); } catch { /* added audio best-effort */ } }
    rec.start();
    await new Promise<void>((res) => {
      const tick = () => { if (v.currentTime >= b || v.ended) { res(); return; } setProgress(`Encoding… ${formatDuration(v.currentTime - a)} / ${formatDuration(b - a)}`); requestAnimationFrame(tick); };
      tick();
    });
    rec.stop(); v.pause(); (addedEl as HTMLAudioElement | null)?.pause(); if (raf) cancelAnimationFrame(raf);
    await new Promise<void>((res) => { rec.onstop = () => res(); });
    if (actx) await (actx as AudioContext).close().catch(() => {});
    const type = chunks[0]?.type || (audioOnly ? 'audio/webm' : 'video/webm');
    return { blob: new Blob(chunks, { type }), ext: audioOnly ? (type.includes('mp4') ? 'm4a' : 'webm') : extForMime(type) };
  }, [inS, outS, dur, maxW, vfmt, aspect, audioFile, audioMode]);

  // Sample frames and encode a GIF with gifenc.
  const exportGif = useCallback(async (): Promise<{ blob: Blob; ext: string }> => {
    const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
    const v = videoRef.current!;
    const { in: a, out: b } = clampTrim(inS, outS, dur);
    const { w, h } = videoScale(v.videoWidth || 480, v.videoHeight || 270, Math.min(maxW, 640));
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const times = gifFrameTimes(a, b, fps);
    const delay = gifDelayCs(fps);
    const gif = GIFEncoder();
    const seek = (t: number) => new Promise<void>((res) => { const on = () => { v.removeEventListener('seeked', on); res(); }; v.addEventListener('seeked', on); v.currentTime = t; });
    v.pause();
    for (let i = 0; i < times.length; i++) {
      await seek(times[i]!);
      ctx.drawImage(v, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      const palette = quantize(data, 256);
      const index = applyPalette(data, palette);
      gif.writeFrame(index, w, h, { palette, delay });
      setProgress(`GIF frame ${i + 1} / ${times.length}`);
    }
    gif.finish();
    return { blob: new Blob([gif.bytes() as unknown as BlobPart], { type: 'image/gif' }), ext: 'gif' };
  }, [inS, outS, dur, fps, maxW]);

  const run = useCallback(async () => {
    if (!videoRef.current) return;
    setBusy(true); setProgress('Preparing…'); if (result) URL.revokeObjectURL(result.url); setResult(null);
    try {
      const { blob, ext } = op === 'gif'
        ? await exportGif()
        : op === 'audio' && afmt === 'wav'
          ? await exportAudioWav().catch(() => exportClip(true)) // container not decodable → real-time fallback
          : await exportClip(op === 'audio');
      setResult({ url: URL.createObjectURL(blob), name: `${baseName}-${op}.${ext}` });
    } catch (e) { setProgress(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }, [op, afmt, exportGif, exportClip, exportAudioWav, baseName, result]);

  const download = async () => { if (!result) return; const { saveBlob } = await import('../smart/util.js'); await saveBlob(result.name, await (await fetch(result.url)).blob()); };

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner cmp-modal vid-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>🎬 {t('m_video_title', lang)}</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <p className="studio-hint">Trim, compress, convert, extract audio, or make a GIF from your own video — entirely in your browser, nothing uploaded.</p>

          {!file && (
            <>
              <div className="cmp-drop" onClick={() => fileRef.current?.click()} role="button" tabIndex={0}>
                <span className="cmp-drop-icon" aria-hidden>🎬</span>
                <span>Choose a video file (MP4, WebM, MOV…), or <strong>browse</strong></span>
                <input ref={fileRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setFile(f); }} />
              </div>
              <div className="vid-url">
                <TkxInput label="Video or audio URL" type="url" className="vid-url-input" value={urlInput} placeholder="…or paste a direct video/audio URL (.mp4, .webm, .mp3)" onChange={(e) => setUrlInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void loadFromUrl(); }} />
                <TkxButton variant="outline" size="sm" disabled={urlBusy || !urlInput.trim()} onClick={() => void loadFromUrl()}>{urlBusy ? 'Loading…' : 'Load URL'}</TkxButton>
              </div>
              {urlErr && <span className="cmp-row-note cmp-row-note--warn">{urlErr}</span>}
              <span className="cmp-row-note">Tip: links from YouTube/TikTok/Instagram can’t be fetched in a browser (they block cross-origin and need a server). Paste a direct file link, or load a local file, then trim &amp; crop a short.</span>
            </>
          )}

          {url && (
            <>
              <video ref={videoRef} className="scan-video" src={url} controls onLoadedMetadata={onMeta} playsInline />
              {dur > 0 && (
                <div className="vid-trim">
                  <label className="cmp-ctrl cmp-ctrl--wide">
                    <span>Start <strong>{formatDuration(trim.in)}</strong></span>
                    <input type="range" min={0} max={dur} step={0.1} value={trim.in} onChange={(e) => setInS(Number(e.target.value))} />
                  </label>
                  <label className="cmp-ctrl cmp-ctrl--wide">
                    <span>End <strong>{formatDuration(trim.out)}</strong></span>
                    <input type="range" min={0} max={dur} step={0.1} value={trim.out} onChange={(e) => setOutS(Number(e.target.value))} />
                  </label>
                </div>
              )}
              <div className="cmp-controls">
                <label className="cmp-ctrl">Operation
                  <TkxSelect size="sm" value={op} options={[
                    { value: 'trim', label: 'Trim / compress → WebM' },
                    { value: 'gif', label: 'Make GIF' },
                    { value: 'audio', label: 'Extract audio' },
                  ]} onChange={(v) => setOp(v as Op)} />
                </label>
                {op !== 'audio' && (
                  <label className="cmp-ctrl">Max width
                    <TkxSelect size="sm" value={String(maxW)} options={[
                      { value: '1920', label: '1080p' }, { value: '1280', label: '720p' }, { value: '854', label: '480p' }, { value: '640', label: '360p' },
                    ]} onChange={(v) => setMaxW(Number(v))} />
                  </label>
                )}
                {op === 'trim' && (
                  <label className="cmp-ctrl">Shape
                    <TkxSelect size="sm" value={aspect} options={[
                      { value: 'source', label: 'Original' },
                      { value: '9:16', label: 'Short 9:16' },
                      { value: '1:1', label: 'Square 1:1' },
                      { value: '16:9', label: 'Wide 16:9' },
                    ]} onChange={(v) => setAspect(v as VideoAspect)} />
                  </label>
                )}
                {op === 'trim' && (
                  <label className="cmp-ctrl">Audio
                    <TkxSelect size="sm" value={audioMode} options={[
                      { value: 'keep', label: 'Original audio' },
                      { value: 'mix', label: 'Add music (mix)' },
                      { value: 'replace', label: 'Replace audio' },
                    ]} onChange={(v) => setAudioMode(v as 'keep' | 'mix' | 'replace')} />
                  </label>
                )}
                {op === 'trim' && audioMode !== 'keep' && (
                  <TkxInput className="cmp-ctrl" label={audioFile ? `🎵 ${audioFile.name.slice(0, 18)}` : 'Audio file'} type="file" accept="audio/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setAudioFile(f); }} />
                )}
                {op === 'trim' && (
                  <label className="cmp-ctrl">Format
                    <TkxSelect size="sm" value={vfmt} options={[
                      { value: 'auto', label: 'Auto' },
                      { value: 'mp4', label: mp4Supported ? 'MP4 (H.264)' : 'MP4 (unsupported)' },
                      { value: 'webm', label: 'WebM' },
                    ]} onChange={(v) => setVfmt(v as 'auto' | 'mp4' | 'webm')} />
                  </label>
                )}
                {op === 'audio' && (
                  <label className="cmp-ctrl">Format
                    <TkxSelect size="sm" value={afmt} options={[
                      { value: 'wav', label: 'WAV — plays anywhere, instant' },
                      { value: 'webm', label: 'WebM — small file' },
                    ]} onChange={(v) => setAfmt(v as 'wav' | 'webm')} />
                  </label>
                )}
                {op === 'audio' && afmt === 'wav' && (
                  <label className="cmp-ctrl">Edges
                    <TkxSelect size="sm" value={afade ? 'fade' : 'hard'} options={[
                      { value: 'fade', label: 'Smooth fade in and out' },
                      { value: 'hard', label: 'Keep as-is' },
                    ]} onChange={(v) => setAfade(v === 'fade')} />
                  </label>
                )}
                {op === 'gif' && (
                  <label className="cmp-ctrl">FPS
                    <TkxSelect size="sm" value={String(fps)} options={[{ value: '8', label: '8' }, { value: '12', label: '12' }, { value: '15', label: '15' }, { value: '24', label: '24' }]} onChange={(v) => setFps(Number(v))} />
                  </label>
                )}
                <TkxButton variant="ghost" size="sm" onClick={() => { setFile(null); setResult(null); setDur(0); }}>Change video</TkxButton>
              </div>
              {(op === 'trim' || (op === 'audio' && afmt === 'webm')) && <span className="cmp-row-note">Clips re-encode in real time, so a {formatDuration(trim.out - trim.in)} export takes about {formatDuration(trim.out - trim.in)}.</span>}
              {busy && progress && <div className="cmp-total">{progress}</div>}
              {result && (
                <div className="vid-result">
                  {op === 'gif' ? <img className="scan-video" src={result.url} alt="GIF preview" /> : op === 'audio' ? <audio src={result.url} controls /> : <video className="scan-video" src={result.url} controls />}
                  <span className="cmp-row-note">{result.name}</span>
                </div>
              )}
            </>
          )}
        </div>
        <div className="resume-foot">
          <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy || !url || dur === 0} onClick={() => void run()}>{busy ? 'Working…' : op === 'gif' ? 'Make GIF' : op === 'audio' ? 'Extract audio' : 'Export clip'}</TkxButton>
          {result && <TkxButton variant="outline" size="sm" onClick={() => void download()}>⤓ Download</TkxButton>}
          <TkxButton variant="ghost" size="sm" onClick={onClose}>{t('act_close', lang)}</TkxButton>
        </div>
      </div>
    </div>
  );
}
