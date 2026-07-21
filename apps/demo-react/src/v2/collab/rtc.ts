/**
 * WebRTC mesh for in-room A/V (video, screen share, calls). Signalling
 * (offer/answer/ICE) rides the room's existing channel; each pair of peers forms
 * a direct, encrypted RTCPeerConnection (mesh — best for small rooms). The pure
 * helpers (envelope, glare-avoidance, grid layout) are unit-tested; RtcMesh is the
 * thin browser wrapper around RTCPeerConnection + getUserMedia/getDisplayMedia.
 *
 * Honest limits: a mesh suits ~2–6 people; bigger calls want an SFU. Cross-network
 * peers need a TURN server (STUN-only fails on strict NATs) — configurable below.
 */

export type SignalKind = 'offer' | 'answer' | 'ice' | 'bye' | 'hello';
export interface Signal { from: string; to: string; kind: SignalKind; payload?: string }

export function encodeSignal(s: Signal): string { return JSON.stringify(s); }
export function decodeSignal(raw: string): Signal | null {
  try { const s = JSON.parse(raw); return s && typeof s.from === 'string' && typeof s.to === 'string' && typeof s.kind === 'string' ? s as Signal : null; }
  catch { return null; }
}

/** Deterministic glare avoidance: the peer with the smaller id creates the offer,
 *  so two peers never both offer at once. */
export function initiatesTo(myId: string, peerId: string): boolean { return myId < peerId; }

/** Balanced grid (cols×rows) for `n` video tiles. */
export function gridDims(n: number): { cols: number; rows: number } {
  if (n <= 1) return { cols: 1, rows: 1 };
  const cols = Math.ceil(Math.sqrt(n));
  return { cols, rows: Math.ceil(n / cols) };
}

export const DEFAULT_ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

export interface RtcHandlers {
  onRemoteStream: (peerId: string, stream: MediaStream) => void;
  onPeerLeft: (peerId: string) => void;
  /** A peer connection failed to establish (often a strict NAT with no TURN). */
  onPeerFailed?: (peerId: string) => void;
}

/** Browser-only mesh manager. Transport-agnostic: you supply `send` (to the room)
 *  and feed it signals via handleSignal. */
export class RtcMesh {
  private peers = new Map<string, RTCPeerConnection>();
  private local: MediaStream | null = null;
  /** ICE candidates that arrived before the remote description, per peer. */
  private pendingIce = new Map<string, RTCIceCandidateInit[]>();
  constructor(
    private myId: string,
    private send: (s: Signal) => void,
    private handlers: RtcHandlers,
    private ice: RTCIceServer[] = DEFAULT_ICE,
  ) {}

  setLocalStream(stream: MediaStream | null): void {
    this.local = stream;
    for (const pc of this.peers.values()) this.syncTracks(pc);
  }

  /** Announce ourselves so existing peers connect back. */
  announce(): void { this.send({ from: this.myId, to: '*', kind: 'hello' }); }

  private syncTracks(pc: RTCPeerConnection): void {
    const have = new Set(pc.getSenders().map((s) => s.track));
    if (this.local) for (const t of this.local.getTracks()) if (!have.has(t)) pc.addTrack(t, this.local);
  }

  private ensurePeer(peerId: string): RTCPeerConnection {
    let pc = this.peers.get(peerId);
    if (pc) return pc;
    pc = new RTCPeerConnection({ iceServers: this.ice });
    pc.onicecandidate = (e) => { if (e.candidate) this.send({ from: this.myId, to: peerId, kind: 'ice', payload: JSON.stringify(e.candidate) }); };
    pc.ontrack = (e) => { if (e.streams[0]) this.handlers.onRemoteStream(peerId, e.streams[0]); };
    pc.onconnectionstatechange = () => {
      const st = pc!.connectionState;
      if (st === 'failed') this.handlers.onPeerFailed?.(peerId);
      if (['failed', 'closed', 'disconnected'].includes(st)) this.removePeer(peerId);
    };
    this.peers.set(peerId, pc);
    this.syncTracks(pc);
    return pc;
  }

  private async offer(peerId: string): Promise<void> {
    const pc = this.ensurePeer(peerId);
    // Don't re-offer a pair that's already negotiating (e.g. two hellos arrive) —
    // a second offer mid-negotiation causes glare and breaks the connection.
    if (pc.signalingState !== 'stable') return;
    const sdp = await pc.createOffer();
    await pc.setLocalDescription(sdp);
    this.send({ from: this.myId, to: peerId, kind: 'offer', payload: JSON.stringify(sdp) });
  }

  /** Apply any ICE candidates buffered before the remote description arrived. */
  private async flushIce(peerId: string, pc: RTCPeerConnection): Promise<void> {
    const q = this.pendingIce.get(peerId);
    if (!q) return;
    this.pendingIce.delete(peerId);
    for (const c of q) { try { await pc.addIceCandidate(c); } catch { /* stale candidate */ } }
  }

  /** Feed an incoming room signal. Ignores signals not for us. */
  async handleSignal(s: Signal): Promise<void> {
    if (s.from === this.myId) return;
    if (s.to !== this.myId && s.to !== '*') return;
    if (s.kind === 'hello') {
      // Smaller id offers (glare avoidance). If we're NOT the initiator for this
      // pair, bounce a directed hello back so the smaller-id side still offers
      // when it was the late joiner — otherwise that pairing deadlocks (~50% of
      // join orders) because the existing peer never announced again.
      if (initiatesTo(this.myId, s.from)) await this.offer(s.from);
      else this.send({ from: this.myId, to: s.from, kind: 'hello' });
      return;
    }
    if (s.kind === 'bye') { this.removePeer(s.from); return; }
    const pc = this.ensurePeer(s.from);
    if (s.kind === 'offer') {
      await pc.setRemoteDescription(JSON.parse(s.payload!));
      await this.flushIce(s.from, pc);
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      this.send({ from: this.myId, to: s.from, kind: 'answer', payload: JSON.stringify(ans) });
    } else if (s.kind === 'answer') {
      await pc.setRemoteDescription(JSON.parse(s.payload!));
      await this.flushIce(s.from, pc);
    } else if (s.kind === 'ice') {
      const cand = JSON.parse(s.payload!) as RTCIceCandidateInit;
      // Buffer candidates that arrive before the remote description; flush them
      // once it's set. Dropping them (the old behavior) stalled connection setup.
      if (pc.remoteDescription) { try { await pc.addIceCandidate(cand); } catch { /* stale candidate */ } }
      else { const q = this.pendingIce.get(s.from) ?? []; q.push(cand); this.pendingIce.set(s.from, q); }
    }
  }

  /** Swap the outgoing video track on every peer (camera ⇄ screen share). */
  replaceVideoTrack(track: MediaStreamTrack | null): void {
    for (const pc of this.peers.values()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video' || (!s.track && track));
      if (sender) void sender.replaceTrack(track);
    }
  }

  removePeer(peerId: string): void {
    const pc = this.peers.get(peerId);
    this.pendingIce.delete(peerId);
    if (pc) { try { pc.close(); } catch { /* */ } this.peers.delete(peerId); this.handlers.onPeerLeft(peerId); }
  }

  leave(): void {
    this.send({ from: this.myId, to: '*', kind: 'bye' });
    for (const id of [...this.peers.keys()]) this.removePeer(id);
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
  }

  peerIds(): string[] { return [...this.peers.keys()]; }
}
