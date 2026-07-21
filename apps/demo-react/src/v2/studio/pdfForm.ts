/**
 * PDF form builder core — place fillable AcroForm fields on a PDF and bake them
 * in with pdf-lib, 100% in the browser. Field positions are stored as fractions
 * of each page (0–1, top-left origin) so they're independent of the on-screen
 * preview size; fracToPdfRect flips them into PDF's bottom-left point space.
 */

export type FieldType = 'text' | 'checkbox';
export interface FieldDef { id: string; page: number; type: FieldType; name: string; x: number; y: number; w: number; h: number }

/** Convert a fractional (top-left origin) field rect to PDF points (bottom-left origin). */
export function fracToPdfRect(f: { x: number; y: number; w: number; h: number }, ptW: number, ptH: number): { x: number; y: number; width: number; height: number } {
  const width = f.w * ptW;
  const height = f.h * ptH;
  const x = f.x * ptW;
  const y = ptH - f.y * ptH - height; // flip Y origin
  return { x, y, width, height };
}

/** Ensure field names are unique and identifier-safe (pdf-lib rejects dupes). */
export function uniqueName(base: string, used: Set<string>): string {
  let name = (base || 'field').trim().replace(/\s+/g, '_').replace(/[^\w-]/g, '') || 'field';
  let n = name, i = 1;
  while (used.has(n)) n = `${name}_${++i}`;
  used.add(n);
  return n;
}

/** Bake the placed fields into the PDF as real, fillable AcroForm widgets. */
export async function buildFormPdf(bytes: Uint8Array, fields: FieldDef[]): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.load(bytes);
  const form = pdf.getForm();
  const pages = pdf.getPages();
  const used = new Set<string>();
  for (const f of fields) {
    const page = pages[f.page];
    if (!page) continue;
    const { width: ptW, height: ptH } = page.getSize();
    const r = fracToPdfRect(f, ptW, ptH);
    const name = uniqueName(f.name, used);
    if (f.type === 'checkbox') {
      const cb = form.createCheckBox(name);
      cb.addToPage(page, { x: r.x, y: r.y, width: r.width, height: r.height, borderWidth: 1, borderColor: rgb(0.4, 0.4, 0.4) });
    } else {
      const tf = form.createTextField(name);
      tf.addToPage(page, { x: r.x, y: r.y, width: r.width, height: r.height, borderWidth: 1, borderColor: rgb(0.4, 0.4, 0.4) });
    }
  }
  return pdf.save();
}
