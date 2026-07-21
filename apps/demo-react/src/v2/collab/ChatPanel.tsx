/**
 * In-room chat panel — uses Tekivex-ui's TkxPeerChat (peer message thread:
 * senders, attachments, reactions, presence) for the thread itself; our chat.ts
 * model maps onto its PeerMessage shape. Text + small files ride the room's
 * existing end-to-end-encrypted channel. Shown only when in a collaboration room.
 *
 * Tekivex-ui gap noted: there is no floating/minimisable "chat dock" wrapper, so
 * the positioned/collapsible container here is custom — a candidate TkxChatDock.
 */
import { useEffect, useRef, useState } from 'react';
import { TkxPeerChat, type PeerMessage, type PeerSender } from 'tekivex-ui';
import { humanSize, deliveryFor, type ChatMessage } from './chat.js';

// Cap for attachments. Files are now chunked across relay frames and reassembled
// on receipt (StudioEditor.sendChatFile), so any image/video/file delivers; the
// cap just protects memory / room-snapshot size. Images are also downscaled, so
// they're never pre-rejected on raw size.
const MAX_FILE = 60 * 1024 * 1024;

const kindFor = (mime: string): 'image' | 'video' | 'audio' | 'file' =>
  mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'file';

/** fid → assembled data URL (once all chunks arrive) + receive progress. */
type MediaMap = Record<string, { url?: string; have: number; need: number }>;

function toPeerMessages(log: ChatMessage[], myId: string, peerIds: string[], cursors: Record<string, number>, media: MediaMap): PeerMessage[] {
  return log.filter((m) => m.kind !== 'system').map((m) => {
    let attachments: PeerMessage['attachments'];
    let text = m.text || undefined;
    if (m.file) {
      const f = m.file;
      const att = (url: string) => [{ id: m.id + '-a', kind: kindFor(f.mime), name: f.name, url, mimeType: f.mime, size: f.size }];
      if (f.ref.startsWith('media:')) {
        const res = media[f.ref.slice(6)];
        if (res?.url) attachments = att(res.url);
        // Chunks still arriving → progress placeholder; resolves to the real
        // image/video/file once every part is in.
        else text = `${text ? text + ' ' : ''}📎 ${f.name} · receiving… (${res?.have ?? 0}/${res?.need ?? f.parts ?? 1})`;
      } else {
        attachments = att(f.ref); // inline data: URL (tiny/legacy)
      }
    }
    return {
      id: m.id,
      senderId: m.authorId,
      text,
      timestamp: new Date(m.ts),
      attachments,
      // Read receipts: only meaningful on my own messages (TkxPeerChat shows the
      // tick only for currentUserId); 'read' for others is ignored by the renderer.
      delivery: deliveryFor(m, myId, peerIds, cursors),
    };
  });
}

function sendersOf(log: ChatMessage[], myId: string): Record<string, PeerSender> {
  const s: Record<string, PeerSender> = { [myId]: { id: myId, name: 'You', presence: 'online' } };
  for (const m of log) if (!s[m.authorId]) s[m.authorId] = { id: m.authorId, name: m.author, presence: 'online' };
  return s;
}

export function ChatPanel({ log, myId, peerIds, cursors, media, onSend, onSendFile, onMarkRead }: {
  log: ChatMessage[];
  myId: string;
  /** Ids of the other peers currently in the room (for delivered/read state). */
  peerIds: string[];
  /** peerId → that peer's read high-water-mark ts. */
  cursors: Record<string, number>;
  /** Reassembled chat attachments keyed by file id (+ receive progress). */
  media: MediaMap;
  onSend: (text: string) => void;
  onSendFile: (file: File) => void;
  /** Broadcast that I have read every message up to `ts`. */
  onMarkRead: (ts: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const seen = useRef(0);
  useEffect(() => { if (open) seen.current = log.length; }, [open, log.length]);

  // Read receipts: while the chat is open AND this tab is focused, tell peers we
  // have read up to the newest message we didn't author. Debounced so rapid
  // re-renders don't spam the CRDT map. A blurred/hidden tab does NOT mark read,
  // so the blue tick only appears once the recipient actually views the message.
  useEffect(() => {
    if (!open) return;
    const incoming = log.filter((m) => m.authorId !== myId && m.kind !== 'system');
    if (!incoming.length) return;
    const maxTs = incoming.reduce((mx, m) => Math.max(mx, m.ts), 0);
    const t = setTimeout(() => { if (document.hasFocus()) onMarkRead(maxTs); }, 300);
    return () => clearTimeout(t);
  }, [open, log, myId, onMarkRead]);

  if (!open) {
    const unread = Math.max(0, log.length - seen.current);
    return <button className="chat-fab" onClick={() => setOpen(true)} title="Open chat">💬{unread ? <span className="chat-fab-n">{unread}</span> : null}</button>;
  }

  const attach = (files: File[]) => {
    // Images are downscaled by the sender, so don't pre-reject them on raw size;
    // other files must fit the relay frame. Oversized non-images fail with a
    // visible notice instead of vanishing on the wire.
    const tooBig = files.filter((f) => !f.type.startsWith('image/') && f.size > MAX_FILE);
    const ok = files.filter((f) => f.type.startsWith('image/') || f.size <= MAX_FILE);
    setErr(tooBig.length ? `Files over ${humanSize(MAX_FILE)} can't be shared in chat — send a link instead.` : null);
    ok.forEach(onSendFile);
  };

  return (
    <aside className="chat-panel" aria-label="Room chat">
      <div className="chat-head"><strong>💬 Room chat</strong><button className="brand-x" onClick={() => setOpen(false)} aria-label="Minimize">–</button></div>
      <TkxPeerChat
        messages={toPeerMessages(log, myId, peerIds, cursors, media)}
        senders={sendersOf(log, myId)}
        currentUserId={myId}
        onSend={(text) => { const t = text.trim(); if (t) onSend(t); }}
        onAttach={attach}
        height="100%"
        placeholder="Message the room…"
        groupConsecutive
        showTimeSeparators
      />
      {/* System notices (e.g. "file too large to share") — the thread itself
          hides kind:'system', so surface the latest few here instead of failing
          silently. */}
      {log.filter((m) => m.kind === 'system').slice(-2).map((m) => (
        <span key={m.id} className="chat-sys" style={{ padding: '2px 10px' }}>{m.text}</span>
      ))}
      {err && <span className="cmp-row-note cmp-row-note--warn" style={{ padding: '4px 10px' }}>{err}</span>}
    </aside>
  );
}
