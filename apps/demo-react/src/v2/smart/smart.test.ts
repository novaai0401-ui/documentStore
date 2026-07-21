import { describe, it, expect } from 'vitest';
import type { TextRun } from '../pdfText.js';
import type { PageRuns } from './util.js';
import { scanPii, piiToRedactions } from './pii.js';
import { extractTables, tableToCsv, tableToJson } from './tables.js';
import { detectHeadings } from './headings.js';
import { suggestSignatureFields } from './signature.js';
import { parseCommandOffline, planOps } from './agentic.js';
import { diffLines, diffStats } from './compare.js';
import { invisibleTextLayer } from './util.js';

// ── helpers ───────────────────────────────────────────────────────────────────
function run(text: string, x: number, y: number, opts: Partial<TextRun> = {}): TextRun {
  return { text, x, y, width: opts.width ?? text.length * 5, height: opts.height ?? 10, fontSize: opts.fontSize ?? 10 };
}
function page(p: number, runs: TextRun[], vp = { w: 600, h: 800 }): PageRuns {
  return { page: p, vpWidth: vp.w, vpHeight: vp.h, source: 'text', runs };
}

// ── PII ─────────────────────────────────────────────────────────────────────
describe('scanPii', () => {
  const pages = [
    page(1, [
      run('Contact: jane.doe@example.com', 10, 20),
      run('SSN 123-45-6789 on file', 10, 40),
      run('Call 415-555-0142 today', 10, 60),
      run('Card 4111 1111 1111 1111 valid', 10, 80), // Luhn-valid Visa test number
      run('Server at 192.168.0.1 only', 10, 100),
      run('nothing sensitive here', 10, 120),
    ]),
  ];

  it('detects each enabled type', () => {
    const m = scanPii(pages, new Set(['email', 'ssn', 'phone', 'credit-card', 'ip']));
    const types = m.map((x) => x.type).sort();
    expect(types).toContain('email');
    expect(types).toContain('ssn');
    expect(types).toContain('phone');
    expect(types).toContain('credit-card');
    expect(types).toContain('ip');
    expect(m.find((x) => x.type === 'email')!.value).toBe('jane.doe@example.com');
  });

  it('honors the type filter', () => {
    const m = scanPii(pages, new Set(['email']));
    expect(m.every((x) => x.type === 'email')).toBe(true);
    expect(m).toHaveLength(1);
  });

  it('rejects Luhn-invalid card numbers', () => {
    const bad = [page(1, [run('Card 1234 5678 9012 3456 nope', 10, 10)])];
    expect(scanPii(bad, new Set(['credit-card']))).toHaveLength(0);
  });

  it('produces a redaction annotation per selected match', () => {
    const m = scanPii(pages, new Set(['email', 'ssn']));
    const anns = piiToRedactions(pages, m);
    expect(anns).toHaveLength(m.length);
    expect(anns.every((a) => a.kind === 'redact')).toBe(true);
    // box sits within the run that produced it (here: proportional fallback)
    const emailAnn = anns[0]!;
    if (emailAnn.kind !== 'redact') throw new Error('expected redact');
    expect(emailAnn.x).toBeGreaterThanOrEqual(0);
    expect(emailAnn.width).toBeGreaterThan(0);
  });

  it('can redact a selected subset only', () => {
    const m = scanPii(pages, new Set(['email', 'ssn', 'phone']));
    const anns = piiToRedactions(pages, m, new Set([0]));
    expect(anns).toHaveLength(1);
  });
});

// ── Tables ────────────────────────────────────────────────────────────────────
describe('extractTables', () => {
  // Three rows, two well-separated columns.
  const p = page(1, [
    run('Name', 50, 100, { width: 40 }),
    run('Amount', 300, 100, { width: 50 }),
    run('Alice', 50, 120, { width: 40 }),
    run('100', 300, 120, { width: 30 }),
    run('Bob', 50, 140, { width: 30 }),
    run('250', 300, 140, { width: 30 }),
  ]);

  it('detects a 2-column table', () => {
    const tables = extractTables(p);
    expect(tables).toHaveLength(1);
    expect(tables[0]!.rows.length).toBeGreaterThanOrEqual(3);
    expect(tables[0]!.rows[0]!.length).toBe(2);
  });

  it('exports CSV and JSON with the header row as keys', () => {
    const t = extractTables(p)[0]!;
    const csv = tableToCsv(t);
    expect(csv.split('\r\n')[0]).toBe('Name,Amount');
    const json = JSON.parse(tableToJson(t)) as Array<Record<string, string>>;
    expect(json[0]).toEqual({ Name: 'Alice', Amount: '100' });
  });

  it('escapes CSV cells containing commas', () => {
    const t = { page: 1, confidence: 1, rows: [['a,b', 'c']] };
    expect(tableToCsv(t)).toBe('"a,b",c');
  });

  it('returns nothing for a single-column layout', () => {
    const single = page(1, [run('one', 50, 10), run('two', 50, 30), run('three', 50, 50)]);
    expect(extractTables(single)).toHaveLength(0);
  });
});

// ── Headings ────────────────────────────────────────────────────────────────
describe('detectHeadings', () => {
  it('flags larger short lines as headings and assigns levels', () => {
    const body = Array.from({ length: 8 }, (_, i) => run('lorem ipsum body text line that is long.', 10, 200 + i * 12, { fontSize: 10 }));
    const pages = [page(1, [run('Big Title', 10, 40, { fontSize: 24 }), run('Section One', 10, 100, { fontSize: 16 }), ...body])];
    const hs = detectHeadings(pages);
    const texts = hs.map((h) => h.text);
    expect(texts).toContain('Big Title');
    expect(texts).toContain('Section One');
    const big = hs.find((h) => h.text === 'Big Title')!;
    const sec = hs.find((h) => h.text === 'Section One')!;
    expect(big.level).toBeLessThan(sec.level); // bigger font → higher (lower number) level
  });

  it('does not flag sentence-like lines ending in punctuation', () => {
    const pages = [page(1, [run('This is a normal sentence.', 10, 40, { fontSize: 18 }), ...Array.from({ length: 6 }, (_, i) => run('body', 10, 100 + i * 12, { fontSize: 10 }))])];
    expect(detectHeadings(pages).find((h) => h.text.endsWith('.'))).toBeUndefined();
  });
});

// ── Signature ───────────────────────────────────────────────────────────────
describe('suggestSignatureFields', () => {
  it('proposes a signature field by a signature cue and a date field by a date cue', () => {
    const pages = [page(1, [run('Signature:', 50, 700, { width: 60 }), run('Date:', 50, 730, { width: 40 })])];
    const s = suggestSignatureFields(pages);
    expect(s.find((x) => x.fieldType === 'signature')).toBeTruthy();
    expect(s.find((x) => x.fieldType === 'date')).toBeTruthy();
  });
});

// ── Agentic ───────────────────────────────────────────────────────────────────
describe('parseCommandOffline', () => {
  it('maps "redact all emails" to a redactPii op', () => {
    const ops = parseCommandOffline('redact all emails');
    expect(ops).toEqual([{ op: 'redactPii', types: ['email'] }]);
  });
  it('maps a quoted literal to a redact op', () => {
    const ops = parseCommandOffline('black out "Acme Corp"');
    expect(ops[0]!.op).toBe('redact');
  });
  it('maps replace X with Y', () => {
    const ops = parseCommandOffline('replace 2025 with 2026');
    expect(ops[0]).toMatchObject({ op: 'replace', find: '2025', replaceWith: '2026' });
  });
  it('returns [] for uninterpretable input', () => {
    expect(parseCommandOffline('please make it nicer somehow')).toEqual([]);
  });
});

