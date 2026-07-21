import { describe, it, expect } from 'vitest';
import { generateSigningKey, signDocument, verifyDocument, manifestToJson, manifestFromJson, sha256Hex } from './sign.js';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('document signing', () => {
  it('round-trips: a signed document verifies', async () => {
    const keys = await generateSigningKey();
    const doc = bytes('The quick brown fox.');
    const m = await signDocument(doc, 'Ada Lovelace', keys);
    const r = await verifyDocument(doc, m);
    expect(r.valid).toBe(true);
    expect(r.digestMatch).toBe(true);
    expect(r.sigValid).toBe(true);
    expect(r.signer).toBe('Ada Lovelace');
    expect(m.alg).toBe('ECDSA-P256-SHA256');
  });

  it('fails when the document is tampered with', async () => {
    const keys = await generateSigningKey();
    const m = await signDocument(bytes('original'), 'X', keys);
    const r = await verifyDocument(bytes('original!'), m);
    expect(r.valid).toBe(false);
    expect(r.digestMatch).toBe(false);
  });

  it("fails when the signature is swapped for another key's", async () => {
    const a = await generateSigningKey();
    const b = await generateSigningKey();
    const doc = bytes('same bytes');
    const ma = await signDocument(doc, 'A', a);
    const mb = await signDocument(doc, 'B', b);
    // Splice A's signature onto B's manifest (same digest, wrong key) → invalid.
    const forged = { ...mb, signature: ma.signature };
    const r = await verifyDocument(doc, forged);
    expect(r.digestMatch).toBe(true);
    expect(r.sigValid).toBe(false);
    expect(r.valid).toBe(false);
  });

  it('serializes + parses a manifest, and rejects malformed ones', async () => {
    const keys = await generateSigningKey();
    const m = await signDocument(bytes('x'), 'S', keys);
    expect(manifestFromJson(manifestToJson(m)).signature).toBe(m.signature);
    expect(() => manifestFromJson('{"v":2}')).toThrow();
    expect(() => manifestFromJson('not json')).toThrow();
  });

  it('hashes deterministically', async () => {
    expect(await sha256Hex(bytes('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
