import { describe, it, expect } from 'vitest';
import { buildXlsx, buildPptx } from './officeClient.js';

// In the Node test environment there is no `Worker`, so these exercise the
// inline (main-thread) fallback path and prove it produces valid files.
const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

describe('office build client (inline fallback)', () => {
  it('builds a valid .xlsx workbook from sheet rows', async () => {
    const bytes = await buildXlsx([{ name: 'Sheet1', rows: [['a', 'b'], ['1', '2']] }]);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(100);
    expect(isZip(bytes)).toBe(true); // xlsx is a zip (OOXML)
  });

  it('builds a valid .pptx deck from slides', async () => {
    const bytes = await buildPptx([{ title: 'Hello', body: ['one', 'two'] }]);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(100);
    expect(isZip(bytes)).toBe(true); // pptx is a zip (OOXML)
  });
});
