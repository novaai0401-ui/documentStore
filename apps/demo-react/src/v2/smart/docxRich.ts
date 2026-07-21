/**
 * Richer DOCX → PDF — ours. mammoth gives semantic structure but drops direct
 * run formatting (colour, size, underline) and paragraph alignment. Here we
 * unzip the .docx ourselves (fflate) and parse `word/document.xml` run/paragraph
 * properties directly, then render with real bold/italic/underline/colour/size
 * and left/center/right/justify alignment. Tables and embedded images carry
 * through too. Not a full layout engine (no columns/floats), but a big fidelity
 * jump over structure-only conversion — and pure code, no assets.
 */
import { decodeEntities, winAnsiSafe, type PdfTheme } from './convert.js';

export interface DocxRun { text: string; bold?: boolean; italic?: boolean; underline?: boolean; color?: string; size?: number }
export interface DocxBlock {
  type: 'para' | 'table' | 'image';
  runs?: DocxRun[];
  level?: number; // heading level 0 (body) … 6
  align?: 'left' | 'center' | 'right' | 'justify';
  bullet?: boolean;
  rows?: string[][];
  data?: Uint8Array;
  fmt?: 'png' | 'jpg';
}

const tx = (s: string) => decodeEntities(s.replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n').replace(/<[^>]+>/g, ''));

/** Parse the runs inside one `<w:p>` body, honouring `<w:rPr>` formatting. */
function parseRuns(pXml: string): DocxRun[] {
  const runs: DocxRun[] = [];
  const rRe = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g;
  let m: RegExpExecArray | null;
  while ((m = rRe.exec(pXml))) {
    const body = m[1]!;
    const rPr = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(body)?.[1] ?? '';
    const onOff = (tag: string) => { const e = new RegExp(`<w:${tag}(\\s+w:val="([^"]*)")?\\s*/?>`).exec(rPr); return e ? e[2] !== 'false' && e[2] !== '0' : false; };
    const color = /<w:color\s+w:val="([0-9A-Fa-f]{6})"/.exec(rPr)?.[1];
    const sz = /<w:sz\s+w:val="(\d+)"/.exec(rPr)?.[1];
    const uVal = /<w:u\b[^>]*w:val="([^"]*)"/.exec(rPr)?.[1];
    let text = '';
    const tRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g;
    let t: RegExpExecArray | null;
    while ((t = tRe.exec(body))) text += t[1] !== undefined ? decodeEntities(t[1]) : t[0] === '<w:tab/>' ? '    ' : '\n';
    if (!text) continue;
    runs.push({
      text,
      bold: onOff('b') || undefined,
      italic: onOff('i') || undefined,
      underline: (uVal !== undefined && uVal !== 'none') || undefined,
      color: color && color.toLowerCase() !== '000000' ? `#${color}` : undefined,
      size: sz ? Number(sz) / 2 : undefined,
    });
  }
  return runs;
}

function parseTable(tblXml: string): string[][] {
  const rows: string[][] = [];
  const trRe = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g;
  let tr: RegExpExecArray | null;
  while ((tr = trRe.exec(tblXml))) {
    const cells: string[] = [];
    const tcRe = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g;
    let tc: RegExpExecArray | null;
    while ((tc = tcRe.exec(tr[1]!))) cells.push(tx(tc[1]!).replace(/\s+/g, ' ').trim());
    if (cells.length) rows.push(cells);
  }
  return rows;
}

/** Parse a .docx into rich blocks (paragraphs with formatted runs, tables,
 *  images). Returns null if it doesn't look like a parseable docx. */
export async function parseDocxRich(bytes: Uint8Array): Promise<DocxBlock[] | null> {
  try {
    const { unzipSync, strFromU8 } = await import('fflate');
    const files = unzipSync(bytes);
    const docXml = files['word/document.xml'];
    if (!docXml) return null;
    const xml = strFromU8(docXml);
    const relsXml = files['word/_rels/document.xml.rels'] ? strFromU8(files['word/_rels/document.xml.rels']) : '';
    const rels = new Map<string, string>();
    const relRe = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g;
    let rm: RegExpExecArray | null;
    while ((rm = relRe.exec(relsXml))) rels.set(rm[1]!, rm[2]!);

    const body = /<w:body>([\s\S]*?)<\/w:body>/.exec(xml)?.[1] ?? xml;
    const blocks: DocxBlock[] = [];
    // Walk top-level <w:p> and <w:tbl> in order.
    const elRe = /<w:(p|tbl)\b[^>]*>[\s\S]*?<\/w:\1>/g;
    let e: RegExpExecArray | null;
    while ((e = elRe.exec(body))) {
      const kind = e[1]!;
      const chunk = e[0];
      if (kind === 'tbl') { const rows = parseTable(chunk); if (rows.length) blocks.push({ type: 'table', rows }); continue; }
      // paragraph
      const pPr = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(chunk)?.[1] ?? '';
      const styleId = /<w:pStyle\s+w:val="([^"]+)"/.exec(pPr)?.[1] ?? '';
      const level = /Heading(\d)/i.exec(styleId) ? Number(/Heading(\d)/i.exec(styleId)![1]) : /Title/i.test(styleId) ? 1 : 0;
      const jc = /<w:jc\s+w:val="([^"]+)"/.exec(pPr)?.[1];
      const align = jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : jc === 'both' || jc === 'justify' ? 'justify' : 'left';
      const bullet = /<w:numPr>/.test(pPr);
      // Embedded image?
      const embed = /<a:blip\b[^>]*r:embed="([^"]+)"/.exec(chunk)?.[1];
      if (embed && rels.has(embed)) {
        const target = rels.get(embed)!.replace(/^\//, '').replace(/^word\//, '');
        const media = files[`word/${target}`] ?? files[target];
        if (media) {
          const fmt = /\.png$/i.test(target) ? 'png' : 'jpg';
          blocks.push({ type: 'image', data: media, fmt });
        }
      }
      const runs = parseRuns(chunk);
      if (runs.length || level) blocks.push({ type: 'para', runs, level, align, bullet });
    }
    return blocks.length ? blocks : null;
  } catch {
    return null;
  }
}

