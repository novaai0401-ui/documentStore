/**
 * Chooses how collaboration travels. Collaboration always works across tabs on
 * one device (BroadcastChannel). For cross-device editing it also connects a
 * WebSocket relay, resolved in this order:
 *   1. an explicit relay — build-time `VITE_COLLAB_RELAY` or, for ad-hoc testing,
 *      `localStorage['pdfcraft:relay']`;
 *   2. otherwise the same origin the app is served from (so when pdfcraft is
 *      deployed by its Node server — which serves the app AND the relay — sharing
 *      works across devices with zero configuration).
 * If no relay is reachable (e.g. a static host with no server), the WebSocket
 * simply never connects and collaboration stays same-device; the UI reflects the
 * real state via the transport's status.
 */
import { broadcastTransport, combinedTransport, type Transport } from './transport.js';

export { broadcastTransport };

/** An explicitly configured relay URL, if any. */
export function explicitRelayUrl(): string | null {
  try {
    const ls = globalThis.localStorage?.getItem('pdfcraft:relay');
    if (ls) return ls;
  } catch { /* no storage (SSR / privacy mode) */ }
  try {
    const env = (import.meta as { env?: Record<string, string | undefined> }).env;
    return env?.VITE_COLLAB_RELAY ?? null;
  } catch { return null; }
}

/** The same origin the page is served from, as a ws(s):// relay URL. */
export function sameOriginRelayUrl(): string | null {
  try {
    const loc = globalThis.location;
    if (!loc?.host || (loc.protocol !== 'http:' && loc.protocol !== 'https:')) return null;
    return (loc.protocol === 'https:' ? 'wss://' : 'ws://') + loc.host;
  } catch { return null; }
}

/** The relay we'll attempt: an explicit one if set, else the same origin. */
export function resolveRelayUrl(): string | null {
  return explicitRelayUrl() ?? sameOriginRelayUrl();
}

/** Whether a relay is even worth attempting (used only as a hint; the live
 *  "Across devices" indicator is driven by the actual connection status). */
export function isCrossDevice(): boolean {
  return resolveRelayUrl() !== null;
}

export function makeTransport(room: string): Transport {
  return combinedTransport(room, resolveRelayUrl());
}

/** A configured TURN server, if any. Read from localStorage 'pdfcraft:turn'
 *  (a JSON RTCIceServer, or "urls|username|credential") or build-time
 *  VITE_TURN_URL / VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL. */
// A provider usually gives several endpoints (udp:80, tcp:443, tls:5349) — accept
// a comma-separated list and pass them all so the client tries each.
function parseUrls(u: string): string | string[] {
  const parts = u.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts : (parts[0] ?? u);
}

function readTurn(): RTCIceServer | null {
  try {
    const ls = globalThis.localStorage?.getItem('pdfcraft:turn');
    if (ls) {
      const s = ls.trim();
      if (s.startsWith('{')) return JSON.parse(s) as RTCIceServer;
      const [urls, username, credential] = s.split('|');
      if (urls) return { urls: parseUrls(urls), ...(username ? { username } : {}), ...(credential ? { credential } : {}) };
    }
  } catch { /* no storage */ }
  try {
    const env = (import.meta as { env?: Record<string, string | undefined> }).env;
    const urls = env?.VITE_TURN_URL;
    if (urls) return { urls: parseUrls(urls), ...(env?.VITE_TURN_USERNAME ? { username: env.VITE_TURN_USERNAME } : {}), ...(env?.VITE_TURN_CREDENTIAL ? { credential: env.VITE_TURN_CREDENTIAL } : {}) };
  } catch { /* no import.meta */ }
  return null;
}

/**
 * ICE servers for the WebRTC call mesh: always the public Google STUN, plus a
 * TURN relay when one is configured. TURN is what lets calls connect across
 * strict / mobile-carrier (CGNAT, symmetric) NATs where STUN-only candidates
 * never pair — the most common "I can see myself but not the other person"
 * cause. TURN only relays already-encrypted DTLS-SRTP packets, so media stays
 * end-to-end encrypted; the relay can't read or alter it.
 */
export function resolveIceServers(): RTCIceServer[] {
  const base: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  const turn = readTurn();
  return turn ? [...base, turn] : base;
}

/** Whether a TURN server is configured (so the UI can warn when it isn't and a
 *  cross-network call can't establish media). */
export function hasTurn(): boolean { return readTurn() !== null; }
