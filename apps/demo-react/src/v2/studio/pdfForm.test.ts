import { describe, it, expect } from 'vitest';
import { fracToPdfRect, uniqueName, buildFormPdf, type FieldDef } from './pdfForm.js';

describe('pdf form geometry', () => {
  it('flips fractional top-left rect into PDF points', () => {
    expect(fracToPdfRect({ x: 0.1, y: 0.1, w: 0.3, h: 0.05 }, 600, 800)).toEqual({ x: 60, y: 680, width: 180, height: 40 });
  });
  it('makes names unique and identifier-safe', () => {
    const used = new Set<string>();
    expect(uniqueName('Full Name', used)).toBe('Full_Name');
    expect(uniqueName('Full Name', used)).toBe('Full_Name_2');
    expect(uniqueName('', used)).toBe('field');
  });
});

describe('buildFormPdf', () => {
  it('adds real AcroForm fields to a PDF', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    doc.addPage([600, 800]);
    const base = await doc.save();
    const fields: FieldDef[] = [
      { id: 'a', page: 0, type: 'text', name: 'Full Name', x: 0.1, y: 0.1, w: 0.4, h: 0.04 },
      { id: 'b', page: 0, type: 'checkbox', name: 'Agree', x: 0.1, y: 0.2, w: 0.03, h: 0.02 },
    ];
    const out = await buildFormPdf(base, fields);
    const reloaded = await PDFDocument.load(out);
    const form = reloaded.getForm();
    expect(form.getFields().length).toBe(2);
    expect(form.getTextField('Full_Name')).toBeDefined();
    expect(form.getCheckBox('Agree')).toBeDefined();
  });
});
