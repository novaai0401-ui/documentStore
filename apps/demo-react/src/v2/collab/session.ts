/**
 * A collaborative editing session. Ties together the text CRDT, the end-to-end
 * key, and a transport: local edits are diffed into CRDT ops, encrypted, and
 * broadcast; incoming encrypted messages are decrypted and applied. New joiners
 * announce themselves and existing peers reply with an encrypted snapshot so the
 * newcomer catches up. Presence (name, colour, cursor) rides the same encrypted
 * channel. Everything on the wire is ciphertext — the transport learns nothing.
 */
import { CrdtText } from '../crdt/textSync.js';
import type { RgaOp } from '../crdt/rga.js';
import { encryptJson, decryptJson } from './crypto.js';
import { randomToken } from './crypto.js';
import type { Transport, RelayStatus } from './transport.js';
import { type Peer, colorFor } from './presence.js';

export type { Peer };

type Msg =
  | { k: 'hello'; id: string; name: string; color: string }
  | { k: 'snap'; ops: RgaOp[] }
  | { k: 'ops'; ops: RgaOp[] }
  | { k: 'pres'; id: string; name: string; color: string; cursor?: number }
  | { k: 'bye'; id: string };

export interface SessionOpts { name?: string; initialText?: string; site?: string }

export class CollabSession {
  readonly id = randomToken(6);
  readonly name: string;
  readonly color: string;
  private doc: CrdtText;
  private peers = new Map<string, Peer>();
  private textCbs = new Set<(t: string) => void>();
  private peerCbs = new Set<(p: Peer[]) => void>();
  private closed = false;

  constructor(private transport: Transport, private key: CryptoKey, opts: SessionOpts = {}) {
    this.name = opts.name?.trim() || 'Guest';
    this.color = colorFor(this.id);
    this.doc = new CrdtText(opts.initialText ?? '', opts.site);
  }

  get text(): string { return this.doc.text; }
  get participants(): Peer[] { return [...this.peers.values()]; }

  onText(cb: (t: string) => void): () => void { this.textCbs.add(cb); return () => this.textCbs.delete(cb); }
  onPeers(cb: (p: Peer[]) => void): () => void { this.peerCbs.add(cb); return () => this.peerCbs.delete(cb); }

  /** Join the session: listen, then announce ourselves so peers send a snapshot. */
  async start(): Promise<void> {
    this.transport.onMessage((data) => { void this.receive(data); });
    await this.announce();
  }

  /** (Re)announce our presence so peers reply with a snapshot — also used when a
   *  relay (re)connects, so a device that just came online resyncs. */
  async announce(): Promise<void> {
    await this.send({ k: 'hello', id: this.id, name: this.name, color: this.color });
  }

  /** Subscribe to relay connectivity (true once cross-device is live). */
  onRelayStatus(cb: (status: RelayStatus) => void): void { this.transport.onStatus?.(cb); }

  /** Apply a local edit (the new full text); broadcasts the resulting ops. */
  async setText(next: string): Promise<void> {
    const ops = this.doc.setText(next);
    if (ops.length) await this.send({ k: 'ops', ops });
  }

  /** Broadcast our cursor position (presence). */
  async setCursor(cursor: number): Promise<void> {
    await this.send({ k: 'pres', id: this.id, name: this.name, color: this.color, cursor });
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
        // Reply with the current document + our presence so they catch up.
        await this.send({ k: 'snap', ops: this.doc.snapshot() });
        await this.send({ k: 'pres', id: this.id, name: this.name, color: this.color });
        break;
      case 'snap':
      case 'ops':
        this.doc.applyRemote(msg.ops);
        this.emitText();
        break;
      case 'pres':
        this.touchPeer(msg.id, msg.name, msg.color, msg.cursor);
        break;
      case 'bye':
        if (this.peers.delete(msg.id)) this.emitPeers();
        break;
    }
  }

  private touchPeer(id: string, name: string, color: string, cursor?: number): void {
    if (id === this.id) return;
    const prev = this.peers.get(id);
    this.peers.set(id, { id, name, color, cursor: cursor ?? prev?.cursor, seen: Date.now() });
    this.emitPeers();
  }

  private emitText(): void { const t = this.doc.text; for (const cb of this.textCbs) cb(t); }
  private emitPeers(): void { const p = this.participants; for (const cb of this.peerCbs) cb(p); }
}
