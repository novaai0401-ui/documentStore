# pdfcraft — Security & Compliance Whitepaper

*How a fully client-side document architecture changes the compliance
conversation. Last updated June 2026. This document is generated technical
documentation and reasoning, **not legal advice**; have counsel confirm
conclusions for your jurisdiction and use case.*

---

## 1. The architecture in one paragraph

pdfcraft opens, edits, redacts, tags, signs, and saves PDFs **entirely in the
user's browser**. There is no upload endpoint, no processing server, and no
account. The document bytes are read into browser memory, every operation
(rendering via pdf.js, parsing/writing via `@pdfcraft/parser`, OCR via
Tesseract WASM) executes locally, and saving produces a new file via PDF
*incremental update* — the original bytes are preserved and edits are
appended, so the source document can never be corrupted by the tool.

**The compliance consequence:** most document-tool obligations attach at the
moment a third party *receives* the document. pdfcraft is engineered so that
moment never occurs.

## 2. Data-flow statement

| Data | Leaves the device? | Notes |
|---|---|---|
| The PDF (bytes, text, form values) | **No** | All parsing, editing, redaction, tagging, saving is in-browser |
| OCR images / recognized text | **No** | Tesseract runs as WASM locally; models self-hostable (`configureOcr`) |
| Redaction verification, accessibility audit | **No** | Independent re-parse of the exported bytes, in-browser |
| Telemetry / analytics | **No** | None is built in |
| **Exception — Ask-AI with a configured remote endpoint** | **Yes, extracted text only, at explicit user/host choice** | See §6 — disable, proxy, or keep fully local |

A deployment that does not configure a remote AI endpoint is **network-silent
with respect to document content**, and this is independently verifiable (§5).

## 3. GDPR (EU/UK)

- **No processor relationship.** Uploading documents containing personal data
  to an online converter makes that vendor a *processor* under GDPR Art. 28 —
  requiring a DPA, security guarantees, and audit rights, per document
  workflow. With client-side processing the vendor never processes personal
  data at all: **there is no processor, so there is no DPA to sign and no
  Art. 28 obligation to manage.**
- **No international transfer.** Post-*Schrems II*, EDPB guidance treats
  "transfer to a cloud provider that requires access to data in the clear" as
  presumptively unlawful without supplementary measures — which describes any
  server-side PDF tool, since the file must be processed in plaintext.
  Client-side processing eliminates Chapter V analysis entirely: no data
  leaves the controller's device.
- **Data-minimisation by construction** (Art. 5(1)(c)): the tool can't retain,
  log, or mine what it never receives.

## 4. HIPAA (US healthcare)

A vendor that "creates, receives, maintains, or transmits" PHI on behalf of a
covered entity is a *business associate* and must sign a BAA — and HHS/OCR has
fined the **absence of a BAA alone** ($500,000 — Advanced Care Hospitalists,
2018; $750,000 — Raleigh Orthopaedic, 2016). Consumer web PDF converters do
not sign BAAs, so routing PHI through them is non-compliant *per se*,
breach or no breach.

pdfcraft never receives PHI — processing happens inside the covered entity's
own browser — so on the same logic that exempts locally-installed software,
**no business-associate relationship arises**. (Caveat: this is the widely
used reasoning for client-side/local software, not an OCR-issued safe harbor;
confirm with your privacy officer. The §6 AI exception applies.)

## 5. Verifiability — don't take our word for it

Claims about "privacy" are cheap. pdfcraft's are testable by your security
team in minutes:

1. **Network tab test.** Open DevTools → Network, load a PDF, edit, redact,
   tag, save. Observe: no request carries document content. With self-hosted
   assets (below) there are no third-party requests at all.
2. **Offline test.** Load the app, disconnect from the network, and perform
   the same operations. They work — the only network-dependent features are
   first-fetch of static assets and the optional remote AI.
3. **Content-Security-Policy enforcement.** Deployments can make network
   silence *policy, not promise*:

   ```
   Content-Security-Policy: default-src 'self'; connect-src 'self'; img-src 'self' blob: data:; worker-src 'self' blob:; script-src 'self' 'wasm-unsafe-eval'
   ```

   With `connect-src 'self'` (or `'none'` plus self-hosted assets), the
   browser itself blocks any attempt — by the app, a dependency, or a future
   regression — to send data elsewhere.
4. **Self-hosted assets.** The pdf.js worker and Tesseract OCR
   (worker/WASM/language models, via `configureOcr({ workerPath, corePath,
   langPath })`) can be served from your origin for air-gapped deployments.
5. **Verified outputs.** The two highest-risk operations verify their own
   results from the exported bytes, independently re-parsed:
   - **Redaction:** text under each box is physically removed from the content
     stream; the verifier re-extracts the saved file and refuses to certify if
     anything is recoverable (the failure mode of the Manafort 2019 and DOJ
     Epstein-files 2025 incidents).
   - **Accessibility:** the compliance report re-audits the exported file's
     catalog and text layer, and explicitly lists which criteria are
     machine-verified vs. require human review.

## 6. The one honest exception: remote AI

The optional **Ask AI** / AI-assisted Smart Tools can send *extracted document
text* (never the file) to a model endpoint. This is off by default and there
are three deployment postures, strictest first:

| Posture | Configuration | Document text leaves device? |
|---|---|---|
| **Sealed** | No endpoint configured (or hidden via `showAi={false}`); CSP `connect-src 'self'` | Never — offline extractive helpers still work |
| **Proxied** | Host supplies `onAiAsk` → your own server-side gateway (your DPA/BAA chain, your logging) | To *your* infrastructure only |
| **Direct** | User enters an endpoint + key (stored only in their browser) | To the user's chosen provider, at their action |

On-device AI paths (browser built-in translation, local models) are used when
available, keeping even AI features local where the platform allows.

## 7. Accessibility-law posture (what the tool helps *you* comply with)

- **European Accessibility Act** — applies since **June 28, 2025**; in-scope
  services' customer-facing documents must meet EN 301 549 (→ WCAG 2.1 AA),
  with PDF/UA as the de-facto PDF implementation standard.
- **ADA Title II (US)** — DOJ rule requires WCAG 2.1 AA for state/local
  government web content **including PDFs**; compliance dates **April 26,
  2027** (entities ≥50k population) and **April 26, 2028** (smaller), per the
  DOJ's April 2026 extension. **Section 508** already requires it federally.

pdfcraft's Access workflow (audit → remediate → re-audit the exported bytes →
filed-ready HTML report) is built for exactly these obligations, and its
reports state plainly which criteria are machine-verified and which need
human review.

## 8. Residual risks & honest limitations

- **The browser is the trust boundary.** A compromised endpoint, malicious
  extension, or tampered deployment can read anything the user opens. CSP,
  SRI, and serving from your own origin mitigate; endpoint security is yours.
- **Redaction verification covers extractable text** (content streams). It
  over-removes on intersection by design, but exotic constructs (text painted
  inside Form XObjects, Type 3 glyphs, text burned into images without OCR)
  are why the verifier — not the redactor — is the authority: if text
  survives, it reports FAIL and refuses to certify.
- **Accessibility reports are partially human.** Alt-text quality and heading
  semantics cannot be machine-certified and are labeled "review."
- **Local persistence**: the demo stores saved payloads in `localStorage` for
  convenience; deployments handling sensitive data should disable or replace
  this via the `onPersist` hook policy.
- This whitepaper describes the architecture as of June 2026; regulatory
  citations reflect public sources at that date and should be re-verified
  before reliance.
