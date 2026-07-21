import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveIceServers, hasTurn } from './config.js';

const KEY = 'pdfcraft:turn';

// The collab tests run without jsdom, so provide a minimal localStorage.
beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  };
});
afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

describe('WebRTC ICE / TURN configuration', () => {
  it('returns STUN only by default (no TURN configured)', () => {
    const ice = resolveIceServers();
    expect(ice.length).toBe(1);
    expect(JSON.stringify(ice)).toMatch(/stun:/);
    expect(hasTurn()).toBe(false);
  });

  it('appends a TURN server from a "urls|user|cred" localStorage override', () => {
    localStorage.setItem(KEY, 'turn:turn.example.com:3478|alice|s3cret');
    const ice = resolveIceServers();
    expect(ice.length).toBe(2);
    expect(ice[1]).toEqual({ urls: 'turn:turn.example.com:3478', username: 'alice', credential: 's3cret' });
    expect(hasTurn()).toBe(true);
  });

  it('accepts a JSON RTCIceServer override', () => {
    localStorage.setItem(KEY, JSON.stringify({ urls: ['turns:t.example:5349'], username: 'u', credential: 'c' }));
    const ice = resolveIceServers();
    expect(ice[1]).toEqual({ urls: ['turns:t.example:5349'], username: 'u', credential: 'c' });
  });

  it('keeps STUN first so direct/host candidates are still tried before relaying', () => {
    localStorage.setItem(KEY, 'turn:t.example:3478');
    expect(JSON.stringify(resolveIceServers()[0])).toMatch(/stun:/);
  });

  it('splits a comma-separated TURN url list into an array', () => {
    localStorage.setItem(KEY, 'turn:t:80,turn:t:443?transport=tcp|u|c');
    expect(resolveIceServers()[1]).toEqual({ urls: ['turn:t:80', 'turn:t:443?transport=tcp'], username: 'u', credential: 'c' });
  });
});