describe('planOps', () => {
  const pages = [page(1, [run('Email me at a@b.com now', 10, 20), run('Year is 2025 today', 10, 40)])];

  it('plans redactions without mutating (returns change list)', () => {
    const plan = planOps(pages, [{ op: 'redactPii', types: ['email'] }]);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]!.kind).toBe('redact');
    expect(plan.changes[0]!.annotations[0]!.kind).toBe('redact');
  });

  it('plans replacements as white-out + new text (2 annotations each)', () => {
    const plan = planOps(pages, [{ op: 'replace', find: '2025', replaceWith: '2026', literal: true }]);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]!.after).toContain('2026');
    expect(plan.changes[0]!.annotations).toHaveLength(2); // eraser + text
  });
});

// ── Invisible text layer (OCR persistence) ─────────────────────────────────────
describe('invisibleTextLayer', () => {
  it('emits one invisible text annotation per non-empty run, at the run box', () => {
    const p = page(1, [run('hello world', 30, 50, { width: 80, fontSize: 11 }), run('  ', 30, 70)]);
    const anns = invisibleTextLayer(p);
    expect(anns).toHaveLength(1); // blank run skipped
    const a = anns[0]!;
    expect(a.kind).toBe('text');
    if (a.kind !== 'text') throw new Error('expected text');
    expect(a.invisible).toBe(true);
    expect(a.text).toBe('hello world');
    expect(a.x).toBe(30);
    expect(a.pageCssWidth).toBe(600);
  });
});

// ── Compare diff ───────────────────────────────────────────────────────────────
describe('diffLines', () => {
  it('reports added, removed, and unchanged lines', () => {
    const d = diffLines(['a', 'b', 'c'], ['a', 'x', 'c']);
    const s = diffStats(d);
    expect(s.unchanged).toBe(2); // a, c
    expect(s.removed).toBe(1); // b
    expect(s.added).toBe(1); // x
  });
  it('is empty-stable for identical input', () => {
    const d = diffLines(['a', 'b'], ['a', 'b']);
    expect(diffStats(d)).toEqual({ added: 0, removed: 0, unchanged: 2 });
  });
});

// ── Accessibility compliance report ───────────────────────────────────────────
import { buildCriteria, renderReportHtml } from './a11yReport.js';

describe('buildCriteria / renderReportHtml', () => {
  const base = {
    fileName: 'x.pdf', pageCount: 2, textCharsPerPage: [100, 100],
    marked: true, hasStructTree: true, lang: 'en-US', title: 'T',
    displayDocTitle: true, fieldCount: 2, namedFieldCount: 2, headingCount: 3,
  };

  it('passes a fully-tagged document (only human-review items remain)', () => {
    const r = buildCriteria(base);
    expect(r.ok).toBe(true);
    expect(r.failCount).toBe(0);
    expect(r.reviewCount).toBeGreaterThan(0); // alt-text/headings are never auto-certified
  });

  it('fails on untagged + missing lang and flags scan pages', () => {
    const r = buildCriteria({ ...base, marked: false, lang: null, textCharsPerPage: [100, 0] });
    expect(r.ok).toBe(false);
    const ids = r.criteria.filter((c) => c.status === 'fail').map((c) => c.id);
    expect(ids).toContain('tagged');
    expect(ids).toContain('lang');
    expect(ids).toContain('text-layer');
  });

  it('omits the form-fields criterion when there are no fields', () => {
    const r = buildCriteria({ ...base, fieldCount: 0, namedFieldCount: 0 });
    expect(r.criteria.find((c) => c.id === 'fields')).toBeUndefined();
  });

  it('renders self-contained HTML with criteria and escaping', () => {
    const r = buildCriteria({ ...base, title: 'A<B' , displayDocTitle: true });
    const html = renderReportHtml(r, 'note <here>');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Accessibility');
    expect(html).toContain('A&lt;B');       // escaped evidence
    expect(html).toContain('note &lt;here&gt;');
    expect(html).not.toContain('A<B');
  });
});

// ── Visual diff (pixel) ───────────────────────────────────────────────────────
import { diffImages } from './visualDiff.js';

function img(w: number, h: number, fill: number, block?: { x: number; y: number; w: number; h: number; v: number }) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i * 4] = fill; data[i * 4 + 1] = fill; data[i * 4 + 2] = fill; data[i * 4 + 3] = 255; }
  if (block) {
    for (let y = block.y; y < block.y + block.h; y++)
      for (let x = block.x; x < block.x + block.w; x++) {
        const i = (y * w + x) * 4;
        data[i] = block.v; data[i + 1] = block.v; data[i + 2] = block.v;
      }
  }
  return { width: w, height: h, data } as unknown as ImageData;
}

describe('diffImages', () => {
  it('reports no change for identical images', () => {
    const a = img(200, 200, 255);
    const b = img(200, 200, 255);
    const { regions, changeRatio } = diffImages(a, b);
    expect(regions).toHaveLength(0);
    expect(changeRatio).toBe(0);
  });

  it('flags a changed block as a region with a positive change ratio', () => {
    const a = img(200, 200, 255);
    const b = img(200, 200, 255, { x: 80, y: 80, w: 60, h: 60, v: 0 });
    const { regions, changeRatio } = diffImages(a, b);
    expect(regions.length).toBeGreaterThan(0);
    expect(changeRatio).toBeGreaterThan(0);
    // The region should overlap the changed block's center (~0.55, 0.55).
    const hit = regions.some((r) => r.x <= 0.55 && r.x + r.w >= 0.55 && r.y <= 0.55 && r.y + r.h >= 0.55);
    expect(hit).toBe(true);
  });

  it('treats out-of-bounds (size change) pixels as changed', () => {
    const a = img(200, 200, 255);
    const b = img(260, 200, 255); // wider new page
    const { changeRatio } = diffImages(a, b);
    expect(changeRatio).toBeGreaterThan(0);
  });
});

// ── Convert: text/markdown/html/images → PDF, PDF → text ───────────────────────
import { pdfRunsToText, pdfRunsToMarkdown, htmlToPlainText, htmlToBlocks, inlineRuns, parseHtmlTable, parseMarkdownBlocks, blocksToPdf, textToPdf, imagesToPdf, fileToPdf, parseCsv, csvToPdf, xlsxToPdf, runsToDocx, tablesToXlsx, sheetsToXlsx, pagesToSheetRows, tablesToCombinedCsv, runsToEpub, parsePptxSlideText, pptxToPdf, type DocBlock } from './convert.js';
import { crc32, zipStore } from './zip.js';
import { flattenPdf } from './optimize.js';

// 1×1 PNG (valid) for the images→PDF embed path.
const PNG_1x1 = new Uint8Array(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
);
const isPdf = (b: Uint8Array) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF
// DocBlock is a union; tables/images carry no `text`, so narrow safely in tests.
const blockText = (b: DocBlock | undefined): string | undefined => (b && 'text' in b ? b.text : undefined);

describe('pdfRunsToText', () => {
  it('joins runs in reading order with blank lines between pages', () => {
    const pages = [
      page(1, [run('World', 80, 20), run('Hello', 10, 20), run('Second line', 10, 40)]),
      page(2, [run('Page two', 10, 20)]),
    ];
    const text = pdfRunsToText(pages);
    expect(text).toBe('Hello World\nSecond line\n\nPage two');
  });
});

