/**
 * pdfcraft's own content-tools directory — an extensible, registry-driven set of
 * insertable building blocks (callouts, tables, code, business blocks, …). A
 * tool is declared once with the document kinds it applies to and its content in
 * each surface's native form (Markdown / HTML / plain text); every editor then
 * renders the tools that apply to it from one source of truth. Add an entry here
 * and it shows up in the Insert palette of every matching editor — no per-editor
 * wiring. This is the counterpart to the theme directory.
 */

/** The editing surfaces a tool can target. */
export type DocKind = 'markdown' | 'text' | 'html' | 'word' | 'sheet' | 'slide' | 'pdf';

/** A snippet expressed in each surface's native form. An editor picks the field
 *  it can consume (Markdown editor → markdown, Word → html, …) and falls back
 *  gracefully (html stripped to text, markdown used as text) when a form is
 *  missing, so a tool never needs to enumerate every surface. */
export interface InsertContent {
  markdown?: string;
  html?: string;
  text?: string;
  /** Slide payload: a title line plus body bullet lines. */
  slide?: { title: string; body: string[] };
  /** Sheet payload: rows appended to the active grid. */
  rows?: string[][];
}

export type ToolGroup = 'structure' | 'content' | 'data' | 'business';

export interface InsertTool {
  id: string;
  label: string;
  icon: string;
  group: ToolGroup;
  /** Editors whose kind is in this list render the tool. */
  kinds: DocKind[];
  content: InsertContent;
}

export const TOOL_GROUPS: Array<{ id: ToolGroup; label: string }> = [
  { id: 'structure', label: 'Structure' },
  { id: 'content', label: 'Content' },
  { id: 'data', label: 'Tables & data' },
  { id: 'business', label: 'Business' },
];

// Text-bearing document surfaces — the PDF editor inserts the snippet's plain
// text as a text annotation, so it shares the same text/markdown/html tools.
const DOC_KINDS: DocKind[] = ['markdown', 'text', 'html', 'word', 'pdf'];

/**
 * The catalog. Each entry is authored once; the surfaces it supports are listed
 * in `kinds`, and its content carries the forms those surfaces consume.
 */
