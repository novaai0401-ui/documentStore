/**
 * In-room chat — a CRDT-friendly message log for collaboration rooms. Messages
 * are immutable and keyed by id, so peers can merge their logs by union (no
 * conflicts) and everything rides the room's existing end-to-end-encrypted
 * channel — nothing is uploaded to a server in plaintext. Supports text, file/
 * media shares (a reference; the bytes transfer over the data channel), and
 * system notices. Pure and unit-tested; the UI/transport wire it up.
 */
import { randomToken } from './crypto.js';

export type ChatKind = 'text' | 'file' | 'system';

export interface ChatFile {
  name: string;
  size: number;
  mime: string;
  /** Either an inline `data:` URL (tiny files) or a `media:<fid>` pointer whose
   *  bytes are transferred in `parts` chunks under separate map keys. */
  ref: string;
  /** Number of chunks the media was split into (set for `media:` refs). */
  parts?: number;
}

export interface ChatMessage {
  id: string;
  authorId: string;   // stable peer/device id
  author: string;     // display name
  ts: number;
  kind: ChatKind;
  text: string;       // body for text/system; caption for file
  file?: ChatFile;
}

export function newMessage(author: string, authorId: string, text: string): ChatMessage {
  return { id: randomToken(8), authorId, author, ts: Date.now(), kind: 'text', text: text.slice(0, 4000) };
}

export function fileMessage(author: string, authorId: string, file: ChatFile, caption = ''): ChatMessage {
  return { id: randomToken(8), authorId, author, ts: Date.now(), kind: 'file', text: caption, file };
}

export function systemMessage(text: string): ChatMessage {
  return { id: randomToken(8), authorId: 'system', author: 'system', ts: Date.now(), kind: 'system', text };
}

/** Append a message, de-duplicating by id and keeping the log time-ordered. */
export function addMessage(log: ChatMessage[], m: ChatMessage): ChatMessage[] {
  return sortLog([...log.filter((x) => x.id !== m.id), m]);
}

/** Merge two peers' logs by union of ids (last-write-by-id wins) — CRDT-safe. */
export function mergeMessages(a: ChatMessage[], b: ChatMessage[]): ChatMessage[] {
  const by = new Map<string, ChatMessage>();
  for (const m of [...a, ...b]) by.set(m.id, m);
  return sortLog([...by.values()]);
}

const sortLog = (l: ChatMessage[]): ChatMessage[] => l.slice().sort((x, y) => x.ts - y.ts || (x.id < y.id ? -1 : 1));

/** Human-friendly file size. */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round((bytes / 1048576) * 10) / 10} MB`;
}

/** HH:MM for a message timestamp. */
export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Max base64 chars per media chunk — kept under the relay's 8 MiB per-frame cap
 *  so each chunk rides its own frame and any-size files transfer in pieces. */
export const MEDIA_CHUNK = 4 * 1024 * 1024;

/** Split a (base64 data URL) string into MEDIA_CHUNK-sized pieces; always ≥1. */
export function splitChunks(s: string, size = MEDIA_CHUNK): string[] {
  if (s.length <= size) return [s];
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}

/** Reassemble chunks in order; null if any piece is still missing. */
export function joinChunks(parts: (string | undefined)[]): string | null {
  if (!parts.length || parts.some((p) => p === undefined)) return null;
  return parts.join('');
}

/**
 * A peer's read high-water mark: the largest message ts that peer has seen.
 * Receipts live on their OWN map keys ('read:<deviceId>'), never on the message
 * object — embedding them would be clobbered by mergeMessages/LWW (last-write-by-id).
 */
export interface ReadCursor { ts: number }

/**
 * Delivery state of one of MY outgoing messages, WhatsApp-style:
 *  - 'sent'      — no other peer is in the room yet.
 *  - 'delivered' — peers are present but haven't read up to this message.
 *  - 'read'      — every other peer's read cursor has reached this message.
 * For messages I didn't author the value is irrelevant (TkxPeerChat only shows a
 * tick on the current user's own messages), so we return 'read' as a harmless default.
 * `cursors` maps peerId → that peer's read high-water-mark ts.
 */
export function deliveryFor(
  msg: ChatMessage,
  myId: string,
  peerIds: string[],
  cursors: Record<string, number>,
): 'sent' | 'delivered' | 'read' {
  if (msg.authorId !== myId) return 'read';
  const others = peerIds.filter((p) => p !== myId);
  if (others.length === 0) return 'sent';
  return others.every((p) => (cursors[p] ?? -1) >= msg.ts) ? 'read' : 'delivered';
}
