# Pyntra — Product & Technical Roadmap

> **Strategic wedge:** *Private Document Intelligence.* Every competitor that does
> anything smart with your documents ships them to a server. Pyntra's moat is the
> opposite — **make it smart while nothing leaves the device.** That is the
> through-line of this roadmap.

The most useful problem to solve next: *"answer questions, find things, sign, and
clean up sensitive data across my documents — locally."*

---

## 1. Where we are (capability inventory)

| Area | Status | Key modules |
|------|--------|-------------|
| PDF edit / OCR / true redaction / forms / sign-stamp | ✅ | `v2/App.tsx`, `smart/redactVerify.ts`, `smart/pii.ts`, `smart/signature.ts` |
| Office editors (Word/Excel/PPT/Markdown) | ✅ | `v2/editors/*` |
| Convert (any → any) | ✅ | `smart/convert.ts`, `smart/officeBuild.ts` |
| Design Studio (templates, brand kits, image editor, QR, résumé/cover-letter) | ✅ | `v2/studio/*` |
| BYO-cloud AI (OpenAI-compatible) | ✅ | `v2/cloud/*`, `v2/ai/*` |
| Real-time collaboration (CRDT + encrypted relay) | ✅ | `v2/crdt/*`, `v2/collab/*` |
| Agent/MCP server | ✅ | `packages/pdf-mcp` |
| On-device ML runtime (ORT, used for bg-removal) | ⚠️ partial | `@imgly/background-removal`, ORT bundles |
| PWA / offline / installable | ✅ | `sw.js`, `manifest.webmanifest` |

**Already self-hosted & private:** all file processing, the pdf.js worker, OCR,
redaction, crypto. The only off-device traffic is opt-in (BYO AI, GA4 analytics).

---

## 2. Architectural enablers (build once; everything rides on them)

1. **On-device ML runtime (`smart/ml/`)** — promote ORT Web to a first-class shared
   service: WebGPU with wasm fallback, a model registry, weights cached in **OPFS**,
   capability detection, and graceful degrade to BYO-cloud. *Unlocks Pillars A & B.*
2. **Local RAG store (`smart/rag/`)** — on-device embeddings + a vector index in
   IndexedDB; per-document chunking; powers chat, semantic search, dedupe.
3. **Unified Document IR (`smart/docir.ts`)** — a thin common model over
   PDF/Word/Sheet/Slides/Design so tools and automation work cross-format.
4. **Job/pipeline engine (`smart/jobs/`)** — a Web Worker queue with progress,
   cancellation, and offscreen rendering so batch work never blocks the UI.
5. **Trust layer (`smart/trust.ts`)** — WebCrypto signing/verification + an
   append-only audit log primitive.
6. **File System Access integration** — open/save-in-place, drag a folder, watch-folder.

**Invariant to protect & test:** the local path makes *zero* network calls. Add a
test harness that fails if a "local" feature touches `fetch`/`XHR`.

---

## 3. Roadmap (pillars, prioritized by value × fit)

### Phase 1 — On-device AI + project UX (flagship)
- 🧠 **Chat with your documents, 100% locally** (RAG + on-device LLM, with citations).
  Cloud BYO remains the "bigger model" option.
- 🔎 **Semantic search across the whole library** (find by meaning, not just text).
- 🗂 **Projects / multi-doc tabs** — group related docs; **export résumé + cover
  letter as one PDF** (reuses `designToPdf`).
- 📨 **Mail-merge** — CSV + a template → many personalized PDFs, locally.

### Phase 2 — Trust & safety
- ✍️ **Real digital signatures (PAdES)** + multi-party **signing workflow**, audit
  trail, verification (extends `smart/signature.ts`, which already suggests fields).
- 🛡 **Auto-PII redaction** — promote `smart/pii.ts` to a one-click "find & redact all
  sensitive data," add **face detection** in images, feed verified true-redaction.
- ♿ **Auto alt-text & auto-tagging** via a local vision model — one-click WCAG/PDF-UA.

### Phase 3 — Automation
- ⚙️ **Recipes** — chain tools (convert → redact → compress → sign) across many
  files/folders; watch-folders.
- 🤖 **Expand the MCP server** so external agents can drive these pipelines.

### Phase 4 — Collaboration depth
- 💬 Comments/threads, @mentions, suggestions/approvals.
- ⏱ Version snapshots + restore (builds on `smart/visualDiff.ts`).
- 🔐 Permissioned share links + presence cursors.

### Phase 5 — Platform & ecosystem
- 🧩 Plugin API + a **template gallery**.
- 📊 Data-driven design (charts in the studio); richer offline font library.

---

## 4. Why this order
- **Phase 1** ships the defensible, on-brand "wow" and reuses infra we mostly have
  (ORT, AI panel, MCP) → highest leverage, lowest new risk.
- **Phase 2** converts that into revenue-relevant capabilities (signing, compliance).
- **Phases 3–5** deepen retention (automation, collab) and widen the ecosystem.

## 5. Risks & mitigations
- **Model weight size / first load** → progressive download + OPFS caching; small
  default models, optional larger ones.
- **WebGPU availability** → wasm fallback; feature-detect and degrade to BYO-cloud.
- **Privacy guarantee** → the no-network invariant is a unit-tested contract.
- **Bundle size** → every heavy capability stays code-split & lazy-loaded.

## 6. Success metrics
- Time-to-first-answer for "chat with docs" (local).
- % of tasks completed fully offline.
- Signing completion rate; redaction precision/recall on a PII fixture set.
- Activation: docs opened → action taken in first session.