// ── rich blocks → editable HTML (for the Word editor) ──────────────────────────

const htmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function b64(u8: Uint8Array): string { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]!); return btoa(s); }

export function richBlocksToHtml(blocks: DocxBlock[]): string {
  const runHtml = (r: DocxRun) => {
    let t = htmlEsc(r.text);
    if (r.bold) t = `<b>${t}</b>`;
    if (r.italic) t = `<i>${t}</i>`;
    if (r.underline) t = `<u>${t}</u>`;
    const styles: string[] = [];
    if (r.color) styles.push(`color:${r.color}`);
    if (r.size) styles.push(`font-size:${r.size}pt`);
    return styles.length ? `<span style="${styles.join(';')}">${t}</span>` : t;
  };
  return blocks.map((b) => {
    if (b.type === 'table') {
      return `<table border="1" style="border-collapse:collapse">${(b.rows ?? []).map((r) => `<tr>${r.map((c) => `<td style="border:1px solid #ccc;padding:4px">${htmlEsc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
    }
    if (b.type === 'image' && b.data) {
      return `<p><img src="data:image/${b.fmt === 'jpg' ? 'jpeg' : 'png'};base64,${b64(b.data)}" style="max-width:100%"/></p>`;
    }
    const inner = (b.runs ?? []).map(runHtml).join('') || '<br>';
    const align = b.align && b.align !== 'left' ? ` style="text-align:${b.align}"` : '';
    if (b.level) { const l = Math.min(3, b.level); return `<h${l}${align}>${inner}</h${l}>`; }
    if (b.bullet) return `<ul><li>${inner}</li></ul>`;
    return `<p${align}>${inner}</p>`;
  }).join('\n');
}

/** Parse a .docx and return editable HTML for the Word editor. */
export async function docxToEditableHtml(bytes: Uint8Array): Promise<string> {
  const blocks = await parseDocxRich(bytes);
  return blocks ? richBlocksToHtml(blocks) : '';
}

// ── render rich blocks to PDF ────────────────────────────────────────────────────

const PAGE_W = 612, PAGE_H = 792, MARGIN = 54;

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

export async function richBlocksToPdf(blocks: DocxBlock[], theme?: PdfTheme): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const fonts = {
    normal: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  const pick = (r: DocxRun) => (r.bold && r.italic ? fonts.boldItalic : r.bold ? fonts.bold : r.italic ? fonts.italic : fonts.normal);
  const maxW = PAGE_W - MARGIN * 2;
  const themeBg = theme ? hexRgb(theme.bg) : null;
  const paintBg = () => { if (themeBg) page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: rgb(themeBg[0], themeBg[1], themeBg[2]) }); };
  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  paintBg();
  const newPage = () => { page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; paintBg(); };
  const ink = theme ? rgb(...hexRgb(theme.fg)) : rgb(0.1, 0.12, 0.16);
  const headInk = theme ? rgb(...hexRgb(theme.heading)) : ink;

  // Break runs into styled words; lay them into lines that fit maxW.
  interface Word { text: string; run: DocxRun; w: number; size: number }
  const headingSize = (lvl: number) => [0, 22, 17, 14, 12, 11, 11][lvl] ?? 11;

  const drawPara = (b: DocxBlock) => {
    const baseSize = b.level ? headingSize(b.level) : 11;
    const indent = b.bullet ? 16 : 0;
    const avail = maxW - indent;
    const words: Word[] = [];
    const runs = b.runs ?? [];
    for (const r of runs) {
      const size = r.size ?? baseSize;
      const font = pick(r);
      for (const tok of winAnsiSafe(r.text).split(/(\s+)/)) {
        if (tok === '') continue;
        words.push({ text: tok, run: r, w: font.widthOfTextAtSize(tok, size), size });
      }
    }
    if (b.bullet) words.unshift({ text: '•  ', run: {} as DocxRun, w: fonts.normal.widthOfTextAtSize('•  ', baseSize), size: baseSize });
    // Wrap into lines.
    const lines: Word[][] = [];
    let cur: Word[] = [];
    let lineW = 0;
    for (const wd of words) {
      if (/^\s+$/.test(wd.text)) { if (cur.length) { cur.push(wd); lineW += wd.w; } continue; }
      if (lineW + wd.w > avail && cur.length) { lines.push(cur); cur = []; lineW = 0; }
      cur.push(wd); lineW += wd.w;
    }
    if (cur.length) lines.push(cur);
    y -= b.level ? baseSize * 0.6 + 6 : 6;
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li]!;
      const lineH = Math.max(...line.map((w) => w.size)) * 1.35;
      if (y - lineH < MARGIN) newPage();
      const used = line.reduce((n, w) => n + w.w, 0);
      let x = MARGIN + indent;
      if (b.align === 'center') x += (avail - used) / 2;
      else if (b.align === 'right') x += avail - used;
      const isLast = li === lines.length - 1;
      const gaps = line.filter((w) => /^\s+$/.test(w.text)).length;
      const extra = b.align === 'justify' && !isLast && gaps > 0 ? (avail - used) / gaps : 0;
      for (const wd of line) {
        const font = pick(wd.run);
        const col = wd.run.color ? hexRgb(wd.run.color) : null;
        page.drawText(wd.text, { x, y: y - wd.size, size: wd.size, font, color: col ? rgb(col[0], col[1], col[2]) : (b.level ? headInk : ink) });
        if (wd.run.underline && wd.text.trim()) page.drawLine({ start: { x, y: y - wd.size - 1 }, end: { x: x + wd.w, y: y - wd.size - 1 }, thickness: 0.5, color: col ? rgb(col[0], col[1], col[2]) : ink });
        x += wd.w + (/^\s+$/.test(wd.text) ? extra : 0);
      }
      y -= lineH;
    }
    y -= b.level ? 4 : 2;
  };

  const drawTable = (rows: string[][]) => {
    const cols = Math.max(1, ...rows.map((r) => r.length));
    const size = cols >= 9 ? 7 : cols >= 6 ? 8 : 9, pad = 3, lineH = size * 1.25;
    const colW = maxW / cols;
    const avail = colW - pad * 2;
    y -= 8;
    rows.forEach((r, ri) => {
      const cells = Array.from({ length: cols }, (_, c) => (r[c] ?? ''));
      const font = ri === 0 ? fonts.bold : fonts.normal;
      const wrapCell = (raw: string) => {
        const txt = winAnsiSafe(raw);
        const out: string[] = []; let line = '';
        for (const word of txt.split(/\s+/).filter(Boolean)) {
          // Break a word that's wider than the cell so it never overflows.
          if (font.widthOfTextAtSize(word, size) > avail) {
            if (line) { out.push(line); line = ''; }
            let chunk = '';
            for (const ch of word) {
              if (chunk && font.widthOfTextAtSize(chunk + ch, size) > avail) { out.push(chunk); chunk = ch; }
              else chunk += ch;
            }
            line = chunk;
            continue;
          }
          const trial = line ? line + ' ' + word : word;
          if (font.widthOfTextAtSize(trial, size) > avail && line) { out.push(line); line = word; } else line = trial;
        }
        if (line) out.push(line); return out.length ? out : [''];
      };
      const per = cells.map(wrapCell);
      const rowH = Math.max(1, ...per.map((l) => l.length)) * lineH + pad * 2;
      if (y - rowH < MARGIN) newPage();
      let x = MARGIN;
      for (let c = 0; c < cols; c++) {
        page.drawRectangle({ x, y: y - rowH, width: colW, height: rowH, borderColor: rgb(0.8, 0.83, 0.86), borderWidth: 0.5, ...(ri === 0 ? { color: rgb(0.95, 0.96, 0.98) } : {}) });
        let ty = y - pad - size;
        for (const ln of per[c]!) { page.drawText(ln, { x: x + pad, y: ty, size, font, color: ink }); ty -= lineH; }
        x += colW;
      }
      y -= rowH;
    });
    y -= 8;
  };

  const drawImage = async (b: DocxBlock) => {
    try {
      const embed = b.fmt === 'jpg' ? await pdf.embedJpg(b.data!) : await pdf.embedPng(b.data!);
      let w = embed.width, h = embed.height;
      const fit = Math.min(1, maxW / w, (PAGE_H - MARGIN * 2) / h);
      w *= fit; h *= fit;
      y -= 6;
      if (y - h < MARGIN) newPage();
      page.drawImage(embed, { x: MARGIN, y: y - h, width: w, height: h });
      y -= h + 8;
    } catch { /* skip */ }
  };

  for (const b of blocks) {
    if (b.type === 'table') drawTable(b.rows ?? []);
    else if (b.type === 'image') await drawImage(b);
    else drawPara(b);
  }
  return pdf.save();
}