describe('htmlToPlainText', () => {
  it('strips tags, drops script/style, decodes entities, keeps block breaks', () => {
    const html = '<style>x{}</style><h1>Title</h1><p>A &amp; B</p><ul><li>one</li><li>two</li></ul>';
    const txt = htmlToPlainText(html);
    expect(txt).toContain('Title');
    expect(txt).toContain('A & B');
    expect(txt).toContain('• one');
    expect(txt).not.toContain('<');
    expect(txt).not.toContain('x{}');
  });
});

describe('htmlToBlocks', () => {
  it('preserves heading levels, list items and paragraphs', () => {
    const blocks = htmlToBlocks('<h1>Title</h1><p>Intro <strong>text</strong>.</p><ul><li>one</li><li>two</li></ul>');
    expect(blocks[0]).toEqual({ type: 'h1', text: 'Title' });
    expect(blockText(blocks.find((b) => b.type === 'p'))).toBe('Intro text.');
    expect(blocks.filter((b) => b.type === 'li').map(blockText)).toEqual(['one', 'two']);
  });
  it('clamps deep headings to h3 and falls back to paragraphs without block tags', () => {
    expect(htmlToBlocks('<h5>Deep</h5>')[0]!.type).toBe('h3');
    expect(htmlToBlocks('just some bare text').map((b) => b.type)).toEqual(['p']);
  });
});

describe('inlineRuns (WYSIWYG inline formatting)', () => {
  it('returns no runs for plain text so plain blocks stay { type, text }', () => {
    expect(inlineRuns('just plain words')).toEqual({ text: 'just plain words' });
  });
  it('captures bold, italic, code and links as styled runs', () => {
    const { text, runs } = inlineRuns('A <strong>bold</strong> and <em>italic</em> and <code>x()</code> and <a href="#">link</a>');
    expect(text).toBe('A bold and italic and x() and link');
    expect(runs?.find((r) => r.bold)?.text).toBe('bold');
    expect(runs?.find((r) => r.italic)?.text).toBe('italic');
    expect(runs?.find((r) => r.code)?.text).toBe('x()');
    expect(runs?.find((r) => r.link)?.text).toBe('link');
  });
  it('handles nested emphasis (bold+italic)', () => {
    const { runs } = inlineRuns('<strong><em>both</em></strong>');
    expect(runs?.[0]).toMatchObject({ text: 'both', bold: true, italic: true });
  });
});

describe('htmlToBlocks rich blocks', () => {
  it('emits a paragraph with formatted runs', () => {
    const p = htmlToBlocks('<p>Intro <strong>text</strong>.</p>').find((b) => b.type === 'p')!;
    expect(p.type === 'p' && p.text).toBe('Intro text.');
    expect(p.type === 'p' && p.runs?.some((r) => r.bold && r.text === 'text')).toBe(true);
  });
  it('captures fenced code, blockquotes and horizontal rules', () => {
    const blocks = htmlToBlocks('<pre><code>line1\nline2</code></pre><blockquote>quoted</blockquote><hr />');
    const code = blocks.find((b) => b.type === 'code');
    expect(code && code.type === 'code' && code.lines).toEqual(['line1', 'line2']);
    expect(blocks.some((b) => b.type === 'quote')).toBe(true);
    expect(blocks.some((b) => b.type === 'hr')).toBe(true);
  });
  it('numbers ordered-list items but leaves bullets unmarked', () => {
    const ol = htmlToBlocks('<ol><li>first</li><li>second</li></ol>').filter((b) => b.type === 'li');
    expect(ol.map((b) => b.type === 'li' && b.marker)).toEqual(['1.  ', '2.  ']);
    const ul = htmlToBlocks('<ul><li>a</li></ul>').find((b) => b.type === 'li');
    expect(ul && ul.type === 'li' && ul.ordered).toBeUndefined();
  });
});

describe('markdownToPdf mirrors the preview', () => {
  it('renders rich Markdown (headings, emphasis, code, list, quote) into a valid PDF', async () => {
    const { markdownToPdf } = await import('./convert.js');
    const md = '# Title\n\nSome **bold** and *italic* and `code`.\n\n1. first\n2. second\n\n> a quote\n\n```\nconst x = 1;\n```\n\n---\n';
    const bytes = await markdownToPdf(md);
    expect(isPdf(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(500);
  });
});

describe('pdfRunsToMarkdown', () => {
  it('prefixes detected headings with # at their level, leaves body as paragraphs', () => {
    const pages = [page(1, [run('Big Title', 10, 20, { fontSize: 22 }), run('Body line here', 10, 40, { fontSize: 10 })])];
    const md = pdfRunsToMarkdown(pages, [{ page: 1, level: 1, text: 'Big Title' }]);
    expect(md).toContain('# Big Title');
    expect(md).toContain('Body line here');
    expect(md).not.toContain('# Body');
  });
});

describe('fileToPdf', () => {
  it('returns null for a PDF (opened directly)', async () => {
    const f = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'x.pdf', { type: 'application/pdf' });
    expect(await fileToPdf(f)).toBeNull();
  });
  it('converts Markdown and plain text to a PDF', async () => {
    const md = new File(['# Hi\n\nbody'], 'note.md');
    const r = await fileToPdf(md);
    expect(r).not.toBeNull();
    expect(isPdf(r!.bytes)).toBe(true);
    expect(r!.name).toBe('note');
    const txt = await fileToPdf(new File(['plain text'], 'a.txt'));
    expect(isPdf(txt!.bytes)).toBe(true);
  });
});

describe('parseCsv', () => {
  it('handles quoted fields, embedded commas/newlines and "" escapes', () => {
    const rows = parseCsv('a,b,c\n"x,y","line1\nline2","he said ""hi"""');
    expect(rows[0]).toEqual(['a', 'b', 'c']);
    expect(rows[1]).toEqual(['x,y', 'line1\nline2', 'he said "hi"']);
  });
  it('does not emit a trailing empty row for a final newline', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('csvToPdf builds a valid PDF table', async () => {
    const bytes = await csvToPdf('Name,Qty\nApples,3\nPears,5');
    expect(isPdf(bytes)).toBe(true);
  });
});

describe('parseHtmlTable / htmlToBlocks with tables and images', () => {
  it('parses a table into a row/cell grid', () => {
    const rows = parseHtmlTable('<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>');
    expect(rows).toEqual([['A', 'B'], ['1', '2']]);
  });
  it('captures tables and inline data-URI images as blocks, in document order', () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const html = `<h1>Title</h1><table><tr><td>cell</td></tr></table><p>after</p><img src="${dataUri}">`;
    const blocks = htmlToBlocks(html);
    expect(blocks.map((b) => b.type)).toEqual(['h1', 'table', 'p', 'image']);
    const table = blocks.find((b) => b.type === 'table');
    expect(table && table.type === 'table' && table.rows).toEqual([['cell']]);
    // Table cell text is not also emitted as a stray paragraph.
    expect(blocks.filter((b) => b.type === 'p')).toHaveLength(1);
  });
  it('blocksToPdf renders table and image blocks into a valid PDF', async () => {
    const bytes = await blocksToPdf([
      { type: 'h1', text: 'Report' },
      { type: 'table', rows: [['Name', 'Qty'], ['Apples', '3'], ['Pears', '5']] },
      { type: 'image', data: PNG_1x1, fmt: 'png' },
    ]);
    expect(isPdf(bytes)).toBe(true);
  });
});

describe('runsToDocx (PDF → Word)', () => {
  it('builds a .docx that round-trips through mammoth with heading + body', async () => {
    const pages = [page(1, [run('My Heading', 10, 20, { fontSize: 22 }), run('Body sentence here.', 10, 44, { fontSize: 10 })])];
    const docx = runsToDocx(pages, [{ page: 1, level: 1, text: 'My Heading' }]);
    // Valid OOXML zip (PK\x03\x04) that mammoth can read back.
    expect(docx[0]).toBe(0x50); expect(docx[1]).toBe(0x4b);
    const mammoth = await import('mammoth');
    const ab = docx.buffer.slice(docx.byteOffset, docx.byteOffset + docx.byteLength) as ArrayBuffer;
    const { value } = await mammoth.convertToHtml({ arrayBuffer: ab, buffer: ab } as never);
    expect(value).toContain('My Heading');
    expect(value).toContain('Body sentence here.');
    expect(value).toMatch(/<h1[ >]/i); // heading style preserved
  });
  it('escapes XML-special characters in cell text', async () => {
    const pages = [page(1, [run('A & B <tag>', 10, 20)])];
    const docx = runsToDocx(pages);
    const mammoth = await import('mammoth');
    const ab = docx.buffer.slice(docx.byteOffset, docx.byteOffset + docx.byteLength) as ArrayBuffer;
    const { value } = await mammoth.convertToHtml({ arrayBuffer: ab, buffer: ab } as never);
    expect(value).toContain('A &amp; B &lt;tag&gt;');
  });
});

describe('tablesToXlsx (PDF tables → Excel)', () => {
  it('writes one sheet per table that round-trips through SheetJS', async () => {
    const bytes = await tablesToXlsx([
      { page: 1, rows: [['Name', 'Qty'], ['Apples', '3']] },
      { page: 2, rows: [['City', 'Pop'], ['Paris', '2M']] },
    ]);
    const XLSX = await import('xlsx');
    const wb = XLSX.read(bytes, { type: 'array' });
    expect(wb.SheetNames).toHaveLength(2);
    const first = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]!], { header: 1 }) as string[][];
    expect(first[0]).toEqual(['Name', 'Qty']);
    expect(first[1]).toEqual(['Apples', '3']);
  });
});

