import { describe, it, expect } from 'vitest';
import { CollabSession } from './session.js';
import { memTransportPair } from './transport.js';
import { generateKey } from './crypto.js';

// Drain queued microtasks/timers so async crypto + transport settle.
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };

describe('CollabSession (end-to-end over an in-memory transport)', () => {
  it('a joiner catches up via an encrypted snapshot', async () => {
    const [t1, t2] = memTransportPair();
    const key = await generateKey();
    const host = new CollabSession(t1, key, { name: 'Host', initialText: 'shared doc', site: 'h' });
    const guest = new CollabSession(t2, key, { name: 'Guest', site: 'g' });
    await host.start();
    await guest.start();
    await flush();
    expect(guest.text).toBe('shared doc');
  });

  it('edits replicate live in both directions and converge', async () => {
    const [t1, t2] = memTransportPair();
    const key = await generateKey();
    const a = new CollabSession(t1, key, { name: 'A', initialText: 'hello', site: 'a' });
    const b = new CollabSession(t2, key, { name: 'B', site: 'b' });
    await a.start(); await b.start(); await flush();

    await a.setText('hello world'); await flush();
    expect(b.text).toBe('hello world');

    await b.setText('hello world!'); await flush();
    expect(a.text).toBe('hello world!');
  });

  it('tracks peers and their presence', async () => {
    const [t1, t2] = memTransportPair();
    const key = await generateKey();
    const a = new CollabSession(t1, key, { name: 'Ada', site: 'a' });
    const b = new CollabSession(t2, key, { name: 'Boris', site: 'b' });
    await a.start(); await b.start(); await flush();

    expect(a.participants.map((p) => p.name)).toContain('Boris');
    expect(b.participants.map((p) => p.name)).toContain('Ada');

    await b.setCursor(3); await flush();
    expect(a.participants.find((p) => p.name === 'Boris')?.cursor).toBe(3);
  });

  it('a session with the wrong key cannot read the traffic', async () => {
    const [t1, t2] = memTransportPair();
    const k1 = await generateKey();
    const k2 = await generateKey();
    const a = new CollabSession(t1, k1, { name: 'A', initialText: 'secret', site: 'a' });
    const intruder = new CollabSession(t2, k2, { name: 'X', site: 'x' });
    await a.start(); await intruder.start(); await flush();
    await a.setText('secret plans'); await flush();
    // Wrong key → messages drop on decrypt; the intruder never sees content or peers.
    expect(intruder.text).toBe('');
    expect(intruder.participants).toEqual([]);
  });

  it('leaving notifies peers', async () => {
    const [t1, t2] = memTransportPair();
    const key = await generateKey();
    const a = new CollabSession(t1, key, { name: 'A', site: 'a' });
    const b = new CollabSession(t2, key, { name: 'B', site: 'b' });
    await a.start(); await b.start(); await flush();
    expect(a.participants).toHaveLength(1);
    await b.leave(); await flush();
    expect(a.participants).toHaveLength(0);
  });
});
