/**
 * PDF/A export — ours, no external assets. PDF/A needs three things we now own:
 * a valid sRGB **OutputIntent** (our generated ICC profile, see icc.ts), **XMP**
 * metadata identifying the conformance level, and a file **ID**. We avoid the
 * font-embedding requirement entirely by producing an **image-based** PDF/A
 * (each page rasterized) — the standard archival approach, with zero fonts to
 * embed. Output is PDF/A-1b (image-only DCTDecode, no transparency).
 *
 * Honest caveat: image-based means no selectable text, and we can't run veraPDF
 * in-browser to certify — it's built to spec; validate with veraPDF to certify.
 */
import { srgbIccProfile } from './icc.js';

export interface PdfAPageImage {
  bytes: Uint8Array;
  type: 'jpg' | 'png';
  widthPt: number;
  heightPt: number;
}

const FIXED_DATE = 'D:20240101000000Z';
const XMP_DATE = '2024-01-01T00:00:00Z';

function xmpMetadata(title: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return (
    `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/">` +
    `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
    `<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">` +
    `<pdfaid:part>1</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description>` +
    `<rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/"><pdf:Producer>pdfcraft</pdf:Producer></rdf:Description>` +
    `<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">` +
    `<xmp:CreatorTool>pdfcraft</xmp:CreatorTool><xmp:CreateDate>${XMP_DATE}</xmp:CreateDate><xmp:ModifyDate>${XMP_DATE}</xmp:ModifyDate></rdf:Description>` +
    `<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">` +
    `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(title)}</rdf:li></rdf:Alt></dc:title></rdf:Description>` +
    `</rdf:RDF></x:xmpmeta>` +
    `<?xpacket end="w"?>`
  );
}

/**
 * Assemble a PDF/A-1b from already-rendered page images (pure pdf-lib, so it's
 * Node-testable). Adds the sRGB OutputIntent, XMP metadata, and file ID.
 */
export async function buildPdfA(pages: PdfAPageImage[], title = 'Document'): Promise<Uint8Array> {
  const { PDFDocument, PDFName, PDFString, PDFHexString } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setProducer('pdfcraft');
  pdf.setCreator('pdfcraft');

  for (const pg of pages.length ? pages : [{ bytes: new Uint8Array(), type: 'png' as const, widthPt: 612, heightPt: 792 }]) {
    const page = pdf.addPage([pg.widthPt, pg.heightPt]);
    if (pg.bytes.length) {
      const img = pg.type === 'jpg' ? await pdf.embedJpg(pg.bytes) : await pdf.embedPng(pg.bytes);
      page.drawImage(img, { x: 0, y: 0, width: pg.widthPt, height: pg.heightPt });
    }
  }

  // sRGB OutputIntent with our own ICC profile stream (/N 3).
  const iccRef = pdf.context.register(pdf.context.stream(srgbIccProfile(), { N: 3 }));
  const outputIntent = pdf.context.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFA1',
    OutputConditionIdentifier: PDFString.of('sRGB'),
    Info: PDFString.of('sRGB IEC61966-2.1'),
    DestOutputProfile: iccRef,
  });
  pdf.catalog.set(PDFName.of('OutputIntents'), pdf.context.obj([outputIntent]));

  // XMP metadata stream (uncompressed, as PDF/A requires).
  const meta = pdf.context.stream(new TextEncoder().encode(xmpMetadata(title)), { Type: 'Metadata', Subtype: 'XML' });
  pdf.catalog.set(PDFName.of('Metadata'), pdf.context.register(meta));

  // A stable file identifier in the trailer.
  const id = PDFHexString.of('0123456789ABCDEF0123456789ABCDEF');
  pdf.context.trailerInfo.ID = pdf.context.obj([id, id]);
  pdf.setCreationDate(new Date(XMP_DATE));
  pdf.setModificationDate(new Date(XMP_DATE));
  void FIXED_DATE;

  return pdf.save({ useObjectStreams: false });
}

interface PdfRenderDoc {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (o: { scale: number }) => { width: number; height: number };
    render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
  }>;
}

/**
 * Convert any PDF to image-based PDF/A-1b: rasterize each page (pdf.js) to JPEG
 * at the given DPI, then assemble with OutputIntent/XMP/ID. Browser-only (uses
 * canvas); the assembly half (buildPdfA) is covered by Node tests.
 */
export async function pdfToPdfA(bytes: Uint8Array, opts: { dpi?: number; quality?: number; title?: string } = {}): Promise<Uint8Array> {
  const { dpi = 150, quality = 0.85, title = 'Document' } = opts;
  const { loadDocument, getPdfjsDocument } = await import('@pdfcraft/engine');
  const handle = await loadDocument(bytes);
  const doc = getPdfjsDocument(handle) as unknown as PdfRenderDoc;
  const scale = dpi / 72;
  const pages: PdfAPageImage[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const ptVp = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', quality));
    pages.push({ bytes: new Uint8Array(await blob.arrayBuffer()), type: 'jpg', widthPt: ptVp.width, heightPt: ptVp.height });
  }
  return buildPdfA(pages, title);
}