describe('pagesToSheetRows / sheetsToXlsx (full content)', () => {
  it('flattens page text to [Page, Text] rows', () => {
    const pages = [page(1, [run('Hello', 10, 20), run('World', 80, 20), run('Next line', 10, 40)]), page(2, [run('Two', 10, 20)])];
    const rows = pagesToSheetRows(pages);
    expect(rows[0]).toEqual(['Page', 'Text']);
    expect(rows).toContainEqual(['1', 'Hello World']);
    expect(rows).toContainEqual(['1', 'Next line']);
    expect(rows).toContainEqual(['2', 'Two']);
  });
  it('sheetsToXlsx writes multiple named sheets', async () => {
    const bytes = await sheetsToXlsx([{ name: 'Tables', rows: [['a']] }, { name: 'Document text', rows: [['Page', 'Text'], ['1', 'hi']] }]);
    const XLSX = await import('xlsx');
    const wb = XLSX.read(bytes, { type: 'array' });
    expect(wb.SheetNames).toEqual(['Tables', 'Document text']);
  });
});

describe('tablesToCombinedCsv', () => {
  it('concatenates tables with comment headers and escaping', () => {
    const csv = tablesToCombinedCsv([{ page: 1, rows: [['a,b', 'c'], ['d', 'e']] }, { page: 2, rows: [['x', 'y']] }]);
    expect(csv).toContain('# Table 1 (page 1)');
    expect(csv).toContain('"a,b",c');
    expect(csv).toContain('# Table 2 (page 2)');
  });
});

describe('runsToDocx with tables and images', () => {
  it('round-trips a table and an image through mammoth', async () => {
    const pages = [page(1, [run('Title', 10, 20, { fontSize: 20 })])];
    const docx = runsToDocx(pages, [{ page: 1, level: 1, text: 'Title' }], {
      tables: [{ page: 1, rows: [['H1', 'H2'], ['c1', 'c2'] ] }],
      images: [{ page: 1, data: PNG_1x1, width: 1, height: 1 }],
    });
    const mammoth = await import('mammoth');
    const ab = docx.buffer.slice(docx.byteOffset, docx.byteOffset + docx.byteLength) as ArrayBuffer;
    const { value } = await mammoth.convertToHtml({ arrayBuffer: ab, buffer: ab } as never);
    expect(value).toContain('<table');
    expect(value).toContain('c1');
    expect(value).toMatch(/<img[ >]/i);
  });
});

describe('runsToEpub', () => {
  it('builds a valid EPUB (mimetype first) with the document text', async () => {
    const pages = [page(1, [run('Chapter', 10, 20, { fontSize: 22 }), run('Body text.', 10, 44, { fontSize: 10 })])];
    const epub = runsToEpub(pages, [{ page: 1, level: 1, text: 'Chapter' }], 'My Book');
    const { unzipSync, strFromU8 } = await import('fflate');
    const files = unzipSync(epub);
    expect(Object.keys(files)).toContain('mimetype');
    expect(strFromU8(files['mimetype']!)).toBe('application/epub+zip');
    expect(Object.keys(files)).toContain('OEBPS/content.opf');
    const xhtml = strFromU8(files['OEBPS/content.xhtml']!);
    expect(xhtml).toContain('<h1>Chapter</h1>');
    expect(xhtml).toContain('Body text.');
  });
});

// ── In-house AES (FIPS-197 known-answer vectors) ───────────────────────────────
import { Aes, cbcEncryptNoPad, cbcDecryptNoPad } from './aes.js';

const hx = (h: string) => Uint8Array.from(h.replace(/\s/g, '').match(/../g)!.map((x) => parseInt(x, 16)));
const toHex = (u: Uint8Array) => [...u].map((b) => b.toString(16).padStart(2, '0')).join('');

describe('AES (ours) vs FIPS-197', () => {
  it('AES-128 encrypts the known-answer block', () => {
    const out = new Uint8Array(16);
    new Aes(hx('000102030405060708090a0b0c0d0e0f')).encryptBlock(hx('00112233445566778899aabbccddeeff'), out);
    expect(toHex(out)).toBe('69c4e0d86a7b0430d8cdb78070b4c55a');
  });
  it('AES-256 encrypts the known-answer block', () => {
    const out = new Uint8Array(16);
    new Aes(hx('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f')).encryptBlock(hx('00112233445566778899aabbccddeeff'), out);
    expect(toHex(out)).toBe('8ea2b7ca516745bfeafc49904b496089');
  });
  it('decryptBlock inverts encryptBlock', () => {
    const k = hx('000102030405060708090a0b0c0d0e0f');
    const enc = new Uint8Array(16); const dec = new Uint8Array(16);
    const aes = new Aes(k);
    aes.encryptBlock(hx('00112233445566778899aabbccddeeff'), enc);
    aes.decryptBlock(enc, dec);
    expect(toHex(dec)).toBe('00112233445566778899aabbccddeeff');
  });
  it('CBC (no padding) round-trips multi-block data', () => {
    const key = hx('2b7e151628aed2a6abf7158809cf4f3c');
    const iv = hx('000102030405060708090a0b0c0d0e0f');
    const pt = hx('6bc1bee22e409f96e93d7e117393172a ae2d8a571e03ac9c9eb76fac45af8e51');
    expect(toHex(cbcDecryptNoPad(key, iv, cbcEncryptNoPad(key, iv, pt)))).toBe(toHex(pt));
    // NIST SP800-38A CBC-AES128 vector for the first block.
    expect(toHex(cbcEncryptNoPad(key, iv, pt)).slice(0, 32)).toBe('7649abac8119b246cee98e9b12e9197d');
  });
});

