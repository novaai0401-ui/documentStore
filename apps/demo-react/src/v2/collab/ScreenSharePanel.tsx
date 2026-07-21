/**
 * In-room SCREEN SHARING over the WebRTC mesh (rtc.ts). Audio/video calling is
 * parked for now — this panel only shares a screen (no camera/mic) and shows the
 * screens others are sharing. Optional recording hands the captured screen to the
 * Video Studio. Live tiles use raw <video srcObject> (tekivex-ui has no live-
 * stream tile primitive yet); controls use TkxButton.
 *
 * Note: like any WebRTC media, cross-network sharing (e.g. phone ↔ laptop) needs
 * a TURN relay to be configured; same-network sharing works without one.
 */
import { useEffect, useRef, useState } from 'react';
import { TkxButton } from 'tekivex-ui';
import { RtcMesh, gridDims, type Signal } from './rtc.js';
import { resolveIceServers, hasTurn } from './config.js';

function Tile({ stream, label }: { stream: MediaStream; label: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return (
    <div className="call-tile">
      <video ref={ref} autoPlay playsInline muted />
      <span className="call-tile-label">{label}</span>
    </div>
  );
}

export function ScreenSharePanel({ myId, sendSignal, registerIncoming, onClose, onRecorded }: {
  myId: string;
  sendSignal: (s: Signal) => void;
  registerIncoming: (h: (s: Signal) => void) => () => void;
  onClose: () => void;
  onRecorded?: (file: File) => void;
}) {
  const [remotes, setRemotes] = useState<{ id: string; stream: MediaStream }[]>([]);
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [sharing, setSharing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const meshRef = useRef<RtcMesh | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);

  useEffect(() => {
    const mesh = new RtcMesh(myId, sendSignal, {
      onRemoteStream: (id, stream) => setRemotes((r) => (r.find((x) => x.id === id) ? r.map((x) => (x.id === id ? { id, stream } : x)) : [...r, { id, stream }])),
      onPeerLeft: (id) => setRemotes((r) => r.filter((x) => x.id !== id)),
      onPeerFailed: () => setErr(hasTurn()
        ? 'Couldn’t connect to a participant — retrying as the network allows.'
        : 'Couldn’t establish the screen share — this network (often mobile/5G) needs a TURN relay to connect peers directly. Chat and live editing still work; a TURN server can be configured for the room.'),
    }, resolveIceServers());
    meshRef.current = mesh;
    const unsub = registerIncoming((s) => { void mesh.handleSignal(s); });
    mesh.announce();
    return () => { unsub(); mesh.leave(); localRef.current?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopShare = () => {
    if (recording) { recRef.current?.stop(); }
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    meshRef.current?.setLocalStream(null);
    setLocal(null);
    setSharing(false);
  };

  const startShare = async () => {
    if (sharing) { stopShare(); return; }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      localRef.current = stream;
      setLocal(stream);
      meshRef.current?.setLocalStream(stream);
      setSharing(true);
      // The browser's own "Stop sharing" control ends the track → tidy up.
      stream.getVideoTracks()[0]!.onended = () => stopShare();
    } catch { /* user cancelled the picker */ }
  };

  const record = () => {
    if (recording) { recRef.current?.stop(); return; }
    const s = localRef.current; if (!s) { setErr('Start sharing your screen first, then record.'); return; }
    try {
      const rec = new MediaRecorder(s);
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => { const blob = new Blob(chunks.current, { type: 'video/webm' }); onRecorded?.(new File([blob], 'screen-recording.webm', { type: 'video/webm' })); setRecording(false); };
      rec.start(); recRef.current = rec; setRecording(true);
    } catch { setErr('Recording is not supported here.'); }
  };

  const total = remotes.length + (local ? 1 : 0);
  const { cols } = gridDims(Math.max(1, total));

  // Collapsed pill — keeps the share + mesh alive while freeing the canvas.
  if (minimized) {
    return (
      <button className="call-fab" onClick={() => setMinimized(false)} title="Show screen share">
        🖥 {sharing ? 'Sharing' : 'Screen share'} · {total}
      </button>
    );
  }

  return (
    <aside className="call-panel" aria-label="Screen sharing">
      <div className="call-head">
        <strong>🖥 Screen share · {total} in room</strong>
        <span className="call-head-actions">
          <button className="brand-x" onClick={() => setMinimized(true)} aria-label="Minimize" title="Minimize — keeps sharing">–</button>
          <button className="brand-x" onClick={onClose} aria-label="Close">✕</button>
        </span>
      </div>
      <div className="call-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {/* Show a placeholder for our own share — NOT the live self-capture, which
            would recursively film this panel (the "infinity mirror"). Peers see it. */}
        {local && (
          <div className="call-tile call-tile--self">
            <span className="call-tile-self-msg">🖥 You’re sharing your screen<small>Others in the room can see it. Minimize this panel to keep working.</small></span>
          </div>
        )}
        {remotes.map((r) => <Tile key={r.id} stream={r.stream} label={`Guest ${r.id.slice(0, 4)}`} />)}
        {total === 0 && <p className="studio-hint">No one is sharing yet. Click “Share screen” to start, or wait for someone to share.</p>}
      </div>
      {err && <span className="cmp-row-note cmp-row-note--warn">{err}</span>}
      <div className="call-controls">
        <TkxButton variant={sharing ? 'solid' : 'outline'} colorScheme={sharing ? 'primary' : undefined} size="sm" onClick={() => void startShare()}>{sharing ? '🛑 Stop sharing' : '🖥 Share screen'}</TkxButton>
        <TkxButton variant={recording ? 'solid' : 'outline'} colorScheme={recording ? 'danger' : undefined} size="sm" onClick={record}>{recording ? '⏹ Stop rec' : '⏺ Record'}</TkxButton>
        <TkxButton variant="ghost" size="sm" onClick={() => setMinimized(true)}>Minimize</TkxButton>
        <TkxButton variant="ghost" size="sm" onClick={onClose}>Leave</TkxButton>
      </div>
    </aside>
  );
}
