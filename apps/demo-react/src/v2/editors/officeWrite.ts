/**
 * Serialize edited rich-text HTML (from the Word editor's contenteditable) back
 * to a real .docx — ours, DOM-based. Walks block elements (h1–3, p, li) and
 * inline formatting (b/strong, i/em, u) into OOXML runs, then wraps them in a
 * hand-built package (reusing our zip writer). Browser-only (uses DOMParser).
 */
import { zipStore } from '../smart/zip.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const xesc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Fmt { bold?: boolean; italic?: boolean; underline?: boolean }

/** Page layout for the document's section (margins are in twips; 1 inch = 1440). */
export interface PageSetup { size?: 'letter' | 'a4' | 'legal'; orientation?: 'portrait' | 'landscape'; margin?: 'normal' | 'narrow' | 'wide'; columns?: number }
const PAGE_SIZES: Record<string, { w: number; h: number }> = {
  letter: { w: 12240, h: 15840 },
  a4: { w: 11906, h: 16838 },
  legal: { w: 12240, h: 20160 },
};
const MARGINS: Record<string, number> = { normal: 1440, narrow: 720, wide: 1800 };

/** Build the OOXML <w:sectPr> describing page size, orientation, margins and columns. */
export function sectPr(page?: PageSetup): string {
  const size = PAGE_SIZES[page?.size ?? 'letter'] ?? PAGE_SIZES.letter!;
  const landscape = page?.orientation === 'landscape';
  const w = landscape ? size.h : size.w;
  const h = landscape ? size.w : size.h;
  const m = MARGINS[page?.margin ?? 'normal'] ?? 1440;
  const cols = Math.max(1, Math.min(3, page?.columns ?? 1));
  return (
    `<w:sectPr>` +
    `<w:pgSz w:w="${w}" w:h="${h}"${landscape ? ' w:orient="landscape"' : ''}/>` +
    `<w:pgMar w:top="${m}" w:right="${m}" w:bottom="${m}" w:left="${m}" w:header="720" w:footer="720" w:gutter="0"/>` +
    (cols > 1 ? `<w:cols w:num="${cols}" w:space="708" w:equalWidth="1"/>` : `<w:cols w:space="708"/>`) +
    `</w:sectPr>`
  );
}

function runsFromNode(node: Node, fmt: Fmt, out: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? '';
    if (!text) return;
    const props =
      (fmt.bold ? '<w:b/>' : '') + (fmt.italic ? '<w:i/>' : '') + (fmt.underline ? '<w:u w:val="single"/>' : '');
    out.push(`<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${xesc(text)}</w:t></w:r>`);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === 'br') { out.push('<w:r><w:br/></w:r>'); return; }
  const next: Fmt = {
    bold: fmt.bold || tag === 'b' || tag === 'strong' || el.style.fontWeight === 'bold' || el.style.fontWeight === '700',
    italic: fmt.italic || tag === 'i' || tag === 'em' || el.style.fontStyle === 'italic',
    underline: fmt.underline || tag === 'u' || el.style.textDecoration.includes('underline'),
  };
  el.childNodes.forEach((c) => runsFromNode(c, next, out));
}

function paragraph(el: HTMLElement): string {
  const runs: string[] = [];
  el.childNodes.forEach((c) => runsFromNode(c, {}, runs));
  const tag = el.tagName.toLowerCase();
  const h = /^h([1-6])$/.exec(tag);
  const align = (el.style.textAlign || '').toLowerCase();
  const jc = align === 'center' ? '<w:jc w:val="center"/>' : align === 'right' ? '<w:jc w:val="right"/>' : align === 'justify' ? '<w:jc w:val="both"/>' : '';
  const style = h ? `<w:pStyle w:val="Heading${Math.min(3, Number(h[1]))}"/>` : '';
  const pPr = style || jc ? `<w:pPr>${style}${jc}</w:pPr>` : '';
  return `<w:p>${pPr}${runs.join('') || '<w:r><w:t/></w:r>'}</w:p>`;
}

/** Convert contenteditable HTML to a .docx package. */
export function htmlToDocx(html: string, page?: PageSetup): Uint8Array {
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, 'text/html');
  const paras: string[] = [];
  const walk = (parent: ParentNode) => {
    parent.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if ((node.textContent ?? '').trim()) paras.push(`<w:p><w:r><w:t xml:space="preserve">${xesc(node.textContent!)}</w:t></w:r></w:p>`);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (tag === 'ul' || tag === 'ol' || tag === 'div' || tag === 'section') { walk(el); return; }
      if (tag === 'li') { paras.push(paragraph(el).replace('<w:p>', '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>').replace('<w:pPr>', '').replace('</w:pPr>', '')); return; }
      if (/^(h[1-6]|p|blockquote)$/.test(tag)) { paras.push(paragraph(el)); return; }
      // Unknown block: emit its text as a paragraph.
      if ((el.textContent ?? '').trim()) paras.push(paragraph(el));
    });
  };
  walk(doc.body);
  if (!paras.length) paras.push('<w:p/>');

  const enc = new TextEncoder();
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${paras.join('')}${sectPr(page)}</w:body></w:document>`;
  const headingStyle = (id: number, size: number) =>
    `<w:style w:type="paragraph" w:styleId="Heading${id}"><w:name w:val="heading ${id}"/><w:pPr><w:keepNext/><w:outlineLvl w:val="${id - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr></w:style>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${headingStyle(1, 36)}${headingStyle(2, 28)}${headingStyle(3, 24)}</w:styles>`;
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  return zipStore([
    { name: '[Content_Types].xml', data: enc.encode(ct) },
    { name: '_rels/.rels', data: enc.encode(rels) },
    { name: 'word/document.xml', data: enc.encode(documentXml) },
    { name: 'word/styles.xml', data: enc.encode(stylesXml) },
    { name: 'word/_rels/document.xml.rels', data: enc.encode(docRels) },
  ]);
}
