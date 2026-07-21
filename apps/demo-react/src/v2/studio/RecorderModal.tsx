/**
 * Screen & webcam recorder — capture your screen (with optional mic) or your
 * camera, preview it live, pause/resume, and download. Native getDisplayMedia /
 * getUserMedia + MediaRecorder; 100% local, nothing uploaded.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { TkxButton, TkxCheckbox } from 'tekivex-ui';
import { t, useLang } from '../../i18n.js';
import { pickRecorderMime, extForMime, formatDuration } from './record.js';

type Source = 'screen' | 'camera';
type Phase = 'idle' | 'countdown' | 'recording' | 'review';

export function RecorderModal({ onClose }: { onClose: () => void }) {
  const lang = useLang();
  const [source, setSource] = useState<Source>('screen');
  const [mic, setMic] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [secs, setSecs] = useState(0);
  const [count, setCount] = useState(3);
  const [paused, setPaused] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [ext, setExt] = useState('webm');
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const liveRef = useRef<HTMLVideoElement | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  // getDisplayMedia exists only on desktop browsers — never on iOS/Android.
  const screenSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function';
  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  const cleanupStream = useCallback(() => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setLiveStream(null); stopTimer(); }, []);
  useEffect(() => () => { cleanupStream(); if (url) URL.revokeObjectURL(url); }, [cleanupStream, url]);

  // Attach the live stream to the preview <video> once it's actually mounted —
  // doing this in start() failed because the element renders only after the
  // phase flips to "recording".
  useEffect(() => {
    const v = liveRef.current;
    if (v && liveStream) { v.srcObject = liveStream; v.muted = true; v.play().catch(() => {}); }
  }, [liveStream, phase]);

  const beginRecording = useCallback((stream: MediaStream) => {
    const mime = pickRecorderMime((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
    setExt(extForMime(mime));
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'video/webm' });
      setUrl(URL.createObjectURL(blob));
      setPhase('review');
      cleanupStream();
    };
    rec.start(1000);
    recRef.current = rec;
    setSecs(0); setPaused(false);
    timerRef.current = window.setInterval(() => setSecs((s) => s + 1), 1000);
    setPhase('recording');
  }, [cleanupStream]);

  const acquire = useCallback(async (): Promise<MediaStream> => {
    if (source === 'screen') {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: true });
      if (mic) {
        try { const m = await navigator.mediaDevices.getUserMedia({ audio: true }); m.getAudioTracks().forEach((t) => display.addTrack(t)); } catch { /* mic optional */ }
      }
      display.getVideoTracks()[0]?.addEventListener('ended', () => stop());
      return display;
    }
    return navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: mic });
  }, [source, mic]);

  const start = useCallback(async () => {
    setErr(null);
    if (url) { URL.revokeObjectURL(url); setUrl(null); }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || (source === 'screen' && !navigator.mediaDevices.getDisplayMedia)) {
      setErr('Screen recording only works on a computer — no phone or tablet browser (iPhone or Android) can record the screen. On this device, use 📷 Camera instead, or your phone’s built-in screen recorder (iPhone: Control Center → Record).');
      return;
    }
    try {
      const stream = await acquire();
      streamRef.current = stream;
      setLiveStream(stream);
      // Brief countdown so the user can switch to what they want to capture.
      setCount(3); setPhase('countdown');
      let n = 3;
      const iv = window.setInterval(() => {
        n -= 1;
        if (n <= 0) { clearInterval(iv); beginRecording(stream); } else setCount(n);
      }, 1000);
    } catch (e) {
      setErr(e instanceof Error && /denied|Permission/i.test(e.message) ? 'Permission denied — allow screen/camera access and try again.' : (e instanceof Error ? e.message : 'Could not start recording.'));
      cleanupStream();
    }
  }, [url, source, acquire, beginRecording, cleanupStream]);

  const togglePause = useCallback(() => {
    const rec = recRef.current; if (!rec) return;
    if (rec.state === 'recording') { rec.pause(); setPaused(true); stopTimer(); }
    else if (rec.state === 'paused') { rec.resume(); setPaused(false); timerRef.current = window.setInterval(() => setSecs((s) => s + 1), 1000); }
  }, []);

  const stop = useCallback(() => { try { recRef.current?.stop(); } catch { /* */ } stopTimer(); }, []);

  const download = async () => { if (!url) return; const { saveBlob } = await import('../smart/util.js'); await saveBlob(`recording.${ext}`, await (await fetch(url)).blob()); };
  const reset = () => { if (url) URL.revokeObjectURL(url); setUrl(null); setPhase('idle'); setSecs(0); setPaused(false); };
  const close = () => { cleanupStream(); onClose(); };

  return (
    <div className="v2-modal" onClick={close}>
      <div className="v2-modal__inner cmp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>⏺ {t('m_record_title', lang)}</strong><button className="brand-x" onClick={close} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <p className="studio-hint">Record your screen or camera and download the video — captured and saved entirely in your browser, nothing uploaded.</p>

          {phase === 'idle' && (
            <>
              <div className="rec-sources">
                <button className={'rec-source' + (source === 'screen' ? ' on' : '')} onClick={() => setSource('screen')}><span>🖥</span> {t('cap_screen', lang)}</button>
                <button className={'rec-source' + (source === 'camera' ? ' on' : '')} onClick={() => setSource('camera')}><span>📷</span> {t('cap_camera', lang)}</button>
              </div>
              {/* Screen capture (getDisplayMedia) exists only on desktop browsers —
                  NO phone/tablet browser supports it (iOS Safari/Chrome/Firefox are
                  all WebKit and lack it). Say so up-front and point to Camera. */}
              {source === 'screen' && !screenSupported && (
                <span className="cmp-row-note" style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', color: '#92400e' }}>
                  📱 Screen recording only works on a <strong>computer</strong>. Phones &amp; tablets can’t record the screen from any browser. On this device, tap <strong>📷 Camera</strong> above — or use your phone’s built-in screen recorder (iPhone: Control Center → ⏺).
                </span>
              )}
              <TkxCheckbox label={t('cap_mic', lang)} checked={mic} onChange={(e) => setMic(e.target.checked)} />
              {err && <span className="cmp-row-note cmp-row-note--warn">{err}</span>}
            </>
          )}

          {(phase === 'countdown' || phase === 'recording') && (
            <div className="rec-live">
              <div className="rec-stage">
                <video ref={liveRef} className="scan-video" playsInline muted />
                {phase === 'countdown' && <div className="rec-countdown">{count}</div>}
              </div>
              {phase === 'recording' && (
                <div className="rec-status">
                  <span className={'rec-dot' + (paused ? ' rec-dot--paused' : '')} />
                  {paused ? 'Paused' : 'Recording'} · {formatDuration(secs)}
                </div>
              )}
            </div>
          )}

          {phase === 'review' && url && (
            <div className="rec-review">
              <video className="scan-video" src={url} controls />
              <span className="cmp-row-note">Recorded {formatDuration(secs)} · .{ext}</span>
            </div>
          )}
        </div>
        <div className="resume-foot">
          {phase === 'idle' && <TkxButton variant="solid" colorScheme="primary" size="sm" onClick={() => void start()}>⏺ {t('cap_start', lang)}</TkxButton>}
          {phase === 'countdown' && <TkxButton variant="ghost" size="sm" onClick={close}>{t('act_cancel', lang)}</TkxButton>}
          {phase === 'recording' && <>
            <TkxButton variant="solid" colorScheme="primary" size="sm" onClick={stop}>⏹ {t('cap_stop', lang)}</TkxButton>
            <TkxButton variant="outline" size="sm" onClick={togglePause}>{paused ? '▶ Resume' : '⏸ Pause'}</TkxButton>
          </>}
          {phase === 'review' && <>
            <TkxButton variant="solid" colorScheme="primary" size="sm" onClick={() => void download()}>⤓ {t('act_download', lang)} .{ext}</TkxButton>
            <TkxButton variant="outline" size="sm" onClick={reset}>{t('cap_retake', lang)}</TkxButton>
          </>}
          <TkxButton variant="ghost" size="sm" onClick={close}>{t('act_close', lang)}</TkxButton>
        </div>
      </div>
    </div>
  );
}
