/**
 * OpenDocument (.odt / .odp) → PDF — ours. ODF files are zips with a
 * `content.xml`; we unzip (fflate) and pull the text structure (headings,
 * paragraphs, tables for text docs; per-slide text for presentations) into our
 * block model, then render with the shared layout. Spreadsheets (.ods) go
 * through SheetJS (which reads ODS) via the xlsx path, so they aren't here.
 */
import { decodeEntities, blocksToPdf, type DocBlock } from './convert.js';

const strip = (s: string) =>
  decodeEntities(s.replace(/<text:tab\/>/g, '    ').replace(/<text:(line-break|s)\/>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

function odtTable(xml: string): string[][] {
  const rows: string[][] = [];
  const rowRe = /<table:table-row\b[^>]*>([\s\S]*?)<\/table:table-row>/g;
  let r: RegExpExecArray | null;
  while ((r = rowRe.exec(xml))) {
    const cells: string[] = [];
    const cellRe = /<table:table-cell\b[^>]*>([\s\S]*?)<\/table:table-cell>/g;
    let c: RegExpExecArray | null;
    while ((c = cellRe.exec(r[1]!))) cells.push(strip(c[1]!));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function odtBlocks(xml: string): DocBlock[] {
  const body = /<office:text\b[^>]*>([\s\S]*?)<\/office:text>/.exec(xml)?.[1] ?? xml;
  const items: Array<{ index: number; block: DocBlock }> = [];
  const tableRanges: Array<{ start: number; end: number }> = [];
  const tblRe = /<table:table\b[^>]*>[\s\S]*?<\/table:table>/g;
  let tm: RegExpExecArray | null;
  while ((tm = tblRe.exec(body))) {
    tableRanges.push({ start: tm.index, end: tm.index + tm[0].length });
    const rows = odtTable(tm[0]);
    if (rows.length) items.push({ index: tm.index, block: { type: 'table', rows } });
  }
  const inTable = (i: number) => tableRanges.some((r) => i >= r.start && i < r.end);
  const elRe = /<text:(h|p)\b([^>]*)>([\s\S]*?)<\/text:\1>/g;
  let m: RegExpExecArray | null;
  while ((m = elRe.exec(body))) {
    if (inTable(m.index)) continue;
    const text = strip(m[3]!);
    if (!text) continue;
    if (m[1] === 'h') {
      const lvl = Math.min(3, Math.max(1, Number(/text:outline-level="(\d+)"/.exec(m[2]!)?.[1] ?? 1)));
      items.push({ index: m.index, block: { type: `h${lvl}` as 'h1' | 'h2' | 'h3', text } });
    } else {
      items.push({ index: m.index, block: { type: 'p', text } });
    }
  }
  items.sort((a, b) => a.index - b.index);
  return items.map((x) => x.block);
}

async function readContent(bytes: Uint8Array): Promise<string> {
  const { unzipSync, strFromU8 } = await import('fflate');
  const files = unzipSync(bytes);
  const c = files['content.xml'];
  if (!c) throw new Error('Not an OpenDocument file');
  return strFromU8(c);
}

export async function odtToPdf(bytes: Uint8Array): Promise<Uint8Array> {
  const blocks = odtBlocks(await readContent(bytes));
  return blocksToPdf(blocks.length ? blocks : [{ type: 'p', text: '' }]);
}

export async function odpToPdf(bytes: Uint8Array): Promise<Uint8Array> {
  const xml = await readContent(bytes);
  const blocks: DocBlock[] = [];
  const pageRe = /<draw:page\b[^>]*>([\s\S]*?)<\/draw:page>/g;
  let pm: RegExpExecArray | null;
  let n = 0;
  while ((pm = pageRe.exec(xml))) {
    n++;
    blocks.push({ type: 'h2', text: `Slide ${n}` });
    const pRe = /<text:p\b[^>]*>([\s\S]*?)<\/text:p>/g;
    let tp: RegExpExecArray | null;
    while ((tp = pRe.exec(pm[1]!))) { const t = strip(tp[1]!); if (t) blocks.push({ type: 'p', text: t }); }
  }
  return blocksToPdf(blocks.length ? blocks : [{ type: 'p', text: '' }]);
}

/** Parse an .odt and return editable HTML for the Word editor. */
export async function odtToEditableHtml(bytes: Uint8Array): Promise<string> {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const blocks = odtBlocks(await readContent(bytes));
  return blocks.map((b) => {
    if (b.type === 'table') return `<table border="1" style="border-collapse:collapse">${b.rows!.map((r) => `<tr>${r.map((c) => `<td style="border:1px solid #ccc;padding:4px">${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
    if (b.type === 'h1') return `<h1>${esc(b.text!)}</h1>`;
    if (b.type === 'h2') return `<h2>${esc(b.text!)}</h2>`;
    if (b.type === 'h3') return `<h3>${esc(b.text!)}</h3>`;
    if (b.type === 'li') return `<ul><li>${esc(b.text!)}</li></ul>`;
    return `<p>${esc('text' in b ? b.text : '')}</p>`;
  }).join('\n');
}

/** Parse an .odp into editable slides (first paragraph → title, rest → body). */
export async function odpToSlides(bytes: Uint8Array): Promise<Array<{ title: string; body: string[] }>> {
  const xml = await readContent(bytes);
  const out: Array<{ title: string; body: string[] }> = [];
  const pageRe = /<draw:page\b[^>]*>([\s\S]*?)<\/draw:page>/g;
  let pm: RegExpExecArray | null;
  let i = 0;
  while ((pm = pageRe.exec(xml))) {
    i++;
    const paras: string[] = [];
    const pRe = /<text:p\b[^>]*>([\s\S]*?)<\/text:p>/g;
    let tp: RegExpExecArray | null;
    while ((tp = pRe.exec(pm[1]!))) { const t = strip(tp[1]!); if (t) paras.push(t); }
    out.push({ title: paras[0] ?? `Slide ${i}`, body: paras.slice(1) });
  }
  return out.length ? out : [{ title: 'Slide 1', body: [] }];
}

export { odtBlocks };