export const INSERT_TOOLS: InsertTool[] = [
  // ── Structure ──────────────────────────────────────────────────────────────
  {
    id: 'heading', label: 'Heading', icon: 'H', group: 'structure', kinds: DOC_KINDS,
    content: { markdown: '## Section heading', html: '<h2>Section heading</h2>', text: 'Section heading' },
  },
  {
    id: 'divider', label: 'Divider', icon: '―', group: 'structure', kinds: DOC_KINDS,
    content: { markdown: '\n---\n', html: '<hr/>', text: '\n──────────\n' },
  },
  {
    id: 'pagebreak', label: 'Page break', icon: '⤓', group: 'structure', kinds: ['html', 'word'],
    content: { html: '<div style="page-break-after:always"></div>', text: '\n\f\n' },
  },
  {
    id: 'toc', label: 'Table of contents', icon: '☰', group: 'structure', kinds: DOC_KINDS,
    content: {
      markdown: '## Contents\n\n1. [Introduction](#introduction)\n2. [Details](#details)\n3. [Summary](#summary)',
      html: '<h2>Contents</h2><ol><li>Introduction</li><li>Details</li><li>Summary</li></ol>',
      text: 'Contents\n  1. Introduction\n  2. Details\n  3. Summary',
    },
  },
  {
    id: 'columns', label: 'Two columns', icon: '▥', group: 'structure', kinds: ['html', 'word'],
    content: { html: '<table style="width:100%;border:0"><tr><td style="width:50%;vertical-align:top">Left column…</td><td style="width:50%;vertical-align:top">Right column…</td></tr></table>' },
  },

  // ── Content ────────────────────────────────────────────────────────────────
  {
    id: 'note', label: 'Note callout', icon: '🛈', group: 'content', kinds: DOC_KINDS,
    content: {
      markdown: '> **Note**\n> Add a short, helpful note here.',
      html: '<blockquote style="border-left:4px solid #2e5bff;background:#eff6ff;padding:8px 14px"><strong>Note</strong><br/>Add a short, helpful note here.</blockquote>',
      text: 'NOTE: Add a short, helpful note here.',
    },
  },
  {
    id: 'warning', label: 'Warning callout', icon: '⚠', group: 'content', kinds: DOC_KINDS,
    content: {
      markdown: '> **⚠ Warning**\n> Call out something important here.',
      html: '<blockquote style="border-left:4px solid #f97316;background:#fff7ed;padding:8px 14px"><strong>⚠ Warning</strong><br/>Call out something important here.</blockquote>',
      text: 'WARNING: Call out something important here.',
    },
  },
  {
    id: 'tip', label: 'Tip callout', icon: '💡', group: 'content', kinds: DOC_KINDS,
    content: {
      markdown: '> **💡 Tip**\n> Share a useful tip here.',
      html: '<blockquote style="border-left:4px solid #22c55e;background:#f0fdf4;padding:8px 14px"><strong>💡 Tip</strong><br/>Share a useful tip here.</blockquote>',
      text: 'TIP: Share a useful tip here.',
    },
  },
  {
    id: 'quote', label: 'Quote', icon: '❝', group: 'content', kinds: DOC_KINDS,
    content: {
      markdown: '> "A memorable quotation goes here."\n> — Attribution',
      html: '<blockquote>“A memorable quotation goes here.”<br/>— Attribution</blockquote>',
      text: '"A memorable quotation goes here." — Attribution',
    },
  },
  {
    id: 'code', label: 'Code block', icon: '{ }', group: 'content', kinds: ['markdown', 'text', 'html', 'word', 'pdf'],
    content: {
      markdown: '```js\nconsole.log("hello");\n```',
      html: '<pre style="background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px"><code>console.log("hello");</code></pre>',
      text: '    console.log("hello");',
    },
  },
  {
    id: 'checklist', label: 'Checklist', icon: '☑', group: 'content', kinds: DOC_KINDS,
    content: {
      markdown: '- [ ] First task\n- [ ] Second task\n- [x] Done task',
      html: '<ul style="list-style:none;padding-left:0"><li>☐ First task</li><li>☐ Second task</li><li>☑ Done task</li></ul>',
      text: '[ ] First task\n[ ] Second task\n[x] Done task',
    },
  },

  // ── Tables & data ────────────────────────────────────────────────────────────
  {
    id: 'table2', label: 'Table (2×2)', icon: '▦', group: 'data', kinds: ['markdown', 'text', 'html', 'word', 'pdf', 'sheet'],
    content: {
      markdown: '| Column A | Column B |\n| --- | --- |\n| a1 | b1 |\n| a2 | b2 |',
      html: '<table border="1" style="border-collapse:collapse"><tr><th>Column A</th><th>Column B</th></tr><tr><td>a1</td><td>b1</td></tr><tr><td>a2</td><td>b2</td></tr></table>',
      text: 'Column A\tColumn B\na1\tb1\na2\tb2',
      rows: [['Column A', 'Column B'], ['a1', 'b1'], ['a2', 'b2']],
    },
  },
  {
    id: 'table3', label: 'Table (3×3)', icon: '▤', group: 'data', kinds: ['markdown', 'text', 'html', 'word', 'pdf', 'sheet'],
    content: {
      markdown: '| Col 1 | Col 2 | Col 3 |\n| --- | --- | --- |\n| | | |\n| | | |',
      html: '<table border="1" style="border-collapse:collapse"><tr><th>Col 1</th><th>Col 2</th><th>Col 3</th></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr></table>',
      text: 'Col 1\tCol 2\tCol 3\n\t\t\n\t\t',
      rows: [['Col 1', 'Col 2', 'Col 3'], ['', '', ''], ['', '', '']],
    },
  },
  {
    id: 'kpi', label: 'KPI row', icon: '📈', group: 'data', kinds: ['markdown', 'html', 'word', 'pdf', 'sheet'],
    content: {
      markdown: '| Metric | Value | Change |\n| --- | --- | --- |\n| Revenue | $0 | +0% |\n| Users | 0 | +0% |\n| Churn | 0% | -0% |',
      html: '<table border="1" style="border-collapse:collapse"><tr><th>Metric</th><th>Value</th><th>Change</th></tr><tr><td>Revenue</td><td>$0</td><td>+0%</td></tr><tr><td>Users</td><td>0</td><td>+0%</td></tr><tr><td>Churn</td><td>0%</td><td>-0%</td></tr></table>',
      rows: [['Metric', 'Value', 'Change'], ['Revenue', '$0', '+0%'], ['Users', '0', '+0%'], ['Churn', '0%', '-0%']],
    },
  },

  // ── Business ────────────────────────────────────────────────────────────────
  {
    id: 'signature', label: 'Signature block', icon: '✍', group: 'business', kinds: DOC_KINDS,
    content: {
      markdown: '\n\n_________________________\n\n**Name:**\n**Title:**\n**Date:**',
      html: '<p style="margin-top:32px">_________________________</p><p><strong>Name:</strong><br/><strong>Title:</strong><br/><strong>Date:</strong></p>',
      text: '\n_________________________\nName:\nTitle:\nDate:',
    },
  },
  {
    id: 'address', label: 'Letterhead', icon: '🏢', group: 'business', kinds: DOC_KINDS,
    content: {
      markdown: '**Your Company**\n123 Example Street\nCity, State 00000\nhello@example.com · (555) 000-0000\n\n---',
      html: '<p><strong>Your Company</strong><br/>123 Example Street<br/>City, State 00000<br/>hello@example.com · (555) 000-0000</p><hr/>',
      text: 'Your Company\n123 Example Street\nCity, State 00000\nhello@example.com · (555) 000-0000\n──────────',
    },
  },
  {
    id: 'invoice', label: 'Invoice table', icon: '🧾', group: 'business', kinds: ['markdown', 'html', 'word', 'pdf', 'sheet'],
    content: {
      markdown: '| Item | Qty | Unit price | Amount |\n| --- | --- | --- | --- |\n| Service A | 1 | $0.00 | $0.00 |\n| Service B | 1 | $0.00 | $0.00 |\n| | | **Total** | **$0.00** |',
      html: '<table border="1" style="border-collapse:collapse"><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr><tr><td>Service A</td><td>1</td><td>$0.00</td><td>$0.00</td></tr><tr><td>Service B</td><td>1</td><td>$0.00</td><td>$0.00</td></tr><tr><td></td><td></td><td><strong>Total</strong></td><td><strong>$0.00</strong></td></tr></table>',
      rows: [['Item', 'Qty', 'Unit price', 'Amount'], ['Service A', '1', '$0.00', '$0.00'], ['Service B', '1', '$0.00', '$0.00'], ['', '', 'Total', '$0.00']],
    },
  },
  {
    id: 'agenda', label: 'Meeting agenda', icon: '🗓', group: 'business', kinds: DOC_KINDS,
    content: {
      markdown: '## Meeting agenda\n\n**Date:** \n**Attendees:** \n\n1. Welcome & objectives\n2. Updates\n3. Discussion\n4. Action items\n5. Next steps',
      html: '<h2>Meeting agenda</h2><p><strong>Date:</strong> <br/><strong>Attendees:</strong> </p><ol><li>Welcome &amp; objectives</li><li>Updates</li><li>Discussion</li><li>Action items</li><li>Next steps</li></ol>',
      text: 'Meeting agenda\nDate:\nAttendees:\n  1. Welcome & objectives\n  2. Updates\n  3. Discussion\n  4. Action items\n  5. Next steps',
    },
  },

  // ── Slide templates ──────────────────────────────────────────────────────────
  {
    id: 'slide-title', label: 'Title slide', icon: '◆', group: 'structure', kinds: ['slide'],
    content: { slide: { title: 'Presentation title', body: ['Subtitle or presenter name'] } },
  },
  {
    id: 'slide-agenda', label: 'Agenda slide', icon: '🗓', group: 'structure', kinds: ['slide'],
    content: { slide: { title: 'Agenda', body: ['Introduction', 'Key points', 'Discussion', 'Next steps'] } },
  },
  {
    id: 'slide-section', label: 'Section divider', icon: '―', group: 'structure', kinds: ['slide'],
    content: { slide: { title: 'Section title', body: [] } },
  },
  {
    id: 'slide-bullets', label: 'Bulleted slide', icon: '•', group: 'content', kinds: ['slide'],
    content: { slide: { title: 'Slide title', body: ['First point', 'Second point', 'Third point'] } },
  },
  {
    id: 'slide-closing', label: 'Closing slide', icon: '✦', group: 'content', kinds: ['slide'],
    content: { slide: { title: 'Thank you', body: ['Questions?', 'contact@example.com'] } },
  },
];

/** Tools available for a document kind, in catalog order. */
export const toolsForKind = (kind: DocKind): InsertTool[] => INSERT_TOOLS.filter((t) => t.kinds.includes(kind));

/** Tools for a kind, grouped (only non-empty groups, in TOOL_GROUPS order). */
export function groupedToolsForKind(kind: DocKind): Array<{ group: ToolGroup; label: string; tools: InsertTool[] }> {
  const available = toolsForKind(kind);
  return TOOL_GROUPS
    .map(({ id, label }) => ({ group: id, label, tools: available.filter((t) => t.group === id) }))
    .filter((g) => g.tools.length > 0);
}
