/**
 * Pyntra's document-templates directory — an extensible set of ready-to-edit
 * starting documents, the third "directory" alongside themes and content-tools.
 * Each template declares the editor kind it opens in and produces seed content
 * in that kind's native shape (Markdown/text, Word HTML, sheet rows, or slides).
 * Add an entry here and it appears in the workspace's "Start from a template"
 * gallery — no other wiring needed.
 */
import type { Slide } from '../../smart/convert.js';

export type TemplateKind = 'text' | 'word' | 'sheet' | 'slides';

/** The seed a template hands back; the workspace maps it onto a live editor. */
export interface TemplateDoc {
  name: string;
  ext: string;
  kind: TemplateKind;
  text?: string;       // text / markdown
  html?: string;       // word
  rows?: string[][];   // sheet
  slides?: Slide[];    // slides
  theme?: string;      // theme id the editor opens with (default 'clean')
}

export interface DocTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  kind: TemplateKind;
  make: () => TemplateDoc;
}

export const TEMPLATES: DocTemplate[] = [
  // ── Blank starters ───────────────────────────────────────────────────────────
  {
    id: 'blank-md', name: 'Blank Markdown', description: 'An empty Markdown document.', icon: '📝', kind: 'text',
    make: () => ({ name: 'untitled', ext: 'md', kind: 'text', text: '# Title\n\nStart writing…\n' }),
  },
  {
    id: 'blank-doc', name: 'Blank document', description: 'An empty Word document.', icon: '📄', kind: 'word',
    make: () => ({ name: 'untitled', ext: 'docx', kind: 'word', html: '<h1>Title</h1><p>Start writing…</p>' }),
  },
  {
    id: 'blank-sheet', name: 'Blank spreadsheet', description: 'An empty grid.', icon: '🔢', kind: 'sheet',
    make: () => ({ name: 'untitled', ext: 'xlsx', kind: 'sheet', rows: [['', '', ''], ['', '', ''], ['', '', '']] }),
  },
  {
    id: 'blank-deck', name: 'Blank deck', description: 'A single empty slide.', icon: '🟧', kind: 'slides',
    make: () => ({ name: 'untitled', ext: 'pptx', kind: 'slides', slides: [{ title: 'Title', body: [] }] }),
  },

  // ── Markdown / text ──────────────────────────────────────────────────────────
  {
    id: 'readme', name: 'Project README', description: 'A README with the usual sections.', icon: '📘', kind: 'text',
    make: () => ({
      name: 'README', ext: 'md', kind: 'text', theme: 'mono',
      text: [
        '# Project name', '', 'One-sentence description of what this project does.', '',
        '## Features', '', '- Feature one', '- Feature two', '- Feature three', '',
        '## Installation', '', '```bash', 'npm install project-name', '```', '',
        '## Usage', '', '```js', "import { thing } from 'project-name';", '```', '',
        '## Contributing', '', 'Pull requests are welcome. For major changes, open an issue first.', '',
        '## License', '', 'MIT', '',
      ].join('\n'),
    }),
  },
  {
    id: 'meeting-notes', name: 'Meeting notes', description: 'Agenda, discussion, and action items.', icon: '🗒', kind: 'text',
    make: () => ({
      name: 'meeting-notes', ext: 'md', kind: 'text', theme: 'aurora',
      text: [
        '# Meeting notes', '', '**Date:** ', '**Attendees:** ', '',
        '## Agenda', '', '1. ', '2. ', '3. ', '',
        '## Discussion', '', '- ', '',
        '## Action items', '', '- [ ] Owner — task (due)', '- [ ] Owner — task (due)', '',
        '## Decisions', '', '- ', '',
      ].join('\n'),
    }),
  },

  // ── Word ─────────────────────────────────────────────────────────────────────
  {
    id: 'business-letter', name: 'Business letter', description: 'A formal letter layout.', icon: '✉️', kind: 'word',
    make: () => ({
      name: 'letter', ext: 'docx', kind: 'word',
      html: [
        '<p>Your Name<br>Your Company<br>123 Example Street<br>City, State 00000</p>',
        '<p>' + new Date().toLocaleDateString() + '</p>',
        '<p>Recipient Name<br>Their Company<br>456 Other Avenue<br>City, State 00000</p>',
        '<p>Dear Recipient,</p>',
        '<p>Opening paragraph stating the purpose of your letter.</p>',
        '<p>Body paragraph with supporting detail.</p>',
        '<p>Closing paragraph with a call to action or next step.</p>',
        '<p>Sincerely,</p>',
        '<p>Your Name</p>',
      ].join(''),
    }),
  },
  {
    id: 'report', name: 'Project report', description: 'Headed report with summary and sections.', icon: '📊', kind: 'word',
    make: () => ({
      name: 'report', ext: 'docx', kind: 'word', theme: 'mono',
      html: [
        '<h1>Project report</h1>',
        '<p><strong>Author:</strong> &nbsp; <strong>Date:</strong> ' + new Date().toLocaleDateString() + '</p>',
        '<h2>Executive summary</h2><p>One paragraph summarizing the key findings and recommendation.</p>',
        '<h2>Background</h2><p>Context and objectives.</p>',
        '<h2>Findings</h2><ul><li>Finding one</li><li>Finding two</li><li>Finding three</li></ul>',
        '<h2>Recommendation</h2><p>What should happen next and why.</p>',
        '<h2>Next steps</h2><ol><li>Step one</li><li>Step two</li></ol>',
      ].join(''),
    }),
  },

  // ── Sheet ────────────────────────────────────────────────────────────────────
  {
    id: 'invoice-sheet', name: 'Invoice', description: 'An itemized invoice with totals.', icon: '🧾', kind: 'sheet',
    make: () => ({
      name: 'invoice', ext: 'xlsx', kind: 'sheet', theme: 'sunset',
      rows: [
        ['Invoice #', '0001', '', ''],
        ['Date', new Date().toLocaleDateString(), '', ''],
        ['Bill to', '', '', ''],
        ['', '', '', ''],
        ['Item', 'Qty', 'Unit price', 'Amount'],
        ['Service A', '1', '0', '0'],
        ['Service B', '1', '0', '0'],
        ['', '', 'Subtotal', '0'],
        ['', '', 'Tax', '0'],
        ['', '', 'Total', '0'],
      ],
    }),
  },
  {
    id: 'budget', name: 'Monthly budget', description: 'Income vs. expenses tracker.', icon: '💰', kind: 'sheet',
    make: () => ({
      name: 'budget', ext: 'xlsx', kind: 'sheet',
      rows: [
        ['Category', 'Budgeted', 'Actual', 'Difference'],
        ['Income', '0', '0', '0'],
        ['Rent', '0', '0', '0'],
        ['Groceries', '0', '0', '0'],
        ['Utilities', '0', '0', '0'],
        ['Transport', '0', '0', '0'],
        ['Savings', '0', '0', '0'],
        ['Total', '0', '0', '0'],
      ],
    }),
  },

  // ── Slides ───────────────────────────────────────────────────────────────────
  {
    id: 'pitch-deck', name: 'Pitch deck', description: 'A classic 10-slide startup pitch.', icon: '🚀', kind: 'slides',
    make: () => ({
      name: 'pitch', ext: 'pptx', kind: 'slides', theme: 'midnight',
      slides: [
        { title: 'Company name', body: ['Tagline — what you do in one line'] },
        { title: 'Problem', body: ['The pain point', 'Who feels it', 'Why it matters'] },
        { title: 'Solution', body: ['Your product', 'How it solves the problem'] },
        { title: 'Product', body: ['Key features', 'What makes it work'] },
        { title: 'Market', body: ['Size of the opportunity', 'Target segments'] },
        { title: 'Business model', body: ['How you make money', 'Pricing'] },
        { title: 'Traction', body: ['Key metrics', 'Milestones to date'] },
        { title: 'Competition', body: ['Alternatives', 'Your advantage'] },
        { title: 'Team', body: ['Founders', 'Relevant experience'] },
        { title: 'Ask', body: ['What you are raising', 'How you will use it'] },
      ],
    }),
  },
  {
    id: 'kickoff-deck', name: 'Project kickoff', description: 'Align a team at project start.', icon: '🏁', kind: 'slides',
    make: () => ({
      name: 'kickoff', ext: 'pptx', kind: 'slides', theme: 'forest',
      slides: [
        { title: 'Project kickoff', body: ['Project name', 'Date'] },
        { title: 'Goals', body: ['Objective one', 'Objective two'] },
        { title: 'Scope', body: ['In scope', 'Out of scope'] },
        { title: 'Timeline', body: ['Milestone 1 — date', 'Milestone 2 — date'] },
        { title: 'Roles', body: ['Owner', 'Contributors', 'Stakeholders'] },
        { title: 'Next steps', body: ['Immediate actions', 'Owners'] },
      ],
    }),
  },
  {
    id: 'sales-deck', name: 'Sales deck', description: 'Pitch a product to a prospect.', icon: '📈', kind: 'slides',
    make: () => ({
      name: 'sales', ext: 'pptx', kind: 'slides', theme: 'midnight',
      slides: [
        { title: 'Your Company', body: ['The one-line pitch'] },
        { title: 'The problem', body: ['What hurts today', 'Why it matters', 'Who feels it'] },
        { title: 'Our solution', body: ['What we do', 'How it works'] },
        { title: 'Why us', body: ['Differentiator one', 'Differentiator two'] },
        { title: 'Proof', body: ['Customer result', 'Metric / testimonial'] },
        { title: 'Pricing', body: ['Plan & price', "What's included"] },
        { title: 'Next steps', body: ['Trial / demo', 'Point of contact'] },
      ],
    }),
  },
  {
    id: 'webinar-deck', name: 'Webinar / training', description: 'Teach a topic in a session.', icon: '🎓', kind: 'slides',
    make: () => ({
      name: 'webinar', ext: 'pptx', kind: 'slides', theme: 'forest',
      slides: [
        { title: 'Session title', body: ['Presenter · Date'] },
        { title: 'Agenda', body: ['Part 1', 'Part 2', 'Q&A'] },
        { title: 'Learning goals', body: ['You will learn…', '…and be able to…'] },
        { title: 'Key concept', body: ['Point one', 'Point two', 'Point three'] },
        { title: 'Demo / example', body: ['Walkthrough', 'Takeaways'] },
        { title: 'Recap', body: ['What we covered', 'Resources'] },
        { title: 'Questions?', body: ['Contact', 'Follow-up link'] },
      ],
    }),
  },
  {
    id: 'qbr-deck', name: 'Quarterly review', description: 'Report results to stakeholders.', icon: '📊', kind: 'slides',
    make: () => ({
      name: 'qbr', ext: 'pptx', kind: 'slides',
      slides: [
        { title: 'Q_ Business Review', body: ['Team · Quarter'] },
        { title: 'Highlights', body: ['Win one', 'Win two', 'Win three'] },
        { title: 'Metrics', body: ['KPI 1 — target vs actual', 'KPI 2 — target vs actual'] },
        { title: 'Challenges', body: ['What slipped', 'Why'] },
        { title: 'Next quarter', body: ['Priority one', 'Priority two'] },
        { title: 'Asks', body: ['What we need', 'From whom'] },
      ],
    }),
  },
  {
    id: 'marketing-deck', name: 'Marketing plan', description: 'Lay out a campaign plan.', icon: '📣', kind: 'slides',
    make: () => ({
      name: 'marketing', ext: 'pptx', kind: 'slides', theme: 'midnight',
      slides: [
        { title: 'Campaign name', body: ['Goal & timeframe'] },
        { title: 'Audience', body: ['Who', 'What they care about'] },
        { title: 'Message', body: ['Core message', 'Proof points'] },
        { title: 'Channels', body: ['Channel one', 'Channel two', 'Channel three'] },
        { title: 'Budget & timeline', body: ['Spend', 'Key dates'] },
        { title: 'Success metrics', body: ['KPI one', 'KPI two'] },
      ],
    }),
  },
  {
    id: 'allhands-deck', name: 'Company all-hands', description: 'Update the whole company.', icon: '🏢', kind: 'slides',
    make: () => ({
      name: 'all-hands', ext: 'pptx', kind: 'slides', theme: 'forest',
      slides: [
        { title: 'All-Hands', body: ['Month · Year'] },
        { title: 'Where we are', body: ['Wins', 'Numbers'] },
        { title: 'What we shipped', body: ['Highlight one', 'Highlight two'] },
        { title: 'Focus ahead', body: ['Priority one', 'Priority two'] },
        { title: 'Team & culture', body: ['Welcomes', 'Shout-outs'] },
        { title: 'Q&A', body: ['Ask anything'] },
      ],
    }),
  },
];

export const templatesByKind = (kind: TemplateKind): DocTemplate[] => TEMPLATES.filter((t) => t.kind === kind);
