/**
 * Invite-only room access protocol — ties together admit() (who's allowed) and
 * the ECDH key exchange (how the room key is delivered). The host never puts the
 * key in the link; a joiner sends a join-request (token + ephemeral public key),
 * the host admits or denies, and on admit wraps the room key just for that joiner.
 * A forwarded link carries a token already bound to another device → denied, no
 * grant, so it can never obtain (or decrypt) the room key.
 *
 * Fully unit-tested end-to-end in Node (WebCrypto). The live wiring (sending these
 * messages over the relay, host listening) is the remaining multi-peer integration.
 */
import { admit, type Invite, type AdmitReason } from './invites.js';
import { deriveSharedKey, wrapRoomKey, unwrapRoomKey, type EcdhPair } from './keyExchange.js';

export interface JoinRequest { kind: 'join-request'; token: string; pubKey: string; deviceId: string }
export interface KeyGrant { kind: 'key-grant'; to: string; hostPub: string; wrapped: string }
export interface JoinDenied { kind: 'join-denied'; to: string; reason: AdmitReason }

export function makeJoinRequest(token: string, pubKey: string, deviceId: string): JoinRequest {
  return { kind: 'join-request', token, pubKey, deviceId };
}

/**
 * Host side: decide on a join-request. On admit, binds the token to the device and
 * returns a key grant wrapped for that joiner; otherwise returns a denial. The
 * caller persists the returned `invites` and broadcasts grant/denied.
 */
export async function hostHandleJoin(invites: Invite[], roomKeyB64: string, hostPair: EcdhPair, req: JoinRequest): Promise<{ invites: Invite[]; grant?: KeyGrant; denied?: JoinDenied }> {
  const res = admit(invites, req.token, req.deviceId);
  if (!res.ok) return { invites: res.invites, denied: { kind: 'join-denied', to: req.deviceId, reason: res.reason } };
  const shared = await deriveSharedKey(hostPair.privateKey, req.pubKey);
  const wrapped = await wrapRoomKey(shared, roomKeyB64);
  return { invites: res.invites, grant: { kind: 'key-grant', to: req.deviceId, hostPub: hostPair.publicKey, wrapped } };
}

/** Joiner side: turn a grant into the room key (throws if it isn't really for us). */
export async function joinerAcceptGrant(joinerPair: EcdhPair, grant: KeyGrant): Promise<string> {
  const shared = await deriveSharedKey(joinerPair.privateKey, grant.hostPub);
  return unwrapRoomKey(shared, grant.wrapped);
}
