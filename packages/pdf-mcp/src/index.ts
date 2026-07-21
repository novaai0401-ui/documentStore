/**
 * pdfcraft MCP server.
 *
 * Exposes pdfcraft's document operations as Model Context Protocol tools so an
 * AI agent (Claude, etc.) can operate on PDFs — crucially including the things
 * agents normally can't do safely: TRUE redaction (with verification),
 * accessibility tagging, and form filling — all fully locally, no upload.
 *
 * PDFs cross the tool boundary as base64. Run over stdio:
 *   pnpm --filter @pdfcraft/mcp build && node packages/pdf-mcp/dist/index.js
 * then point an MCP client (Claude Desktop / Code) at the binary.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  listFormFields,
  fillForm,
  tagAccessibilityPdf,
  extractText,
  redactMatches,
} from './tools.js';

const b64ToBytes = (b64: string): Uint8Array => new Uint8Array(Buffer.from(b64, 'base64'));
const bytesToB64 = (b: Uint8Array): string => Buffer.from(b).toString('base64');
const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] });

const server = new McpServer({ name: 'pdfcraft', version: '0.1.0' });

server.tool(
  'pdf_extract_text',
  'Extract the text of a PDF, page by page. Input: base64 PDF. Returns page-tagged text.',
  { pdf_base64: z.string().describe('Base64-encoded PDF bytes') },
  async ({ pdf_base64 }) => {
    const pages = await extractText(b64ToBytes(pdf_base64));
    return text(pages.map((p) => `[Page ${p.page}]\n${p.text}`).join('\n\n') || '(no extractable text — likely a scan)');
  },
);

server.tool(
  'pdf_list_form_fields',
  'List the AcroForm fields of a PDF (id, type, current value, required). Input: base64 PDF.',
  { pdf_base64: z.string() },
  async ({ pdf_base64 }) => {
    const fields = await listFormFields(b64ToBytes(pdf_base64));
    return text(JSON.stringify(fields, null, 2));
  },
);

server.tool(
  'pdf_fill_form',
  'Fill AcroForm fields and return the edited PDF (base64). Values map field id → string | boolean | string[]. Original bytes preserved via incremental update.',
  { pdf_base64: z.string(), values: z.record(z.union([z.string(), z.boolean(), z.array(z.string())])) },
  async ({ pdf_base64, values }) => {
    const out = await fillForm(b64ToBytes(pdf_base64), values);
    return text(`Filled ${Object.keys(values).length} field(s). Edited PDF (base64):\n${bytesToB64(out)}`);
  },
);

server.tool(
  'pdf_tag_accessibility',
  'Tag a PDF for accessibility (PDF/UA-style): marked content + StructTreeRoot + /ParentTree + language. Returns the tagged PDF (base64).',
  { pdf_base64: z.string(), language: z.string().optional().describe('BCP-47, e.g. en-US'), title: z.string().optional() },
  async ({ pdf_base64, language, title }) => {
    const out = await tagAccessibilityPdf(b64ToBytes(pdf_base64), { lang: language, title });
    return text(`Tagged for accessibility. PDF (base64):\n${bytesToB64(out)}`);
  },
);

server.tool(
  'pdf_redact',
  'TRUE-redact every occurrence of the given terms (text physically removed from the content stream, not just covered), then INDEPENDENTLY verify nothing leaked. Returns a verification report + the redacted PDF (base64). Refuses to claim success if any term survives.',
  {
    pdf_base64: z.string(),
    terms: z.array(z.string()).min(1).describe('Strings to redact, e.g. names, emails, IDs'),
    case_sensitive: z.boolean().optional().default(false),
  },
  async ({ pdf_base64, terms, case_sensitive }) => {
    const r = await redactMatches(b64ToBytes(pdf_base64), terms, { caseSensitive: case_sensitive });
    const header = r.verified
      ? `✓ VERIFIED: redacted ${r.matched} occurrence(s); independent re-extraction found no surviving text.`
      : `✕ NOT VERIFIED: ${r.matched} occurrence(s) redacted but text still recoverable on page(s) ${r.leaks.map((l) => l.page).join(', ')} — DO NOT distribute.`;
    return text(`${header}\n\nRedacted PDF (base64):\n${bytesToB64(r.pdf)}`);
  },
);

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
  // Logs go to stderr so they don't corrupt the stdio JSON-RPC stream.
  console.error('pdfcraft MCP server running on stdio');
}

main().catch((e) => {
  console.error('pdfcraft MCP server failed:', e);
  process.exit(1);
});
