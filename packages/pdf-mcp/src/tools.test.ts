import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { PdfDocument } from '@pdfcraft/parser';
import { listFormFields, fillForm, tagAccessibilityPdf, extractText, redactMatches } from './tools.js';

async function makePdf(): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  const p = d.addPage([400, 300]);
  const f = await d.embedFont(StandardFonts.Helvetica);
  p.drawText('REDACTME token123secret', { x: 40, y: 250, size: 14, font: f });
  p.drawText('keep this visible', { x: 40, y: 150, size: 14, font: f });
  return new Uint8Array(await d.save());
}
// A real AcroForm our parser reads (Form 15G).
const FORM = fileURLToPath(new URL('../../../apps/demo-react/public/test-form.pdf', import.meta.url));

describe('pdfcraft MCP tools', () => {
  it('extracts text', async () => {
    const t = await extractText(await makePdf());
    expect(t[0]!.text).toContain('REDACTME');
    expect(t[0]!.text).toContain('keep this');
  });

  it('lists and fills real form fields', async () => {
    const bytes = new Uint8Array(readFileSync(FORM));
    const fields = await listFormFields(bytes);
    expect(fields.length).toBeGreaterThan(0);
    const target = fields.find((f) => f.type === 'text' || f.type === 'multiline');
    expect(target).toBeTruthy();
    const filled = await fillForm(bytes, { [target!.id]: 'Jane Doe' });
    expect(filled.length).toBeGreaterThan(1000);
  });

  it('TRUE-redacts a term and verifies it is gone', async () => {
    const r = await redactMatches(await makePdf(), ['token123secret']);
    expect(r.matched).toBeGreaterThanOrEqual(1);
    expect(r.verified).toBe(true);
    expect(r.leaks).toHaveLength(0);
    const after = await extractText(r.pdf);
    expect(after[0]!.text).not.toContain('token123secret');
    expect(after[0]!.text).toContain('keep this');
  });

  it('tags for accessibility (StructTreeRoot present)', async () => {
    const out = await tagAccessibilityPdf(await makePdf(), { lang: 'en-US', title: 'T' });
    const d2 = await PdfDocument.load(out);
    const cat = await d2.resolveDict(d2.root!);
    expect(cat.get('StructTreeRoot')).toBeTruthy();
    expect(cat.get('MarkInfo')).toBeTruthy();
  });
});
