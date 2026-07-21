/**
 * Script → reel — type a few lines and get a captioned text-video (no footage
 * needed): each sentence becomes a styled scene with big auto-fitted captions,
 * over a gradient, with music and an optional voice-over you record by reading
 * the on-screen teleprompter. A "read aloud" button uses the browser's built-in
 * speech for a quick pacing preview. Exports a shareable MP4, all on-device.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TkxButton, TkxSelect } from 'tekivex-ui';
import { t, useLang } from '../../i18n.js';
import { outputDims } from './video.js';
import { formatDuration } from './record.js';
import { PLATFORM_PRESETS, platformPresetById, matchPreset } from './platformPresets.js';
import { MicButton } from './MicButton.js';
import { MUSIC_MOODS, generateMusic } from './musicGen.js';
import { startVoiceOver, type VoiceRecording } from './voiceOver.js';
import { SCRIPT_STYLES, SCRIPT_FRAMES, buildScenes, scenesDuration } from './scriptReel.js';
import { paintScriptFrame } from './scriptReelEncode.js';
import { recordCanvasVideo, recorderExt, canRecordCanvas } from './canvasRecord.js';
import { isAiScriptEnabled, generateReelScript } from './aiScript.js';

const PREVIEW_FPS = 30;

/** Languages offered for AI script generation (India-first, plus English). */
const AI_SCRIPT_LANGS = ['English', 'Hinglish', 'Hindi', 'Marathi', 'Tamil', 'Telugu', 'Bengali', 'Gujarati', 'Kannada', 'Punjabi'];

