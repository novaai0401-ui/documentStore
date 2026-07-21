import { describe, it, expect } from 'vitest';
import { MapSession } from './mapSession.js';
import { memTransportPair } from './transport.js';
import { generateKey } from './crypto.js';

// Flush several macrotask rounds so the async encrypt→deliver→decrypt→apply
// chain fully settles before we assert.
const tick = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

describe('MapSession', () => {
  it('catches a joiner up to the host snapshot, then syncs live edits both ways', async () => {
    const key = await generateKey();
    const [a, b] = memTransportPair();

    const host = new MapSession(a, key, { name: 'Host' });
    host.seed({ 'r0:c0': 'hello', 'r0:c1': 'world' });
    const hostChanges: Record<string, string>[] = [];
    host.onChange((e) => hostChanges.push(e));
    await host.start();

    const guest = new MapSession(b, key, { name: 'Guest' });
    const guestChanges: Record<string, string>[] = [];
    guest.onChange((e) => guestChanges.push(e));
    await guest.start();
    await tick(); await tick();

    // Guest received the seeded snapshot.
    expect(guest.entries).toEqual({ 'r0:c0': 'hello', 'r0:c1': 'world' });

    // Guest edits a new cell; host sees it.
    await guest.set({ 'r1:c0': 'fromguest' });
    await tick();
    expect(host.entries['r1:c0']).toBe('fromguest');

    // Host edits; guest sees it.
    await host.set({ 'r0:c0': 'changed' });
    await tick();
    expect(guest.entries['r0:c0']).toBe('changed');
  });

  it('does not echo a local edit back to its own onChange', async () => {
    const key = await generateKey();
    const [a, b] = memTransportPair();
    const host = new MapSession(a, key);
    const guest = new MapSession(b, key);
    let hostFires = 0;
    host.onChange(() => { hostFires++; });
    await host.start();
    await guest.start();
    await tick();

    const before = hostFires;
    await host.set({ x: '1' }); // local edit
    await tick();
    expect(hostFires).toBe(before); // host's own onChange did not fire
    expect(guest.entries.x).toBe('1'); // but the guest got it
  });

  it('tracks peers joining and leaving', async () => {
    const key = await generateKey();
    const [a, b] = memTransportPair();
    const host = new MapSession(a, key, { name: 'Host' });
    let peers: { name: string }[] = [];
    host.onPeers((p) => { peers = p; });
    await host.start();
    const guest = new MapSession(b, key, { name: 'Guest' });
    await guest.start();
    await tick(); await tick();
    expect(peers.map((p) => p.name)).toContain('Guest');

    await guest.leave();
    await tick();
    expect(peers).toHaveLength(0);
  });

  it('converges when both edit the same key concurrently', async () => {
    const key = await generateKey();
    const [a, b] = memTransportPair();
    const host = new MapSession(a, key);
    const guest = new MapSession(b, key);
    await host.start();
    await guest.start();
    await tick();

    // Both write the same key before seeing each other's write.
    await Promise.all([host.set({ k: 'H' }), guest.set({ k: 'G' })]);
    await tick(); await tick();
    // Both replicas agree on the winner (deterministic, not necessarily either's).
    expect(host.entries.k).toBe(guest.entries.k);
  });
});
