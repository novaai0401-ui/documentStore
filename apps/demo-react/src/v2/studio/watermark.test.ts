import { describe, it, expect } from 'vitest';
import { hexToRgb01, tilePositions, watermarkPdf } from './watermark.js';

describe('watermark helpers', () => {
  it('parses hex colours to 0–1 rgb (with fallback)', () => {
    expect(hexToRgb01('#ffffff')).toEqual({ r: 1, g: 1, b: 1 });
    expect(hexToRgb01('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb01('#f00')).toEqual({ r: 1, g: 0, b: 0 });
    expect(hexToRgb01('nonsense')).toEqual({ r: 0.5, g: 0.5, b: 0.5 });
  });
  it('produces a covering tile grid', () => {
    const p = tilePositions(200, 300, 100, 100);
    expect(p.length).toBeGreaterThan(10);
    expect(p[0]).toEqual({ x: -200, y: -300 });
  });
});

describe('watermarkPdf', () => {
  it('stamps text into a real PDF and grows it', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    doc.addPage([400, 600]);
    const base = await doc.save();
    const out = await watermarkPdf(base, { text: 'CONFIDENTIAL', tile: true });
    expect(out.length).toBeGreaterThan(base.length);
    // Re-load to prove it's still a valid PDF.
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPageCount()).toBe(1);
  });
  it('returns input unchanged when text is empty', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.create(); doc.addPage();
    const base = await doc.save();
    expect(await watermarkPdf(base, { text: '   ' })).toBe(base);
  });
});