// ── In-house CFB reader + agile Office decryption ──────────────────────────────
import { readCfbStreams, isCfb } from './cfb.js';
import { deriveAgileKey, decryptAgilePackage } from './officeCrypto.js';

/** Build a minimal v3 CFB (512-byte sectors) holding one small mini-stream
 *  stream, so we can validate the reader against a known layout. */
function makeCfb(streamName: string, content: Uint8Array): Uint8Array {
  const SEC = 512, MINI = 64;
  const ENDOFCHAIN = 0xfffffffe, FREESECT = 0xffffffff, FATSECT = 0xfffffffd;
  const sectors = 4; // 0=FAT 1=dir 2=miniFAT 3=miniStream container
  const buf = new Uint8Array(SEC * (sectors + 1));
  const dv = new DataView(buf.buffer);
  // Header
  [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].forEach((b, i) => (buf[i] = b));
  dv.setUint16(24, 3, true);   // major version
  dv.setUint16(26, 0xfffe, true); // byte order (ignored by reader)
  dv.setUint16(30, 9, true);   // sector shift → 512
  dv.setUint16(32, 6, true);   // mini sector shift → 64
  dv.setUint32(44, 1, true);   // number of FAT sectors
  dv.setUint32(48, 1, true);   // first directory sector
  dv.setUint32(56, 4096, true); // mini stream cutoff
  dv.setUint32(60, 2, true);   // first mini FAT sector
  dv.setUint32(64, 1, true);   // number of mini FAT sectors
  dv.setUint32(68, ENDOFCHAIN, true); // first DIFAT
  dv.setUint32(72, 0, true);   // number of DIFAT sectors
  dv.setUint32(76, 0, true);   // DIFAT[0] → FAT is in sector 0
  for (let i = 1; i < 109; i++) dv.setUint32(76 + i * 4, FREESECT, true);
  const secOff = (s: number) => (s + 1) * SEC;
  // FAT (sector 0)
  const fat = secOff(0);
  dv.setUint32(fat + 0 * 4, FATSECT, true);
  dv.setUint32(fat + 1 * 4, ENDOFCHAIN, true);
  dv.setUint32(fat + 2 * 4, ENDOFCHAIN, true);
  dv.setUint32(fat + 3 * 4, ENDOFCHAIN, true);
  for (let i = 4; i < SEC / 4; i++) dv.setUint32(fat + i * 4, FREESECT, true);
  // Directory (sector 1): entry 0 = Root, entry 1 = the stream
  const dir = secOff(1);
  const writeName = (off: number, name: string) => { for (let i = 0; i < name.length; i++) dv.setUint16(off + i * 2, name.charCodeAt(i), true); dv.setUint16(off + 64, (name.length + 1) * 2, true); };
  // Root Entry
  writeName(dir, 'Root Entry'); buf[dir + 66] = 5; dv.setUint32(dir + 116, 3, true); dv.setBigUint64(dir + 120, BigInt(MINI), true);
  // Stream entry (in mini stream, sector 0, size = content length)
  writeName(dir + 128, streamName); buf[dir + 128 + 66] = 2; dv.setUint32(dir + 128 + 116, 0, true); dv.setBigUint64(dir + 128 + 120, BigInt(content.length), true);
  // Mini FAT (sector 2)
  const mfat = secOff(2);
  dv.setUint32(mfat, ENDOFCHAIN, true);
  for (let i = 1; i < SEC / 4; i++) dv.setUint32(mfat + i * 4, FREESECT, true);
  // Mini stream container (sector 3): mini sector 0 holds the content
  buf.set(content.subarray(0, MINI), secOff(3));
  return buf;
}

describe('readCfbStreams (our CFB reader)', () => {
  it('round-trips a small mini-stream stream', () => {
    const content = new TextEncoder().encode('hello cfb');
    const cfb = makeCfb('EncryptionInfo', content);
    expect(isCfb(cfb)).toBe(true);
    const streams = readCfbStreams(cfb);
    expect(streams.has('EncryptionInfo')).toBe(true);
    expect(new TextDecoder().decode(streams.get('EncryptionInfo')!)).toBe('hello cfb');
  });
});

describe('agile Office decryption core', () => {
  it('deriveAgileKey is deterministic and the right length', async () => {
    const salt = new Uint8Array(16).fill(7);
    const block = new Uint8Array(16).fill(1);
    const k1 = await deriveAgileKey('secret', salt, 100, 'SHA512', block, 256);
    const k2 = await deriveAgileKey('secret', salt, 100, 'SHA512', block, 256);
    expect(k1.length).toBe(32);
    expect(toHex(k1)).toBe(toHex(k2));
    expect(toHex(await deriveAgileKey('other', salt, 100, 'SHA512', block, 256))).not.toBe(toHex(k1));
  });
  it('decryptAgilePackage reverses the spec segment encryption (multi-segment)', async () => {
    const secretKey = new Uint8Array(32).map((_, i) => (i * 7 + 3) & 0xff);
    const salt = new Uint8Array(16).map((_, i) => (i * 5 + 1) & 0xff);
    const plain = new Uint8Array(4096 + 32).map((_, i) => (i * 13) & 0xff); // 2 segments
    // Encrypt exactly as the format prescribes: per-segment IV = hash(salt+LE32(i)).
    const enc = new Uint8Array(plain.length);
    const SEG = 4096;
    for (let i = 0, off = 0; off < plain.length; i++, off += SEG) {
      const le = new Uint8Array(4); new DataView(le.buffer).setUint32(0, i, true);
      const concat = new Uint8Array(salt.length + 4); concat.set(salt); concat.set(le, salt.length);
      const iv = new Uint8Array(await crypto.subtle.digest('SHA-512', concat)).subarray(0, 16);
      const chunk = plain.subarray(off, Math.min(off + SEG, plain.length));
      enc.set(cbcEncryptNoPad(secretKey, iv, chunk), off);
    }
    const out = await decryptAgilePackage(secretKey, salt, 'SHA512', 16, enc, plain.length);
    expect(toHex(out)).toBe(toHex(plain));
  });
});

// ── In-house PNG encoder + TIFF decoder ────────────────────────────────────────
import { encodePngRGBA } from './png.js';
import { decodeTiff } from './tiff.js';
import { tiffToPng, toEmbeddableImage } from './convert.js';

/** Build a minimal little-endian, uncompressed RGB TIFF (8 entries) for tests. */
function makeTiff(width: number, height: number, rgb: Uint8Array): Uint8Array {
  const entries: Array<[number, number, number, number]> = []; // tag,type,count,value
  const pixelsOffset = 8 + 2 + 8 * 12 + 4; // header + count + entries + nextIFD
  entries.push([256, 3, 1, width]);     // ImageWidth
  entries.push([257, 3, 1, height]);    // ImageLength
  entries.push([258, 3, 1, 8]);         // BitsPerSample (single sample value; ok for test)
  entries.push([259, 3, 1, 1]);         // Compression = none
  entries.push([262, 3, 1, 2]);         // Photometric = RGB
  entries.push([273, 4, 1, pixelsOffset]); // StripOffsets
  entries.push([277, 3, 1, 3]);         // SamplesPerPixel
  entries.push([279, 4, 1, rgb.length]); // StripByteCounts
  const size = pixelsOffset + rgb.length;
  const buf = new Uint8Array(size);
  const dv = new DataView(buf.buffer);
  buf[0] = 0x49; buf[1] = 0x49; dv.setUint16(2, 42, true); dv.setUint32(4, 8, true);
  dv.setUint16(8, entries.length, true);
  entries.forEach(([tag, type, count, value], i) => {
    const o = 10 + i * 12;
    dv.setUint16(o, tag, true); dv.setUint16(o + 2, type, true); dv.setUint32(o + 4, count, true);
    if (type === 3) dv.setUint16(o + 8, value, true); else dv.setUint32(o + 8, value, true);
  });
  buf.set(rgb, pixelsOffset);
  return buf;
}

