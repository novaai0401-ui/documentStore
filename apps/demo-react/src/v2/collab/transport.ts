/**
 * Transport abstraction for collaboration. The session moves opaque (already
 * encrypted) byte messages; how they travel is pluggable:
 *
 *  - `broadcastTransport` uses BroadcastChannel — real-time co-editing across
 *    tabs/windows on the same machine, with no server at all. It's a complete,
 *    working transport for same-device collaboration and the demo substrate.
 *  - `memTransportPair` links two endpoints in memory (for tests).
 *
 * Cross-device / cross-country collaboration plugs a WebRTC or WebSocket relay
 * transport into this same interface (Phase 3b) — the session code is unchanged
 * because it only ever sees ciphertext in and out.
 */
/** Cross-device relay connectivity:
 *  - 'connecting' — the initial attempt window (no result yet);
 *  - 'online'     — a relay is connected (cross-device works);
 *  - 'offline'    — a configured relay has failed / dropped (we keep retrying),
 *    or there is no relay at all. The UI only warns about 'offline' when a relay
 *    is actually configured (see config.isCrossDevice), so a no-relay 'offline'
 *    is benign. */
export type RelayStatus = 'connecting' | 'online' | 'offline';

export interface Transport {
  send(data: Uint8Array): void;
  onMessage(cb: (data: Uint8Array) => void): void;
  close(): void;
  /** Optional: report relay connectivity. Subscribing replays the current status
   *  immediately. Transports without a relay report 'offline'. */
  onStatus?(cb: (status: RelayStatus) => void): void;
}

/** Same-origin cross-tab transport. Messages are scoped to a room channel and
 *  are never echoed back to the sender. */
export function broadcastTransport(room: string): Transport {
  const ch = new BroadcastChannel(`pdfcraft:collab:${room}`);
  let cb: ((d: Uint8Array) => void) | null = null;
  ch.onmessage = (e: MessageEvent) => { if (cb) cb(new Uint8Array(e.data as ArrayBuffer)); };
  return {
    send: (data) => ch.postMessage(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)),
    onMessage: (next) => { cb = next; },
    close: () => ch.close(),
  };
}

/** Two in-memory endpoints linked to each other; delivery is async (microtask)
 *  to mirror a real network. Used in tests. */
export function memTransportPair(): [Transport, Transport] {
  const cbs: Array<((d: Uint8Array) => void) | null> = [null, null];
  const make = (self: number, peer: number): Transport => ({
    send: (data) => { const copy = data.slice(); queueMicrotask(() => cbs[peer]?.(copy)); },
    onMessage: (next) => { cbs[self] = next; },
    close: () => { cbs[self] = null; },
  });
  return [make(0, 1), make(1, 0)];
}

/**
 * Cross-device transport over a WebSocket relay. The relay is a dumb,
 * zero-knowledge rebroadcaster (see collab-relay/server.mjs): the client joins a
 * room with a text control frame, then sends/receives binary frames that are
 * already end-to-end encrypted — the relay only forwards ciphertext to the other
 * room members. This is what makes two different machines (different countries)
 * co-edit; it implements the same Transport interface as the cross-tab one, so
 * the session code is identical.
 */
export function wsRelayTransport(url: string, room: string): Transport {
  let ws: WebSocket | null = null;
  let cb: ((d: Uint8Array) => void) | null = null;
  let statusCb: ((status: RelayStatus) => void) | null = null;
  let status: RelayStatus = 'connecting';
  let connected = false;
  let closedByUser = false;
  let attempts = 0;
  const MAX_BACKLOG = 256;
  // Mirrors the collaboration relay's per-frame cap (scripts/serve.mjs). Sending a
  // larger frame makes the relay destroy the whole socket, which would drop the
  // user to same-device for good — so we skip oversize frames locally instead.
  const MAX_FRAME = 8 << 20;
  const backlog: Uint8Array[] = [];

  const setStatus = (s: RelayStatus) => { connected = s === 'online'; if (status !== s) { status = s; statusCb?.(s); } };

  const connect = () => {
    if (closedByUser) return;
    try { ws = new WebSocket(url); } catch { setStatus('offline'); scheduleReconnect(); return; }
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      attempts = 0;
      ws!.send(JSON.stringify({ t: 'join', room }));
      for (const m of backlog) ws!.send(m);
      backlog.length = 0;
      setStatus('online');
    };
    ws.onmessage = (e: MessageEvent) => { if (cb && e.data instanceof ArrayBuffer) cb(new Uint8Array(e.data)); };
    ws.onclose = () => { setStatus('offline'); scheduleReconnect(); };
    ws.onerror = () => { try { ws?.close(); } catch { /* ignore */ } };
  };
  const scheduleReconnect = () => {
    if (closedByUser) return;
    // Retry forever with capped backoff: a relay that comes up late (e.g. a Render
    // free-plan cold start) or drops transiently must still recover. The previous
    // 8-attempt give-up left the page stuck same-device for the rest of its life.
    const delay = Math.min(16_000, 500 * 2 ** Math.min(attempts, 5));
    attempts++;
    setTimeout(connect, delay);
  };
  connect();

  return {
    send: (data) => {
      if (data.byteLength > MAX_FRAME) {
        // Too big for the relay; dropping it here keeps the socket alive (and
        // same-machine peers still receive it via BroadcastChannel). The sender-
        // side UI caps attachments well under this, so this only guards outliers
        // such as a very large pasted design image.
        if (typeof console !== 'undefined') console.warn('[collab] skipped oversize relay frame:', data.byteLength, 'bytes');
        return;
      }
      if (connected && ws && ws.readyState === WebSocket.OPEN) ws.send(data);
      else { backlog.push(data); if (backlog.length > MAX_BACKLOG) backlog.shift(); }
    },
    onMessage: (next) => { cb = next; },
    onStatus: (next) => { statusCb = next; next(status); },
    close: () => { closedByUser = true; try { ws?.close(); } catch { /* already closed */ } },
  };
}

/**
 * The transport collaboration actually uses: it always runs the same-origin
 * cross-tab channel AND, when a relay URL is given, a WebSocket relay — bridging
 * messages across both. That means same-device tabs co-edit even if the relay is
 * unreachable (static host), and different devices co-edit through the relay when
 * it's up. Duplicate deliveries (a same-device peer hearing a message on both
 * channels) are harmless: the CRDT is idempotent. Relay connectivity is surfaced
 * via onStatus so the UI can honestly say "This device" vs "Across devices".
 */
export function combinedTransport(room: string, relayUrl: string | null): Transport {
  const bc = broadcastTransport(room);
  const relay = relayUrl ? wsRelayTransport(relayUrl, room) : null;
  let cb: ((d: Uint8Array) => void) | null = null;
  bc.onMessage((d) => cb?.(d));
  relay?.onMessage((d) => cb?.(d));
  return {
    send: (data) => { bc.send(data); relay?.send(data); },
    onMessage: (next) => { cb = next; },
    onStatus: (next) => { if (relay?.onStatus) relay.onStatus(next); else next('offline'); },
    close: () => { bc.close(); relay?.close(); },
  };
}

