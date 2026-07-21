import { describe, it, expect } from 'vitest';
import { createRoom, buildShareUrl, buildGatedUrl, parseShareUrl, isExpired, timeLeft, ROOM_TTL_MS } from './link.js';

describe('capability share-links', () => {
  it('mints unguessable, unique rooms with a 24h expiry', async () => {
    const a = await createRoom();
    const b = await createRoom();
    expect(a.roomId).not.toBe(b.roomId);
    expect(a.key).not.toBe(b.key);
    expect(a.exp - Date.now()).toBeGreaterThan(ROOM_TTL_MS - 5000);
  });

  it('round-trips through the URL with secrets in the fragment', async () => {
    const room = await createRoom();
    const url = buildShareUrl('https://pdfcraft.app', room);
    // Secrets must be after the '#', never in the path/query sent to a server.
    const [base, frag] = url.split('#');
    expect(base).toBe('https://pdfcraft.app/app');
    expect(frag).toContain(`key=${room.key}`);
    const parsed = parseShareUrl(url);
    expect(parsed).toEqual(room);
  });

  it('parses a bare fragment and rejects malformed links', () => {
    expect(parseShareUrl('room=r1&key=k1&exp=123')).toEqual({ roomId: 'r1', key: 'k1', exp: 123, kind: 'text' });
    expect(parseShareUrl('https://x/app')).toBeNull();
    expect(parseShareUrl('#room=only')).toBeNull();
    expect(parseShareUrl('#key=k&exp=1')).toBeNull();
  });

  it('carries the editor kind through the link (and defaults to text)', async () => {
    const sheet = await createRoom('sheet');
    const parsed = parseShareUrl(buildShareUrl('https://pdfcraft.app', sheet));
    expect(parsed?.kind).toBe('sheet');
    // An unknown or absent kind falls back to text.
    expect(parseShareUrl('room=r&key=k&exp=9&kind=bogus')?.kind).toBe('text');
    expect(parseShareUrl('room=r&key=k&exp=9')?.kind).toBe('text');
  });

  it('builds a gated (keyless) link and parses it as gated', async () => {
    const room = await createRoom('design');
    const url = buildGatedUrl('https://pdfcraft.app', room);
    // A gated link must NOT leak the room key into the URL.
    expect(url).not.toContain('key=');
    expect(url).toContain('g=1');
    const parsed = parseShareUrl(url);
    expect(parsed).toMatchObject({ roomId: room.roomId, key: '', kind: 'design', gated: true });
    // A keyless link is only valid when explicitly gated.
    expect(parseShareUrl('room=r&exp=9')).toBeNull();
    expect(parseShareUrl('room=r&exp=9&g=1')).toMatchObject({ key: '', gated: true });
  });

  it('detects expiry and reports time left', () => {
    const now = Date.now();
    const past = { roomId: 'r', key: 'k', exp: now - 1000 };
    const future = { roomId: 'r', key: 'k', exp: now + 2 * 3_600_000 };
    expect(isExpired(past)).toBe(true);
    expect(isExpired(future)).toBe(false);
    // Pass the same `now` so the 2h boundary is exact and not subject to the
    // sub-millisecond drift between building `future` and reading the clock.
    expect(timeLeft(past, now)).toBe('expired');
    expect(timeLeft(future, now)).toBe('2h left');
  });
});
