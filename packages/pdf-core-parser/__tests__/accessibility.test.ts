import { describe, it, expect, beforeAll } from 'vitest';
import { PDFDocument } from 'pdf-lib';
// Exercise the compiled bundle, like the other parser tests.
import { PdfDocument, extractFormFields, saveFieldValues, decodeStream } from '../dist/index.js';

async function makePdf(pages = 2): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([600, 800]);
    page.drawText(`Page ${i + 1} body text`, { x: 50, y: 700, size: 12 });
  }
  return doc.save();
}

const text = (u: Uint8Array) => new TextDecoder().decode(u);

describe('tagAccessibility (PDF/UA structure + marked content)', () => {
  let tagged: Uint8Array;
  let reloaded: InstanceType<typeof PdfDocument>;

  beforeAll(async () => {
    const doc = await PdfDocument.load(await makePdf(2));
    const fields = await extractFormFields(doc);
    tagged = await saveFieldValues(doc, fields, {}, [], [], { title: 'T' }, {
      lang: 'en-US',
      headings: [{ page: 1, level: 1, text: 'Intro' }],
    });
    reloaded = await PdfDocument.load(tagged);
  });

  it('writes catalog MarkInfo / Lang / ViewerPreferences', async () => {
    const cat = await reloaded.resolveDict(reloaded.root);
    const markInfo = await reloaded.resolveDict(cat.get('MarkInfo')!);
    expect(markInfo.get('Marked')).toMatchObject({ kind: 'bool', value: true });

    const lang = cat.get('Lang')!;
    expect(lang.kind).toBe('string');
    expect(text((lang as { value: Uint8Array }).value)).toBe('en-US');

    const vp = await reloaded.resolveDict(cat.get('ViewerPreferences')!);
    expect(vp.get('DisplayDocTitle')).toMatchObject({ kind: 'bool', value: true });
  });

  it('builds a StructTreeRoot → Document → per-page /P tree with a ParentTree', async () => {
    const cat = await reloaded.resolveDict(reloaded.root);
    const str = await reloaded.resolveDict(cat.get('StructTreeRoot')!);
    expect(str.get('Type')).toMatchObject({ kind: 'name', value: 'StructTreeRoot' });
    expect(str.get('ParentTreeNextKey')).toMatchObject({ kind: 'num', value: 2 });

    const docElem = await reloaded.resolveDict(str.get('K')!);
    expect(docElem.get('S')).toMatchObject({ kind: 'name', value: 'Document' });
    const kids = docElem.get('K')!;
    expect(kids.kind).toBe('array');
    expect((kids as { items: unknown[] }).items).toHaveLength(2);

    // Each page element is a /P bound to MCID 0 with a /Pg back-reference.
    const first = await reloaded.resolveDict((kids as { items: never[] }).items[0]);
    expect(first.get('S')).toMatchObject({ kind: 'name', value: 'P' });
    expect(first.get('K')).toMatchObject({ kind: 'num', value: 0 });
    expect(first.get('Pg')).toBeTruthy();

    const pt = await reloaded.resolveDict(str.get('ParentTree')!);
    const nums = pt.get('Nums')!;
    expect(nums.kind).toBe('array');
    // 2 pages → 4 entries (key, [elem]) × 2.
    expect((nums as { items: unknown[] }).items).toHaveLength(4);
  });

  it('brackets each text object in balanced BDC…EMC and sets /StructParents', async () => {
    const cat = await reloaded.resolveDict(reloaded.root);
    const pagesRef = cat.get('Pages')!;
    const firstPage = await firstLeaf(reloaded, pagesRef);
    const pd = await reloaded.resolveDict(firstPage);

    expect(pd.get('StructParents')).toMatchObject({ kind: 'num', value: 0 });

    // Per-paragraph tagging rewrites the streams in place: gather all
    // content text and assert MCID brackets are present and balanced.
    const contents = pd.get('Contents')!;
    const items = contents.kind === 'array' ? (contents as { items: never[] }).items : [contents as never];
    let combined = '';
    for (const it of items) {
      const sObj = await reloaded.resolve(it);
      combined += text(await decodeStream(sObj as never));
    }
    expect(combined).toContain('/P <</MCID 0>> BDC');
    const bdc = (combined.match(/ BDC/g) ?? []).length;
    const emc = (combined.match(/EMC/g) ?? []).length;
    expect(bdc).toBeGreaterThanOrEqual(1);
    expect(bdc).toBe(emc);
    // Each BT is preceded by a BDC bracket; each ET followed by EMC.
    expect((combined.match(/BT/g) ?? []).length).toBe(bdc);
  });

  it('gives each text object its own MCID + StructElem (multi-paragraph page)', async () => {
    const { PDFDocument: PL, StandardFonts } = await import('pdf-lib');
    const d = await PL.create();
    const pg = d.addPage([400, 300]);
    const font = await d.embedFont(StandardFonts.Helvetica);
    pg.drawText('first para', { x: 40, y: 220, size: 12, font });
    pg.drawText('second para', { x: 40, y: 120, size: 12, font });
    const src = await PdfDocument.load(new Uint8Array(await d.save()));
    const fields = await extractFormFields(src);
    const out = await saveFieldValues(src, fields, {}, [], [], {}, { lang: 'en-US' });
    const doc2 = await PdfDocument.load(out);

    const cat = await doc2.resolveDict(doc2.root!);
    const str = await doc2.resolveDict(cat.get('StructTreeRoot')!);
    const docElem = await doc2.resolveDict(str.get('K')!);
    const kids = docElem.get('K') as { items: unknown[] };
    expect(kids.items.length).toBe(2); // one /P per text object

    // ParentTree page-0 array has two entries (MCID 0 and 1).
    const pt = await doc2.resolveDict(str.get('ParentTree')!);
    const nums = pt.get('Nums') as { items: never[] };
    const arr0 = await doc2.resolve(nums.items[1]);
    expect((arr0 as { items: unknown[] }).items.length).toBe(2);

    // Stream carries both MCIDs.
    const firstPage = await firstLeaf(doc2, cat.get('Pages'));
    const pd = await doc2.resolveDict(firstPage as never);
    const contents = pd.get('Contents')!;
    const items = contents.kind === 'array' ? (contents as { items: never[] }).items : [contents as never];
    let combined = '';
    for (const it of items) combined += text(await decodeStream((await doc2.resolve(it)) as never));
    expect(combined).toContain('/P <</MCID 0>> BDC');
    expect(combined).toContain('/P <</MCID 1>> BDC');
  });

  it('still re-parses cleanly (incremental update is valid)', async () => {
    // The tagged bytes already loaded in beforeAll without throwing; confirm
    // the catalog + page tree resolve and form extraction runs end-to-end.
    const cat = await reloaded.resolveDict(reloaded.root);
    expect(cat.get('Pages')).toBeTruthy();
    await expect(extractFormFields(reloaded)).resolves.toBeTruthy();
  });
});

