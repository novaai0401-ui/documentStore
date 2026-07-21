# @pdfcraft/mcp

A **Model Context Protocol** server that gives an AI agent real PDF
super-powers — fully locally, no upload:

| Tool | What it does |
|---|---|
| `pdf_extract_text` | Page-by-page text of a PDF |
| `pdf_list_form_fields` | AcroForm fields (id, type, value, required) |
| `pdf_fill_form` | Fill fields → edited PDF (incremental update; originals preserved) |
| `pdf_tag_accessibility` | PDF/UA-style tagging (marked content + StructTreeRoot + /ParentTree + language) |
| `pdf_redact` | **TRUE-redact** every occurrence of given terms (text physically removed), then **independently verify** nothing leaked — refuses to claim success if a term survives |

PDFs cross the tool boundary as base64. Everything runs in-process via
`@pdfcraft/parser` + `@pdfcraft/engine`; the document never leaves the machine.

## Run

```bash
pnpm --filter @pdfcraft/mcp build
node packages/pdf-mcp/dist/index.js   # speaks MCP over stdio
```

### Claude Desktop / Claude Code

Add to your MCP config (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "pdfcraft": { "command": "node", "args": ["/abs/path/packages/pdf-mcp/dist/index.js"] }
  }
}
```

Then ask the agent things like *"redact every occurrence of john@acme.com and
verify it's gone"* or *"tag this PDF for accessibility in en-GB"*.

## Why it matters

"Chat with PDF" is commoditized. Letting an agent **safely act** on a
document — true redaction with verification, accessibility remediation, form
filling — without shipping the file to a cloud is the differentiator. This is
pdfcraft's agent-native surface.