describe('encodePngRGBA', () => {
  it('produces a PNG whose IDAT inflates back to the filtered scanlines', async () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]); // 2×1: red, green
    const png = await encodePngRGBA(2, 1, rgba);
    expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // IDAT is the 3rd chunk; inflate it and check the row (filter byte 0 + RGBA).
    const { unzlibSync } = await import('fflate');
    // locate IDAT
    const txt = new TextDecoder('latin1').decode(png);
    const idatStart = txt.indexOf('IDAT') + 4;
    const lenView = new DataView(png.buffer, txt.indexOf('IDAT') - 4, 4);
    const idat = png.subarray(idatStart, idatStart + lenView.getUint32(0));
    const raw = unzlibSync(idat);
    expect(Array.from(raw)).toEqual([0, 255, 0, 0, 255, 0, 255, 0, 255]);
  });
});

describe('decodeTiff (our decoder)', () => {
  it('decodes an uncompressed RGB TIFF to RGBA pixels', async () => {
    const rgb = new Uint8Array([255, 0, 0, /* */ 0, 255, 0, /* */ 0, 0, 255, /* */ 255, 255, 0]); // 2×2
    const img = await decodeTiff(makeTiff(2, 2, rgb));
    expect(img.width).toBe(2);
    expect(img.height).toBe(2);
    expect(Array.from(img.rgba.subarray(0, 4))).toEqual([255, 0, 0, 255]); // first pixel red, opaque
    expect(Array.from(img.rgba.subarray(4, 8))).toEqual([0, 255, 0, 255]); // green
  });
  it('tiffToPng + toEmbeddableImage yield embeddable PNG bytes', async () => {
    const tiff = makeTiff(1, 1, new Uint8Array([10, 20, 30]));
    const png = await tiffToPng(tiff);
    expect(png).not.toBeNull();
    expect(Array.from(png!.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const embed = await toEmbeddableImage(tiff, 'tiff', 'image/tiff');
    expect(embed?.type).toBe('png');
  });
});

// ── In-house ICC profile + PDF/A ───────────────────────────────────────────────
import { srgbIccProfile } from './icc.js';
import { buildPdfA } from './pdfa.js';

describe('srgbIccProfile (our ICC)', () => {
  it('emits a structurally valid ICC v2 RGB display profile', () => {
    const icc = srgbIccProfile();
    const dv = new DataView(icc.buffer);
    expect(dv.getUint32(0)).toBe(icc.length); // header size = file size
    expect(String.fromCharCode(...icc.subarray(36, 40))).toBe('acsp'); // ICC signature
    expect(String.fromCharCode(...icc.subarray(12, 16))).toBe('mntr'); // device class
    expect(String.fromCharCode(...icc.subarray(16, 20))).toBe('RGB ');
    const tagCount = dv.getUint32(128);
    expect(tagCount).toBe(9);
    // Every tag's [offset, offset+size) lies inside the file.
    for (let i = 0; i < tagCount; i++) {
      const off = dv.getUint32(132 + i * 12 + 4);
      const size = dv.getUint32(132 + i * 12 + 8);
      expect(off + size).toBeLessThanOrEqual(icc.length);
    }
  });
});

describe('buildPdfA', () => {
  it('produces a PDF carrying the OutputIntent, sRGB ICC and PDF/A XMP', async () => {
    const out = await buildPdfA([{ bytes: PNG_1x1, type: 'png', widthPt: 200, heightPt: 200 }], 'Archive');
    expect(isPdf(out)).toBe(true);
    const s = new TextDecoder('latin1').decode(out);
    expect(s).toContain('/OutputIntent');
    expect(s).toContain('GTS_PDFA1');
    expect(s).toContain('/Metadata');
    expect(s).toContain('pdfaid:part');
    // The OutputIntent profile is a real ICC stream (acsp signature present).
    expect(s).toContain('acsp');
  });
});

// ── ODF (ODT/ODP), RTF, PPTX export ────────────────────────────────────────────
import { odtBlocks, odtToPdf, odpToPdf } from './odf.js';
import { rtfToText } from './rtf.js';
import { pagesToPptx } from './pptxExport.js';
import { pagesToSlides } from './convert.js';

describe('ODF (OpenDocument)', () => {
  it('odtBlocks parses headings, paragraphs and tables', () => {
    const xml = '<office:text><text:h text:outline-level="1">Title</text:h><text:p>Body text.</text:p>' +
      '<table:table><table:table-row><table:table-cell><text:p>A</text:p></table:table-cell><table:table-cell><text:p>B</text:p></table:table-cell></table:table-row></table:table></office:text>';
    const blocks = odtBlocks(xml);
    expect(blocks[0]).toEqual({ type: 'h1', text: 'Title' });
    expect(blocks.find((b) => b.type === 'p')).toMatchObject({ text: 'Body text.' });
    const table = blocks.find((b) => b.type === 'table');
    expect(table && table.type === 'table' && table.rows).toEqual([['A', 'B']]);
  });
  it('odtToPdf / odpToPdf produce valid PDFs from a minimal ODF zip', async () => {
    const enc = new TextEncoder();
    const odt = zipStore([{ name: 'content.xml', data: enc.encode('<office:document-content><office:body><office:text><text:h text:outline-level="1">Hi</text:h><text:p>body</text:p></office:text></office:body></office:document-content>') }]);
    expect(isPdf(await odtToPdf(odt))).toBe(true);
    const odp = zipStore([{ name: 'content.xml', data: enc.encode('<office:document-content><office:body><office:presentation><draw:page><draw:frame><draw:text-box><text:p>Slide one</text:p></draw:text-box></draw:frame></draw:page></office:presentation></office:body></office:document-content>') }]);
    expect(isPdf(await odpToPdf(odp))).toBe(true);
  });
});

describe('rtfToText', () => {
  it('decodes control words, groups, hex and unicode escapes', () => {
    const rtf = "{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}\\f0 Hello \\b world\\b0\\par Caf\\'e9 \\u8364 done}";
    const t = rtfToText(rtf);
    expect(t).toContain('Hello');
    expect(t).toContain('world');
    expect(t).toContain('Café'); // \'e9 → é
    expect(t).toContain('€');     // 荤 → euro
    expect(t).not.toContain('Arial'); // font table skipped
    expect(t).toContain('\n');    // \par
  });
});

describe('PDF → PPTX export', () => {
  it('builds a .pptx with the full part chain that our pptx reader can re-open', async () => {
    const pptx = pagesToPptx([{ title: 'Slide A', body: ['point one', 'point two'] }, { title: 'Slide B', body: ['more'] }]);
    const { unzipSync, strFromU8 } = await import('fflate');
    const files = unzipSync(pptx);
    expect(Object.keys(files)).toEqual(expect.arrayContaining([
      '[Content_Types].xml', 'ppt/presentation.xml', 'ppt/slideMasters/slideMaster1.xml',
      'ppt/slideLayouts/slideLayout1.xml', 'ppt/theme/theme1.xml', 'ppt/slides/slide1.xml', 'ppt/slides/slide2.xml',
    ]));
    expect(strFromU8(files['ppt/slides/slide1.xml']!)).toContain('Slide A');
    expect(strFromU8(files['ppt/slides/slide1.xml']!)).toContain('point two');
    // Round-trip: our own pptx reader recovers the text into a PDF.
    const { pptxToPdf } = await import('./convert.js');
    expect(isPdf(await pptxToPdf(pptx))).toBe(true);
  });
  it('pagesToSlides maps the first line to the title', () => {
    const slides = pagesToSlides([page(1, [run('Heading', 10, 20), run('body line', 10, 40)])]);
    expect(slides[0]).toEqual({ title: 'Heading', body: ['body line'] });
  });
  it('themes the deck: theme colours land in the theme part and slide runs', async () => {
    const theme = { bg: '#0B1020', fg: '#E2E8F0', heading: '#FFB454', accent: '#7C3AED' };
    const pptx = pagesToPptx([{ title: 'Themed', body: ['line'] }], theme);
    const { unzipSync, strFromU8 } = await import('fflate');
    const files = unzipSync(pptx);
    const themePart = strFromU8(files['ppt/theme/theme1.xml']!);
    // lt1 = background, dk1 = foreground, accent1 = accent (hex, no '#').
    expect(themePart).toContain('<a:lt1><a:srgbClr val="0B1020"/></a:lt1>');
    expect(themePart).toContain('<a:dk1><a:srgbClr val="E2E8F0"/></a:dk1>');
    expect(themePart).toContain('<a:accent1><a:srgbClr val="7C3AED"/></a:accent1>');
    // Title run carries the heading colour; body run carries the foreground.
    const slide = strFromU8(files['ppt/slides/slide1.xml']!);
    expect(slide).toContain('<a:srgbClr val="FFB454"/>');
    expect(slide).toContain('<a:srgbClr val="E2E8F0"/>');
    // Still a valid deck our reader re-opens.
    const { pptxToPdf } = await import('./convert.js');
    expect(isPdf(await pptxToPdf(pptx))).toBe(true);
  });
  it('an undefined theme keeps the default sysClr theme part', async () => {
    const { unzipSync, strFromU8 } = await import('fflate');
    const files = unzipSync(pagesToPptx([{ title: 'Plain', body: ['x'] }]));
    expect(strFromU8(files['ppt/theme/theme1.xml']!)).toContain('<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>');
  });
});

describe('themed PDF export', () => {
  it('blocksToPdf renders a valid PDF with a dark theme (background + table)', async () => {
    const blocks: DocBlock[] = [
      { type: 'h1', text: 'Report' },
      { type: 'p', text: 'Some body text on a themed page.' },
      { type: 'table', rows: [['A', 'B'], ['1', '2']] },
    ];
    const pdf = await blocksToPdf(blocks, { theme: { bg: '#0B1020', fg: '#E2E8F0', heading: '#FFB454' } });
    expect(isPdf(pdf)).toBe(true);
  });
  it('textToPdf accepts a theme and still produces a PDF', async () => {
    expect(isPdf(await textToPdf('hello themed world', { bg: '#102015', fg: '#DCFCE7', heading: '#34D399' }))).toBe(true);
  });
});

describe('slide editing round-trips', () => {
  it('pptxToSlides reads back what pagesToPptx writes (title + body)', async () => {
    const { pptxToSlides } = await import('./convert.js');
    const pptx = pagesToPptx([{ title: 'Intro', body: ['point one', 'point two'] }, { title: 'Next', body: ['more'] }]);
    const slides = await pptxToSlides(pptx);
    expect(slides).toHaveLength(2);
    expect(slides[0]).toEqual({ title: 'Intro', body: ['point one', 'point two'] });
    expect(slides[1]!.title).toBe('Next');
  });
  it('odpToSlides parses an ODP presentation into slides', async () => {
    const { odpToSlides } = await import('./odf.js');
    const content = '<office:document-content><office:body><office:presentation>' +
      '<draw:page><draw:frame><draw:text-box><text:p>Title A</text:p><text:p>bullet</text:p></draw:text-box></draw:frame></draw:page>' +
      '<draw:page><draw:frame><draw:text-box><text:p>Title B</text:p></draw:text-box></draw:frame></draw:page>' +
      '</office:presentation></office:body></office:document-content>';
    const odp = zipStore([{ name: 'content.xml', data: new TextEncoder().encode(content) }]);
    const slides = await odpToSlides(odp);
    expect(slides).toHaveLength(2);
    expect(slides[0]).toEqual({ title: 'Title A', body: ['bullet'] });
    expect(slides[1]).toEqual({ title: 'Title B', body: [] });
  });
});

describe('PPTX → PDF', () => {
  it('parsePptxSlideText pulls paragraph text in order', () => {
    const xml = '<p:sld><a:p><a:r><a:t>First line</a:t></a:r></a:p><a:p><a:r><a:t>Second</a:t><a:t> half</a:t></a:r></a:p></p:sld>';
    expect(parsePptxSlideText(xml)).toEqual(['First line', 'Second half']);
  });
  it('converts a minimal .pptx (zipped with fflate) to a valid PDF', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const slide = '<?xml version="1.0"?><p:sld xmlns:a="x"><a:p><a:r><a:t>Hello deck</a:t></a:r></a:p></p:sld>';
    const pptx = zipSync({ 'ppt/slides/slide1.xml': strToU8(slide) });
    const pdf = await pptxToPdf(pptx);
    expect(isPdf(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(200);
  });
});

describe('xlsxToPdf', () => {
  it('converts a workbook (written by SheetJS) to a valid PDF', async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([['Name', 'Qty'], ['Apples', 3], ['Pears', 5]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fruit');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const pdf = await xlsxToPdf(new Uint8Array(buf));
    expect(isPdf(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(200);
  });
});

describe('parseDocxRich (run-level formatting)', () => {
  it('extracts headings, alignment, bold/italic/colour/size runs and renders a PDF', async () => {
    const { parseDocxRich, richBlocksToPdf } = await import('./docxRich.js');
    const enc = new TextEncoder();
    const file = (name: string, xml: string) => ({ name, data: enc.encode(xml) });
    const body =
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Title</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:jc w:val="center"/></w:pPr>' +
      '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">bold </w:t></w:r>' +
      '<w:r><w:rPr><w:i/><w:color w:val="FF0000"/><w:sz w:val="40"/></w:rPr><w:t>red italic</w:t></w:r></w:p>';
    const docx = zipStore([
      file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
      file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
      file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`),
    ]);
    const blocks = (await parseDocxRich(docx))!;
    expect(blocks).not.toBeNull();
    expect(blocks[0]).toMatchObject({ type: 'para', level: 1 });
    expect(blocks[0]!.runs![0]!.text).toBe('Title');
    const para = blocks[1]!;
    expect(para.align).toBe('center');
    expect(para.runs!.some((r) => r.bold)).toBe(true);
    const redItalic = para.runs!.find((r) => r.italic)!;
    expect(redItalic.color).toBe('#FF0000');
    expect(redItalic.size).toBe(20); // 40 half-points
    expect(isPdf(await richBlocksToPdf(blocks))).toBe(true);
  });
});

describe('richBlocksToHtml (Word editor seed)', () => {
  it('renders headings, formatted runs and tables to editable HTML', async () => {
    const { richBlocksToHtml } = await import('./docxRich.js');
    const html = richBlocksToHtml([
      { type: 'para', level: 1, runs: [{ text: 'Title' }], align: 'left' },
      { type: 'para', level: 0, align: 'center', runs: [{ text: 'bold', bold: true }, { text: ' red', color: '#FF0000' }] },
      { type: 'table', rows: [['A', 'B'], ['1', '2']] },
    ]);
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<b>bold</b>');
    expect(html).toContain('color:#FF0000');
    expect(html).toContain('text-align:center');
    expect(html).toContain('<table');
    expect(html).toContain('<td');
  });
});

describe('docxToPdf', () => {
  // Build a minimal valid .docx (OOXML zip) with our own STORE-zip writer and
  // run it through the real mammoth → blocks → pdf-lib path.
  it('converts a Word document to a valid PDF', async () => {
    const { docxToPdf } = await import('./convert.js');
    const enc = new TextEncoder();
    const file = (name: string, xml: string) => ({ name, data: enc.encode(xml) });
    const docx = zipStore([
      file('[Content_Types].xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
      file('_rels/.rels',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
      file('word/document.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
        '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Doc Title</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>Hello from docx.</w:t></w:r></w:p></w:body></w:document>'),
    ]);
    const pdf = await docxToPdf(docx);
    expect(isPdf(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(200);
  });
});

describe('parseMarkdownBlocks', () => {
  it('classifies headings, bullets and paragraphs and strips inline markers', () => {
    const md = '# Big\n\nsome **bold** text\n\n- a\n- b';
    const blocks = parseMarkdownBlocks(md);
    expect(blocks[0]).toEqual({ type: 'h1', text: 'Big' });
    expect(blockText(blocks.find((b) => b.type === 'p'))).toBe('some bold text');
    expect(blocks.filter((b) => b.type === 'li').map(blockText)).toEqual(['a', 'b']);
  });
});

// ── Markdown renderer (entity-correct, GFM) ────────────────────────────────────
import { renderMarkdown } from '../editors/markdown.js';

describe('renderMarkdown', () => {
  it('escapes special characters exactly once (no &amp;amp; / &#39; literals)', () => {
    const html = renderMarkdown("Don't memorize & ship <TradeRow/>");
    expect(html).toContain('Don');
    expect(html).toContain('&amp;');     // a single &
    expect(html).toContain('&lt;TradeRow');
    expect(html).not.toContain('&amp;amp;');
    expect(html).not.toContain('&amp;#39;');
    expect(html).not.toContain('&amp;lt;');
  });
  it('renders a GFM table', () => {
    const html = renderMarkdown('| A | B |\n| --- | --- |\n| 1 | 2 |');
    expect(html).toContain('<table class="md-table">');
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('<td>1</td>');
  });
  it('preserves <, >, & inside fenced code blocks (single-escaped)', () => {
    const html = renderMarkdown('```js\nconst x = a < b && c;\n```');
    expect(html).toContain('<pre class="md-code">');
    expect(html).toContain('a &lt; b &amp;&amp; c');
    expect(html).not.toContain('&amp;amp;');
  });
  it('handles headings, bold and inline code', () => {
    const html = renderMarkdown('# Title\n\nSome **bold** and `code()` here');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code()</code>');
  });
});

describe('winAnsiSafe + Unicode → PDF', () => {
  it('maps unencodable symbols and never throws on arrows/emoji', async () => {
    const { winAnsiSafe } = await import('./convert.js');
    expect(winAnsiSafe('a → b')).toBe('a -> b');
    expect(winAnsiSafe('✓ done ≥ 5')).toBe('[x] done >= 5');
    expect(winAnsiSafe('emoji 😀 and 中文')).toBe('emoji ? and ??');
    expect(winAnsiSafe('“smart” – dash •')).toBe('“smart” – dash •'); // CP1252 chars pass through
  });
  it('markdownToPdf renders a doc containing a "→" without throwing', async () => {
    const { markdownToPdf } = await import('./convert.js');
    const bytes = await markdownToPdf('# Guide\n\nClient → Server → Database flow ✓');
    expect(isPdf(bytes)).toBe(true);
  });
});

describe('blocksToPdf / textToPdf', () => {
  it('produces a valid multi-block PDF', async () => {
    const bytes = await blocksToPdf([
      { type: 'h1', text: 'Heading' },
      { type: 'p', text: 'A paragraph long enough to require word wrapping across the page width. '.repeat(6) },
      { type: 'li', text: 'bullet item' },
    ]);
    expect(isPdf(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(200);
  });
  it('textToPdf splits blank-line-separated paragraphs', async () => {
    const bytes = await textToPdf('para one\n\npara two');
    expect(isPdf(bytes)).toBe(true);
  });
});

describe('imagesToPdf', () => {
  it('embeds a PNG as one page and reports counts', async () => {
    const { bytes, embedded, skipped } = await imagesToPdf([{ bytes: PNG_1x1 }, { bytes: new Uint8Array([1, 2, 3]) }]);
    expect(isPdf(bytes)).toBe(true);
    expect(embedded).toBe(1);
    expect(skipped).toBe(1); // the garbage input
  });
});

describe('crc32 / zipStore', () => {
  it('matches the known CRC-32 of "123456789"', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('produces a zip with the local-file and end-of-central-dir signatures', () => {
    const z = zipStore([{ name: 'a.txt', data: new TextEncoder().encode('hi') }]);
    expect(z[0]).toBe(0x50); expect(z[1]).toBe(0x4b); expect(z[2]).toBe(0x03); expect(z[3]).toBe(0x04); // PK\x03\x04
    // End-of-central-directory signature PK\x05\x06 near the tail.
    const tail = z.subarray(z.length - 22);
    expect(tail[0]).toBe(0x50); expect(tail[1]).toBe(0x4b); expect(tail[2]).toBe(0x05); expect(tail[3]).toBe(0x06);
  });
});

describe('flattenPdf', () => {
  it('flattens a form built with pdf-lib and reports the field count', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const pg = doc.addPage([200, 200]);
    const field = doc.getForm().createTextField('demo.field');
    field.setText('value');
    field.addToPage(pg, { x: 10, y: 10, width: 120, height: 20 });
    const src = await doc.save();
    const { bytes, hadForm, fieldCount } = await flattenPdf(src);
    expect(isPdf(bytes)).toBe(true);
    expect(hadForm).toBe(true);
    expect(fieldCount).toBe(1);
    // After flattening, the reloaded doc has no interactive fields.
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getForm().getFields()).toHaveLength(0);
  });
});

// ── Watermark / page numbers ──────────────────────────────────────────────────
import { watermarkAnnotations, pageNumberAnnotations } from './util.js';

describe('watermark & page numbers', () => {
  const pages = [page(1, []), page(2, [])];

  it('watermark: one rotated, translucent text annotation per page', () => {
    const anns = watermarkAnnotations(pages, '  CONFIDENTIAL ', { opacity: 0.2 });
    expect(anns).toHaveLength(2);
    for (const a of anns) {
      if (a.kind !== 'text') throw new Error('expected text');
      expect(a.text).toBe('CONFIDENTIAL'); // trimmed
      expect(a.rotate).toBe(45);
      expect(a.opacity).toBe(0.2);
    }
  });

  it('watermark: empty text yields nothing', () => {
    expect(watermarkAnnotations(pages, '   ')).toHaveLength(0);
  });

  it('page numbers: formats {n} / {total} per page', () => {
    const anns = pageNumberAnnotations(pages);
    expect(anns.map((a) => (a.kind === 'text' ? a.text : ''))).toEqual(['1 / 2', '2 / 2']);
  });

  it('page numbers: honors a custom format', () => {
    const anns = pageNumberAnnotations(pages, { format: 'Page {n}' });
    expect(anns.map((a) => (a.kind === 'text' ? a.text : ''))).toEqual(['Page 1', 'Page 2']);
  });
});
