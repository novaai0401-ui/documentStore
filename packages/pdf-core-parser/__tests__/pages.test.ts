import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { PdfDocument, extractFormFields, saveFieldValues, decodeStream } from '../dist/index.js';
import type { PageOps } from '../dist/index.js';

/** Pages get DISTINCT widths so identity survives font subsetting — page i
 *  of a doc built with base width W has MediaBox width W+i. */
async function makePdf(count: number, baseWidth = 400): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  const font = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < count; i++) {
    const p = d.addPage([baseWidth + i, 300]);
    p.drawText(`page ${i + 1}`, { x: 40, y: 150, size: 14, font });
  }
  return new Uint8Array(await d.save());
}

async function run(bytes: Uint8Array, pages: PageOps): Promise<Uint8Array> {
  const doc = await PdfDocument.load(bytes);
  const fields = await extractFormFields(doc);
  return saveFieldValues(doc, fields, {}, [], [], {}, undefined, pages);
}

/** Walk the saved file in tree order: per-page { width, rotate, hasContent }. */
async function readPages(bytes: Uint8Array) {
  const doc = await PdfDocument.load(bytes);
  const catalog = await doc.resolveDict(doc.root!);
  const out: Array<{ width: number; rotate: number | undefined; contentBytes: number; hasParent: boolean }> = [];
  async function walk(r: unknown): Promise<void> {
    const d = await doc.resolveDict(r as never);
    const type = d.get('Type') as { value?: string } | undefined;
    if (type?.value === 'Page') {
      const mb = d.get('MediaBox') as { items?: Array<{ value: number }> } | undefined;
      const width = (mb?.items?.[2]?.value ?? 0) - (mb?.items?.[0]?.value ?? 0);
      let contentBytes = 0;
      const contents = d.get('Contents') as { kind: string; items?: unknown[] } | undefined;
      const items = contents?.kind === 'array' ? contents.items! : contents ? [contents] : [];
      for (const it of items) {
        const s = await doc.resolve(it as never);
        if ((s as { kind: string }).kind === 'stream') contentBytes += (await decodeStream(s as never)).length;
      }
      out.push({
        width,
        rotate: (d.get('Rotate') as { value: number } | undefined)?.value,
        contentBytes,
        hasParent: !!d.get('Parent'),
      });
      return;
    }
    const kids = d.get('Kids') as { items: unknown[] } | undefined;
    if (kids) for (const k of kids.items) await walk(k);
  }
  await walk(catalog.get('Pages'));
  return out;
}

describe('applyPageOps via saveFieldValues', () => {
  it('reorders and deletes pages', async () => {
    // 3 pages, widths 400/401/402; keep [3,1] → widths [402, 400].
    const out = await run(await makePdf(3), { order: [3, 1] });
    const pages = await readPages(out);
    expect(pages.map((p) => p.width)).toEqual([402, 400]);
    expect(pages.every((p) => p.contentBytes > 0)).toBe(true);
  });

  it('sets absolute rotation on the requested page only', async () => {
    const out = await run(await makePdf(2), { order: [1, 2], rotate: { 2: 90 } });
    const pages = await readPages(out);
    expect(pages[0]!.rotate).toBeUndefined();
    expect(pages[1]!.rotate).toBe(90);
  });

  it('appends pages from another document (merge) with graph intact', async () => {
    const a = await makePdf(1, 400); // width 400
    const docB = await PdfDocument.load(await makePdf(2, 500)); // widths 500, 501
    const docA = await PdfDocument.load(a);
    const fields = await extractFormFields(docA);
    const out = await saveFieldValues(docA, fields, {}, [], [], {}, undefined, { append: [docB] });
    const pages = await readPages(out);
    expect(pages.map((p) => p.width)).toEqual([400, 500, 501]);
    // copied pages carry real content streams and a Parent into the new tree
    expect(pages[1]!.contentBytes).toBeGreaterThan(0);
    expect(pages[2]!.contentBytes).toBeGreaterThan(0);
    expect(pages.every((p) => p.hasParent)).toBe(true);
  });

  it('refuses to produce a zero-page document', async () => {
    await expect(run(await makePdf(1), { order: [] })).rejects.toThrow(/zero pages/);
  });

  it('rejects out-of-range page numbers', async () => {
    await expect(run(await makePdf(1), { order: [2] })).rejects.toThrow(/out of range/);
  });

  it('full reverse keeps every page addressable', async () => {
    const out = await run(await makePdf(4), { order: [4, 3, 2, 1] });
    const pages = await readPages(out);
    expect(pages.map((p) => p.width)).toEqual([403, 402, 401, 400]);
  });
});

describe('applyPageOps AcroForm pruning', () => {
  async function makeFormPdf(): Promise<Uint8Array> {
    const d = await PDFDocument.create();
    const p1 = d.addPage([400, 300]);
    const p2 = d.addPage([400, 300]);
    const form = d.getForm();
    const f1 = form.createTextField('on_page1');
    f1.addToPage(p1, { x: 40, y: 100, width: 160, height: 18 });
    const f2 = form.createTextField('on_page2');
    f2.addToPage(p2, { x: 40, y: 100, width: 160, height: 18 });
    return new Uint8Array(await d.save());
  }

  async function fieldNames(bytes: Uint8Array): Promise<string[]> {
    const doc = await PdfDocument.load(bytes);
    const cat = await doc.resolveDict(doc.root!);
    const af = cat.get('AcroForm') as unknown;
    if (!af) return [];
    const afd = await doc.resolveDict(af as never);
    const fields = afd.get('Fields') as { kind: string; items?: unknown[] } | undefined;
    if (fields?.kind !== 'array') return [];
    const names: string[] = [];
    for (const fr of fields.items!) {
      const fd = await doc.resolveDict(fr as never);
      const t = fd.get('T') as { kind: string; value: Uint8Array } | undefined;
      if (t?.kind === 'string') {
        const v = t.value;
        // pdf-lib writes /T as UTF-16BE with a FE FF BOM.
        let s = '';
        if (v[0] === 0xfe && v[1] === 0xff) {
          for (let i = 2; i + 1 < v.length; i += 2) s += String.fromCharCode((v[i]! << 8) | v[i + 1]!);
        } else {
          for (const b of v) s += String.fromCharCode(b);
        }
        names.push(s);
      }
    }
    return names;
  }

  it('drops a field whose widget was on a deleted page, keeps the survivor', async () => {
    const bytes = await makeFormPdf();
    expect((await fieldNames(bytes)).sort()).toEqual(['on_page1', 'on_page2']);
    const out = await run(bytes, { order: [1] }); // delete page 2
    expect(await fieldNames(out)).toEqual(['on_page1']);
  });

  it('keeps all fields when no page is deleted (reorder only)', async () => {
    const out = await run(await makeFormPdf(), { order: [2, 1] });
    expect((await fieldNames(out)).sort()).toEqual(['on_page1', 'on_page2']);
  });
});
