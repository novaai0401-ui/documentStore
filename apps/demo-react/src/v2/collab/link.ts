/**
 * Capability share-links. A link is an unguessable room id plus a one-time
 * encryption key plus a 24h expiry, all carried in the URL *fragment* so the key
 * never reaches a server. Holding the link is the access grant — there are no
 * accounts. The room id routes the (encrypted) traffic; the key decrypts it.
 */
import { generateKey, exportKey, randomToken } from './crypto.js';

/** Which editor a shared room opens in, so a joiner lands in the right surface. */
export type CollabKind = 'text' | 'word' | 'sheet' | 'slides' | 'design' | 'family';
const KINDS: readonly CollabKind[] = ['text', 'word', 'sheet', 'slides', 'design', 'family'];

export interface Room {
  roomId: string;
  /** Exported AES key (base64url) — lives only in the URL fragment. For a gated
   *  room this is empty in the link; the joiner obtains it from the host via the
   *  ECDH handshake (see gatedSession.ts) and fills it in before connecting. */
  key: string;
  /** Expiry epoch ms (default 24h from creation). */
  exp: number;
  /** Editor surface to open on join (default 'text'). */
  kind?: CollabKind;
  /** True when the link carries NO key and access is host-gated (invite-only):
   *  the room key is delivered per-device over the handshake, never in the URL. */
  gated?: boolean;
}

export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

/** Mint a fresh room: random id, random key, 24h expiry, and editor kind. */
export async function createRoom(kind: CollabKind = 'text', ttlMs = ROOM_TTL_MS): Promise<Room> {
  const key = await generateKey();
  return { roomId: randomToken(12), key: await exportKey(key), exp: Date.now() + ttlMs, kind };
}

/** Build the shareable URL. Room secrets go in the fragment (never sent to a server). */
export function buildShareUrl(origin: string, room: Room): string {
  const frag = new URLSearchParams({ room: room.roomId, key: room.key, exp: String(room.exp) });
  if (room.kind && room.kind !== 'text') frag.set('kind', room.kind);
  return `${origin.replace(/\/$/, '')}/app#${frag.toString()}`;
}

/**
 * Build a GATED (keyless) base URL — same room id/expiry/kind but NO key. Access
 * is granted per-device over the handshake, so a forwarded copy can never decrypt
 * the room even though it reaches the relay. Pair with inviteUrl() to append the
 * per-person token (see invites.ts).
 */
export function buildGatedUrl(origin: string, room: Room): string {
  const frag = new URLSearchParams({ room: room.roomId, exp: String(room.exp), g: '1' });
  if (room.kind && room.kind !== 'text') frag.set('kind', room.kind);
  return `${origin.replace(/\/$/, '')}/app#${frag.toString()}`;
}

/** Parse a room out of a URL (or a bare fragment). Returns null if absent/malformed. */
export function parseShareUrl(href: string): Room | null {
  const hash = href.includes('#') ? href.slice(href.indexOf('#') + 1) : href;
  if (!hash) return null;
  const p = new URLSearchParams(hash);
  const roomId = p.get('room');
  const key = p.get('key');
  const exp = Number(p.get('exp'));
  const gated = p.get('g') === '1';
  // A normal link must carry the key; a gated link must NOT (the key is delivered
  // per-device over the handshake), so either a key OR the gated marker is required.
  if (!roomId || !Number.isFinite(exp) || exp <= 0) return null;
  if (!key && !gated) return null;
  const rawKind = p.get('kind');
  const kind = KINDS.includes(rawKind as CollabKind) ? (rawKind as CollabKind) : 'text';
  return { roomId, key: key ?? '', exp, kind, ...(gated ? { gated: true } : {}) };
}

export const isExpired = (room: Room, now = Date.now()): boolean => now > room.exp;

/** Human-readable time left, e.g. "23h left" / "expired". */
export function timeLeft(room: Room, now = Date.now()): string {
  const ms = room.exp - now;
  if (ms <= 0) return 'expired';
  const h = Math.floor(ms / 3_600_000);
  if (h >= 1) return `${h}h left`;
  const m = Math.max(1, Math.floor(ms / 60_000));
  return `${m}m left`;
}
