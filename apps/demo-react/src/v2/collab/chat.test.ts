import { describe, it, expect } from 'vitest';
import { newMessage, fileMessage, systemMessage, addMessage, mergeMessages, humanSize, formatTime, deliveryFor, splitChunks, joinChunks, type ChatMessage } from './chat.js';

describe('media chunking', () => {
  it('splits then rejoins to the original (round-trip)', () => {
    const data = 'data:image/png;base64,' + 'A'.repeat(1000);
    const parts = splitChunks(data, 64);
    expect(parts.length).toBe(Math.ceil(data.length / 64));
    expect(joinChunks(parts)).toBe(data);
  });
  it('keeps a small payload as a single chunk', () => {
    expect(splitChunks('hello', 64)).toEqual(['hello']);
  });
  it('returns null while any chunk is still missing', () => {
    const parts = splitChunks('A'.repeat(200), 64); // 4 parts
    const partial: (string | undefined)[] = [...parts]; partial[2] = undefined;
    expect(joinChunks(partial)).toBeNull();
    expect(joinChunks(parts)).toBe('A'.repeat(200));
  });
});

const at = (id: string, ts: number, text = id): ChatMessage => ({ id, authorId: 'a', author: 'A', ts, kind: 'text', text });
const mine = (ts: number): ChatMessage => ({ id: 'x' + ts, authorId: 'me', author: 'You', ts, kind: 'text', text: 'hi' });

describe('chat log', () => {
  it('creates text, file and system messages', () => {
    expect(newMessage('A', 'a', 'hi').kind).toBe('text');
    const f = fileMessage('A', 'a', { name: 'p.png', size: 10, mime: 'image/png', ref: 'r1' }, 'look');
    expect(f.kind).toBe('file');
    expect(f.file?.name).toBe('p.png');
    expect(systemMessage('X joined').kind).toBe('system');
  });

  it('appends de-duped and time-ordered', () => {
    let log = addMessage([], at('m2', 2));
    log = addMessage(log, at('m1', 1));
    log = addMessage(log, at('m2', 2, 'dup')); // same id replaces, not duplicates
    expect(log.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('merges two peers logs by union (CRDT-safe)', () => {
    const a = [at('m1', 1), at('m3', 3)];
    const b = [at('m2', 2), at('m3', 3)];
    expect(mergeMessages(a, b).map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('formats sizes and times', () => {
    expect(humanSize(500)).toBe('500 B');
    expect(humanSize(2048)).toBe('2 KB');
    expect(humanSize(3 * 1048576)).toBe('3 MB');
    expect(formatTime(new Date(2020, 0, 1, 9, 5).getTime())).toBe('09:05');
  });
});

describe('deliveryFor (read receipts)', () => {
  it('is sent when no other peer is in the room', () => {
    expect(deliveryFor(mine(10), 'me', [], {})).toBe('sent');
    expect(deliveryFor(mine(10), 'me', ['me'], {})).toBe('sent'); // only myself present
  });

  it('is delivered when a peer is present but behind this message', () => {
    expect(deliveryFor(mine(10), 'me', ['p1'], {})).toBe('delivered'); // no cursor yet
    expect(deliveryFor(mine(10), 'me', ['p1'], { p1: 9 })).toBe('delivered');
  });

  it('is read only when every other peer has read up to this message', () => {
    expect(deliveryFor(mine(10), 'me', ['p1'], { p1: 10 })).toBe('read');
    expect(deliveryFor(mine(10), 'me', ['p1', 'p2'], { p1: 12, p2: 10 })).toBe('read');
    expect(deliveryFor(mine(10), 'me', ['p1', 'p2'], { p1: 12, p2: 9 })).toBe('delivered'); // p2 behind
  });

  it('ignores messages I did not author (renderer only ticks my own)', () => {
    expect(deliveryFor(at('m1', 10), 'me', ['p1'], {})).toBe('read');
  });
});
