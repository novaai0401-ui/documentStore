/**
 * Live gated-access handshake — the multi-peer wiring that turns the proven
 * crypto cores (keyExchange + gatedAccess) into a working invite-only join over
 * the relay. The room key is NEVER put in the link; a token-only link gets the
 * joiner onto a dedicated control channel ("${roomId}:gate") where it sends an
 * ephemeral ECDH join-request. The host listens there, runs admit() + wrap, and
 * broadcasts a grant (room key wrapped for that one device) or a denial. A
 * forwarded token is bound to another device → denied, and even the relay only
 * ever sees ciphertext it cannot unwrap.
 *
 * The control frames are plaintext JSON (the secret they carry is ECDH-wrapped),
 * and ride a separate channel from the document so they never collide with the
 * room-key-encrypted edit traffic. The transport is injectable, so the whole
 * handshake is unit-tested end-to-end in Node over an in-memory transport pair.
 */
import { makeTransport } from './config.js';
import type { Transport } from './transport.js';
import type { Invite, AdmitReason } from './invites.js';
import { generateEcdhPair, type EcdhPair } from './keyExchange.js';
import {
  makeJoinRequest, hostHandleJoin, joinerAcceptGrant,
  type JoinRequest, type KeyGrant, type JoinDenied,
} from './gatedAccess.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
type GateFrame = JoinRequest | KeyGrant | JoinDenied;

/** The control-channel room id — separate from the document room so the handshake
 *  (plaintext + ECDH-wrapped) never mixes with the room-key-encrypted edits. */
export const gateRoomId = (roomId: string): string => `${roomId}:gate`;

const pack = (f: GateFrame): Uint8Array => enc.encode(JSON.stringify(f));
const unpack = (d: Uint8Array): GateFrame | null => {
  try { return JSON.parse(dec.decode(d)) as GateFrame; } catch { return null; }
};

export type TransportFactory = (room: string) => Transport;
const defaultFactory: TransportFactory = (room) => makeTransport(room);

export interface GateHostHandle { close(): void }

/**
 * Host side: listen on the gate channel for join-requests and answer each with a
 * wrapped key grant (admitted) or a denial (unknown / revoked / forwarded token).
 * Invites are held in a local copy and handling is serialized, so concurrent
 * requests bind to devices without racing; every change is reported via
 * onInvitesChange so the caller can persist it.
 */
export function hostGate(opts: {
  roomId: string;
  /** The room's exported AES key (base64) — handed only to admitted devices. */
  roomKeyB64: string;
  hostPair: EcdhPair;
  invites: Invite[];
  onInvitesChange?: (invites: Invite[]) => void;
  onResolved?: (r: { req: JoinRequest; admitted: boolean; reason?: AdmitReason }) => void;
  transportFactory?: TransportFactory;
}): GateHostHandle {
  const factory = opts.transportFactory ?? defaultFactory;
  const transport = factory(gateRoomId(opts.roomId));
  let invites = opts.invites;
  let chain: Promise<void> = Promise.resolve(); // serialize to avoid device-bind races
  transport.onMessage((data) => {
    const frame = unpack(data);
    if (!frame || frame.kind !== 'join-request') return; // ignore our own grants/denials
    chain = chain.then(async () => {
      const res = await hostHandleJoin(invites, opts.roomKeyB64, opts.hostPair, frame);
      invites = res.invites;
      opts.onInvitesChange?.(invites);
      if (res.grant) transport.send(pack(res.grant));
      if (res.denied) transport.send(pack(res.denied));
      opts.onResolved?.({ req: frame, admitted: !!res.grant, reason: res.denied?.reason });
    });
  });
  return { close: () => transport.close() };
}

export type JoinFailReason = AdmitReason | 'timeout';
export type JoinResult = { ok: true; roomKeyB64: string } | { ok: false; reason: JoinFailReason };

/**
 * Joiner side: present a token on the gate channel and wait for the host to wrap
 * the room key for this device. Resolves with the room key on admit, or a reason
 * on denial / timeout. The request is re-sent a few times so it survives the
 * host's listener attaching late or the relay connecting a beat after us.
 */
export async function requestJoin(opts: {
  roomId: string;
  token: string;
  deviceId: string;
  timeoutMs?: number;
  transportFactory?: TransportFactory;
}): Promise<JoinResult> {
  const factory = opts.transportFactory ?? defaultFactory;
  const pair = await generateEcdhPair();
  const transport = factory(gateRoomId(opts.roomId));
  return await new Promise<JoinResult>((resolve) => {
    let settled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const finish = (r: JoinResult) => {
      if (settled) return;
      settled = true;
      for (const t of timers) clearTimeout(t);
      transport.close();
      resolve(r);
    };
    transport.onMessage((data) => {
      const frame = unpack(data);
      if (!frame) return;
      if (frame.kind === 'key-grant' && frame.to === opts.deviceId) {
        void joinerAcceptGrant(pair, frame)
          .then((roomKeyB64) => finish({ ok: true, roomKeyB64 }))
          .catch(() => { /* not really our grant — ignore and keep waiting */ });
      } else if (frame.kind === 'join-denied' && frame.to === opts.deviceId) {
        finish({ ok: false, reason: frame.reason });
      }
    });
    const req = makeJoinRequest(opts.token, pair.publicKey, opts.deviceId);
    const send = () => { if (!settled) transport.send(pack(req)); };
    send();
    timers.push(setTimeout(send, 800));
    timers.push(setTimeout(send, 2500));
    timers.push(setTimeout(() => finish({ ok: false, reason: 'timeout' }), opts.timeoutMs ?? 20_000));
  });
}
