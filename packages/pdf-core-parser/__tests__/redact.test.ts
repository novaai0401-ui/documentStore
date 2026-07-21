import { describe, it, expect } from 'vitest';
import { redactContentBuffer } from '../dist/index.js';

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

describe('redactContentBuffer (true text removal)', () => {
  it('blanks a Tj string whose box intersects a redaction rect', () => {
    const cs = 'BT /F1 24 Tf 100 700 Td (SECRET) Tj ET';
    const out = dec(redactContentBuffer(enc(cs), [{ x: 95, y: 690, width: 130, height: 30 }]));
    expect(out).not.toContain('SECRET');
    expect(out).toContain('() Tj'); // operator kept, operand emptied
  });

  it('leaves text outside the rect untouched', () => {
    const cs = `BT /F1 24 Tf 100 700 Td (SECRET) Tj ET
BT /F1 24 Tf 100 600 Td (PUBLIC) Tj ET`;
    const out = dec(redactContentBuffer(enc(cs), [{ x: 95, y: 690, width: 130, height: 30 }]));
    expect(out).not.toContain('SECRET');
    expect(out).toContain('(PUBLIC)');
  });

  it('blanks a whole TJ array when any chunk intersects', () => {
    const cs = 'BT /F1 12 Tf 100 500 Td [(Hi)-300(there SECRET)] TJ ET';
    const out = dec(redactContentBuffer(enc(cs), [{ x: 95, y: 492, width: 220, height: 20 }]));
    expect(out).not.toContain('SECRET');
    expect(out).toContain('[] TJ');
  });

  it('respects the CTM (cm) when positioning text', () => {
    // Translate the coordinate system up by 600, then draw at Td 100 100 → y≈700.
    const cs = 'q 1 0 0 1 0 600 cm BT /F1 24 Tf 100 100 Td (SECRET) Tj ET Q';
    const out = dec(redactContentBuffer(enc(cs), [{ x: 95, y: 690, width: 130, height: 30 }]));
    expect(out).not.toContain('SECRET');
  });

  it('is a no-op when nothing intersects', () => {
    const cs = 'BT /F1 12 Tf 50 50 Td (keep me) Tj ET';
    const out = dec(redactContentBuffer(enc(cs), [{ x: 400, y: 400, width: 50, height: 50 }]));
    expect(out).toContain('(keep me)');
  });
});
