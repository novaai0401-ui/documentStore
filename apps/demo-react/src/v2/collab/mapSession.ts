/**
 * A collaborative session over an LWW-Map — the structured-editor counterpart to
 * CollabSession (which drives the text RGA). It shares the same wire shape: an
 * encrypted hello/snapshot handshake so joiners catch up, encrypted op broadcasts
 * for live edits, and presence (name + colour) on the same channel. Everything on
 * the transport is ciphertext.
 *
 * Spreadsheet cells and slide fields map onto distinct keys, so two people editing
 * different cells/slides never conflict; the rare same-key clash is resolved
 * identically on every replica by the map's last-writer-wins rule.
 */
import { LwwMap, type LwwOp } from '../crdt/lwwMap.js';
import { encryptJson, decryptJson, randomToken } from './crypto.js';
import type { Transport, RelayStatus } from './transport.js';
import { type Peer, colorFor } from './presence.js';

export type { Peer };

type Msg =
  | { k: 'hello'; id: string; name: string; color: string }
  | { k: 'snap'; ops: LwwOp[] }
  | { k: 'ops'; ops: LwwOp[] }
  | { k: 'pres'; id: string; name: string; color: string }
  | { k: 'bye'; id: string };

export interface MapSessionOpts { name?: string; site?: string }

export class MapSession {
  readonly id = randomToken(6);
  readonly name: string;
  readonly color: string;
  private doc: LwwMap;
  private peers = new Map<string, Peer>();
  private changeCbs = new Set<(e: Record<string, string>) => void>();
  private peerCbs = new Set<(p: Peer[]) => void>();
  private closed = false;

  constructor(private transport: Transport, private key: CryptoKey, opts: MapSessionOpts = {}) {
    this.name = opts.name?.trim() || 'Guest';
    this.color = colorFor(this.id);
    this.doc = new LwwMap(opts.site ?? this.id);
  }

  get entries(): Record<string, string> { return this.doc.entries(); }
  get participants(): Peer[] { return [...this.peers.values()]; }

  /** Fires only for *remote* changes, so a local edit never echoes back into the
   *  editor that produced it. */
  onChange(cb: (e: Record<string, string>) => void): () => void { this.changeCbs.add(cb); return () => this.changeCbs.delete(cb); }
  onPeers(cb: (p: Peer[]) => void): () => void { this.peerCbs.add(cb); return () => this.peerCbs.delete(cb); }

  /** Seed the document locally (host only) before anyone joins. Not broadcast —
   *  it rides along in the snapshot we send when a peer says hello. */
  seed(entries: Record<string, string>): void {
    for (const [k, v] of Object.entries(entries)) this.doc.set(k, v);
  }

  async start(): Promise<void> {
    this.transport.onMessage((data) => { void this.receive(data); });
    await this.announce();
  }

  /** (Re)announce presence so peers reply with a snapshot — also on relay reconnect. */
  async announce(): Promise<void> {
    await this.send({ k: 'hello', id: this.id, name: this.name, color: this.color });
  }

  /** Subscribe to relay connectivity (true once cross-device is live). */
  onRelayStatus(cb: (status: RelayStatus) => void): void { this.transport.onStatus?.(cb); }

  /** Apply local edits to one or more keys and broadcast the resulting ops. */
  async set(updates: Record<string, string>): Promise<void> {
    const ops = Object.entries(updates).map(([k, v]) => this.doc.set(k, v));
    if (ops.length) await this.sendOps('ops', ops);
  }

  /**
   * Send ops as one or more frames, each kept under the relay's per-frame cap so
   * large values (chunked media, big pasted images) and full snapshots are never
   * dropped for exceeding it. The app layer chunks large media before it reaches
   * the map, so no single op exceeds the budget on its own.
   */
  private async sendOps(kind: 'ops' | 'snap', ops: LwwOp[]): Promise<void> {
    if (!ops.length) { if (kind === 'snap') await this.send({ k: 'snap', ops: [] }); return; }
    const BUDGET = 6 * 1024 * 1024;
    let batch: LwwOp[] = [];
    let size = 0;
    for (const op of ops) {
      const opSize = op.key.length + op.value.length + 96;
      if (size + opSize > BUDGET && batch.length) { await this.send({ k: kind, ops: batch }); batch = []; size = 0; }
      batch.push(op);
      size += opSize;
    }
    if (batch.length) await this.send({ k: kind, ops: batch });
  }

  /** Broadcast presence (name/colour) without touching the document. */
  async ping(): Promise<void> {
    await this.send({ k: 'pres', id: this.id, name: this.name, color: this.color });
  }

  async leave(): Promise<void> {
    if (this.closed) return;
    try { await this.send({ k: 'bye', id: this.id }); } catch { /* best effort */ }
    this.closed = true;
    this.transport.close();
  }

  private async send(msg: Msg): Promise<void> {
    if (this.closed) return;
    this.transport.send(await encryptJson(this.key, msg));
  }

  private async receive(data: Uint8Array): Promise<void> {
    let msg: Msg;
    try { msg = await decryptJson<Msg>(this.key, data); } catch { return; /* not our key / corrupt */ }
    switch (msg.k) {
      case 'hello':
        this.touchPeer(msg.id, msg.name, msg.color);
        await this.sendOps('snap', this.doc.snapshot());
        await this.send({ k: 'pres', id: this.id, name: this.name, color: this.color });
        break;
      case 'snap':
      case 'ops':
        if (this.doc.applyAll(msg.ops)) this.emitChange();
        break;
      case 'pres':
        this.touchPeer(msg.id, msg.name, msg.color);
        break;
      case 'bye':
        if (this.peers.delete(msg.id)) this.emitPeers();
        break;
    }
  }

  private touchPeer(id: string, name: string, color: string): void {
    if (id === this.id) return;
    this.peers.set(id, { id, name, color, seen: Date.now() });
    this.emitPeers();
  }

  private emitChange(): void { const e = this.doc.entries(); for (const cb of this.changeCbs) cb(e); }
  private emitPeers(): void { const p = this.participants; for (const cb of this.peerCbs) cb(p); }
}