async function firstLeaf(doc: InstanceType<typeof PdfDocument>, ref: unknown): Promise<unknown> {
  const d = await doc.resolveDict(ref as never);
  const type = d.get('Type');
  if (type && (type as { value?: string }).value === 'Page') return ref;
  const kids = d.get('Kids') as { items: unknown[] } | undefined;
  return firstLeaf(doc, kids!.items[0]);
}

describe('readAccessibilitySummary', () => {
  it('reports false/null on an untagged document', async () => {
    const { PdfDocument: PD, readAccessibilitySummary } = await import('../dist/index.js');
    const doc = await PD.load(await makePdf(1));
    const s = await readAccessibilitySummary(doc);
    expect(s.marked).toBe(false);
    expect(s.hasStructTree).toBe(false);
    expect(s.lang).toBeNull();
    expect(s.displayDocTitle).toBe(false);
  });

  it('reads back what tagAccessibility wrote', async () => {
    const { PdfDocument: PD, readAccessibilitySummary } = await import('../dist/index.js');
    const src = await PD.load(await makePdf(1));
    const fields = await extractFormFields(src);
    const taggedBytes = await saveFieldValues(src, fields, {}, [], [], { title: 'T' }, { lang: 'en-US' });
    const doc = await PD.load(taggedBytes);
    const s = await readAccessibilitySummary(doc);
    expect(s.marked).toBe(true);
    expect(s.hasStructTree).toBe(true);
    expect(s.lang).toBe('en-US');
    expect(s.displayDocTitle).toBe(true);
  });
});
