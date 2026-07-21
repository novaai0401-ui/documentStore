import { describe, it, expect } from 'vitest';
import {
  asciiHexDecode,
  ascii85Decode,
  runLengthDecode,
  lzwDecode,
  inflate,
  deflate,
} from '../dist/index.js';

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (u: Uint8Array) => new TextDecoder().decode(u);

describe('ASCIIHexDecode', () => {
  it('decodes hex pairs', () => {
    expect(dec(asciiHexDecode(enc('48656C6C6F>')))).toBe('Hello');
  });
  it('ignores whitespace', () => {
    expect(dec(asciiHexDecode(enc('48 65\n6C\t6C 6F>')))).toBe('Hello');
  });
  it('pads odd trailing nibble with 0', () => {
    expect(dec(asciiHexDecode(enc('41>')))).toBe('A');
  });
});

describe('ASCII85Decode', () => {
  it('decodes a canonical 4-byte group', () => {
    expect(dec(ascii85Decode(enc('9jqo^~>')))).toBe('Man ');
  });
  it('decodes a short final group', () => {
    expect(dec(ascii85Decode(enc('87cURDZ~>')))).toBe('Hello');
  });
  it('tolerates a missing end marker', () => {
    expect(dec(ascii85Decode(enc('9jqo^')))).toBe('Man ');
  });
  it('expands the "z" shortcut to four zero bytes', () => {
    const result = ascii85Decode(enc('z~>'));
    expect(result.length).toBe(4);
    expect(Array.from(result)).toEqual([0, 0, 0, 0]);
  });
});

describe('RunLengthDecode', () => {
  it('copies a literal run', () => {
    expect(dec(runLengthDecode(new Uint8Array([4, 0x48, 0x45, 0x4C, 0x4C, 0x4F, 0x80])))).toBe('HELLO');
  });
  it('repeats a single byte', () => {
    expect(dec(runLengthDecode(new Uint8Array([254, 0x41, 0x80])))).toBe('AAA');
  });
  it('handles a mixed stream', () => {
    expect(dec(runLengthDecode(new Uint8Array([0, 0x41, 253, 0x42, 0x80])))).toBe('ABBBB');
  });
  it('terminates cleanly without an EOD marker', () => {
    expect(dec(runLengthDecode(new Uint8Array([2, 0x58, 0x59, 0x5A])))).toBe('XYZ');
  });
});

describe('LZWDecode', () => {
  it('decodes a hand-built 9-bit ABA stream', () => {
    // CLEAR(256), 'A', 'B', 'A', EOD(257) at 9 bits MSB-first.
    const out = lzwDecode(new Uint8Array([0x80, 0x10, 0x48, 0x44, 0x18, 0x08]));
    expect(dec(out.slice(0, 3))).toBe('ABA');
  });
});

describe('Flate inflate / deflate', () => {
  it('round-trips lossless', async () => {
    const sample = enc('The quick brown fox jumps over the lazy dog. '.repeat(40));
    const compressed = await deflate(sample);
    const back = await inflate(compressed);
    expect(back.length).toBe(sample.length);
    expect(Array.from(back)).toEqual(Array.from(sample));
  });
  it('actually compresses repeated content', async () => {
    const sample = enc('hello '.repeat(200));
    const compressed = await deflate(sample);
    expect(compressed.length).toBeLessThan(sample.length / 4);
  });
});