export function ScriptReelModal({ onClose, initialScript = '' }: { onClose: () => void; initialScript?: string }) {
  const lang = useLang();
  const [script, setScript] = useState(initialScript);
  const [styleId, setStyleId] = useState('auto');
  const [frameId, setFrameId] = useState('none');
  const [aspect, setAspect] = useState<'source' | '9:16' | '1:1' | '16:9'>('9:16');
  const [maxW, setMaxW] = useState(1920);
  const [music, setMusic] = useState<File | null>(null);
  const [musicMood, setMusicMood] = useState<string | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [voice, setVoice] = useState<File | null>(null);
  const [recSecs, setRecSecs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string; blob: Blob } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  // AI script writing (server-side Groq proxy; button hidden when not configured).
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiLang, setAiLang] = useState('English');
  const [aiBusy, setAiBusy] = useState(false);

  const musicRef = useRef<HTMLInputElement | null>(null);
  const recRef = useRef<VoiceRecording | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const stopRef = useRef(false);

  const scenes = useMemo(() => buildScenes(script, styleId), [script, styleId]);
  const total = scenesDuration(scenes);
  const dims = useMemo(() => outputDims(1080, 1920, aspect === 'source' ? '9:16' : aspect, maxW), [aspect, maxW]);
  const presetId = matchPreset(aspect === 'source' ? '9:16' : aspect, maxW);

  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);
  useEffect(() => () => { recRef.current?.cancel(); if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }, []);
  // Probe once whether the server has an AI key configured.
  useEffect(() => {
    const ctrl = new AbortController();
    void isAiScriptEnabled(ctrl.signal).then(setAiEnabled).catch(() => setAiEnabled(false));
    return () => ctrl.abort();
  }, []);

  const writeWithAi = useCallback(async () => {
    if (!aiTopic.trim() || aiBusy) return;
    setAiBusy(true); setErr(null);
    try {
      const text = await generateReelScript(aiTopic, { language: aiLang, lines: 5 });
      setScript(text);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not write the script.');
    } finally {
      setAiBusy(false);
    }
  }, [aiTopic, aiLang, aiBusy]);

  // ── Built-in music ──
  const pickMood = useCallback(async (moodId: string) => {
    setErr(null); setMusicMood(moodId); setGenBusy(true);
    try { setMusic(await generateMusic(moodId)); } catch { setErr('Could not prepare the music.'); setMusicMood(null); } finally { setGenBusy(false); }
  }, []);
  const musicValue = musicMood ?? (music ? 'file' : 'none');
  const onMusicChange = (v: string) => {
    if (v === 'none') { setMusic(null); setMusicMood(null); }
    else if (v === 'file') { setMusicMood(null); musicRef.current?.click(); }
    else void pickMood(v);
  };

  // ── Voice-over (teleprompter) ──
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
    try { setVoice(await r.stop()); } catch (e) { setErr(e instanceof Error ? e.message : 'Recording failed.'); }
  }, []);

  const readAloud = () => {
    if (!('speechSynthesis' in window)) { setErr('Read-aloud isn’t supported in this browser.'); return; }
    window.speechSynthesis.cancel();
    if (script.trim()) window.speechSynthesis.speak(new SpeechSynthesisUtterance(script));
  };

  // ── Live preview ──
  const drawAt = useCallback((movieT: number) => {
    const cv = canvasRef.current; if (!cv) return;
    const { w, h } = dims;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const ctx = cv.getContext('2d'); if (!ctx) return;
    paintScriptFrame(ctx, scenes, movieT, w, h, styleId, frameId);
  }, [dims, scenes, styleId, frameId]);
  useEffect(() => {
    if (!playing || total <= 0) { cancelAnimationFrame(rafRef.current); drawAt(0); return; }
    startRef.current = performance.now();
    const tick = () => { drawAt(((performance.now() - startRef.current) / 1000) % total); rafRef.current = requestAnimationFrame(tick); };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, drawAt, total]);
  useEffect(() => { if (!playing) drawAt(0); }, [playing, drawAt]);

  // ── Export ──
  const exportReel = useCallback(async () => {
    if (!scenes.length) return;
    if (!canRecordCanvas()) { setErr('Making a video needs a newer browser (Chrome, Edge, or Safari 14.3+).'); return; }
    setPlaying(false); setBusy(true); setErr(null); setProgress('Preparing…'); stopRef.current = false;
    if (result) { URL.revokeObjectURL(result.url); setResult(null); }
    try {
      const { w, h } = dims;
      // Real-time capture with mixed audio — reliable on iOS (WebCodecs there is
      // video-only, so a voice-over would silently vanish and long clips crash).
      const blob = await recordCanvasVideo({
        w, h, fps: PREVIEW_FPS, durationSec: Math.max(1, total),
        draw: (c, t01) => paintScriptFrame(c, scenes, t01 * total, w, h, styleId, frameId),
        audio: [
          ...(voice ? [{ file: voice, gain: 1, loop: false }] : []),
          ...(music ? [{ file: music, gain: voice ? 0.32 : 0.85, loop: true }] : []),
        ],
        onProgress: setProgress, shouldStop: () => stopRef.current,
      });
      setResult({ url: URL.createObjectURL(blob), name: `reel.${recorderExt(blob.type)}`, blob });
      setProgress(null);
    } catch (e) {
      if (!(stopRef.current || (e instanceof Error && e.message === '__cancelled__'))) setErr(e instanceof Error ? e.message : 'Could not make the video.');
      setProgress(null);
    } finally { setBusy(false); }
  }, [scenes, styleId, frameId, dims, music, voice, result, total]);

  // Share/download the already-encoded Blob directly (no `await fetch` first) so
  // the user gesture stays active — otherwise iOS Safari blocks navigator.share
  // and the <a download> fallback navigates the page to the blob. See saveBlob.
  const download = async () => { if (!result) return; const { saveBlob } = await import('../smart/util.js'); await saveBlob(result.name, result.blob); };
  const canShareFiles = (() => { try { return typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [new File([], 'x.mp4', { type: 'video/mp4' })] }); } catch { return false; } })();
  const shareResult = async () => {
    if (!result) return;
    try {
      const file = new File([result.blob], result.name, { type: result.blob.type || 'video/mp4' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'My reel' });
      else await download();
    } catch (e) { if (!(e instanceof Error && e.name === 'AbortError')) setErr('Could not open the share sheet — use Download instead.'); }
  };

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner cmp-modal vid-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>✍️ Script → reel</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <p className="studio-hint">Type what you want to say — Pyntra turns each line into a captioned scene with music. No camera or footage needed. Read it aloud yourself for a voice-over.</p>

          {aiEnabled && (
            <div className="sr-ai-row">
              <input
                className="ve-cap-text sr-ai-topic"
                type="text"
                placeholder="Give a topic and let AI write it — e.g. 3 morning habits that changed my life"
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void writeWithAi(); } }}
                disabled={aiBusy}
              />
              <TkxSelect className="sr-ai-lang" size="sm" value={aiLang} options={AI_SCRIPT_LANGS.map((l) => ({ value: l, label: l }))} onChange={(v) => setAiLang(Array.isArray(v) ? v[0] : v)} />
              <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={aiBusy || !aiTopic.trim()} onClick={() => void writeWithAi()} title="Write a reel script with AI">{aiBusy ? '✨ Writing…' : '✨ Write with AI'}</TkxButton>
            </div>
          )}

          <span className="mic-wrap">
            <textarea className="ve-cap-text sr-script" rows={4} placeholder={'Write your script, one thought per line — or use “Write with AI” above. e.g.\n3 habits that changed my mornings.\nWater before coffee.\nA 5-minute walk.\nNo phone for 30 minutes.'} value={script} onChange={(e) => setScript(e.target.value)} />
            <MicButton onText={(v) => setScript((s) => (s ? `${s}\n${v}` : v))} title="Speak your script, line by line" />
          </span>

          {scenes.length > 0 && (
            <>
              <div className="ve-preview">
                <canvas ref={canvasRef} className="ve-preview-canvas" onClick={() => setPlaying((p) => !p)} title="Tap to play / pause" />
                <button className="ve-preview-play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying((p) => !p)}>{playing ? '⏸' : '▶'}</button>
                <span className="ve-preview-tag">{scenes.length} scenes · {formatDuration(total)}</span>
              </div>

              <div className="cmp-controls">
                <label className="cmp-ctrl cmp-ctrl--wide">Background
                  <TkxSelect size="sm" value={styleId} options={SCRIPT_STYLES.map((s) => ({ value: s.id, label: `${s.icon} ${s.label}` }))} onChange={(v) => setStyleId(v as string)} />
                </label>
                <label className="cmp-ctrl cmp-ctrl--wide">Frame
                  <TkxSelect size="sm" value={frameId} options={SCRIPT_FRAMES.map((f) => ({ value: f.id, label: `${f.icon} ${f.label}` }))} onChange={(v) => setFrameId(v as string)} />
                </label>
                <label className="cmp-ctrl cmp-ctrl--wide">Made for
                  <TkxSelect size="sm" value={presetId} options={[
                    ...PLATFORM_PRESETS.filter((p) => p.aspect !== 'source').map((p) => ({ value: p.id, label: `${p.icon} ${p.label}` })),
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
              </div>

              <div className="ve-section">
                <div className="ve-section-head">
                  <strong>🎙️ Voice-over (optional)</strong>
                  <span className="ve-head-acts">
                    <TkxButton variant="ghost" size="sm" onClick={readAloud}>🔊 Read aloud</TkxButton>
                    {recSecs === null
                      ? <TkxButton variant="outline" size="sm" onClick={() => void startRec()} disabled={busy}>{voice ? '↻ Record again' : '● Record'}</TkxButton>
                      : <TkxButton variant="solid" colorScheme="primary" size="sm" onClick={() => void stopRec()}>■ Stop · {formatDuration(recSecs)}</TkxButton>}
                  </span>
                </div>
                {recSecs !== null
                  ? <div className="sr-teleprompter">{script}</div>
                  : voice ? <div className="ve-voice-row"><span className="ve-voice-ok">✓ Voice-over added</span><button className="ve-ovl-x" title="Remove" onClick={() => setVoice(null)}>✕</button></div>
                    : <span className="cmp-row-note">Read your script aloud (it shows here as a teleprompter), or just add music. “Read aloud” speaks it in the browser voice for pacing.</span>}
              </div>
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
          <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy || scenes.length < 1} onClick={() => void exportReel()}>{busy ? 'Working…' : '🎬 Make my reel'}</TkxButton>
          {busy && <TkxButton variant="outline" size="sm" onClick={() => { stopRef.current = true; }}>Stop</TkxButton>}
          {result && canShareFiles && <TkxButton variant="solid" colorScheme="primary" size="sm" onClick={() => void shareResult()}>📤 Share</TkxButton>}
          {result && <TkxButton variant="outline" size="sm" onClick={() => void download()}>⤓ Download</TkxButton>}
          <TkxButton variant="ghost" size="sm" onClick={() => { stopRef.current = true; onClose(); }}>{t('act_close', lang)}</TkxButton>
        </div>
      </div>
    </div>
  );
}
