/**
 * Marketing / SEO landing page for Pyntra, served at "/". Self-contained
 * (no editor bundle) so it loads fast and reads well to crawlers and AI
 * assistants. Built with the Tekivex-ui design system under auroraLight, with
 * semantic, keyword-rich HTML for search/AI discoverability. The index.html
 * <head> carries the canonical tags + schema.org JSON-LD; /llms.txt and
 * /.well-known/ai-plugin.json describe the tool to AI agents.
 */
import { useEffect, useState } from 'react';
import { TkxButton, TkxCard, TkxCardBody, TkxBadge, TkxAccordion, TkxSEO, seoSchema, TkxRow, TkxCol } from 'tekivex-ui';
import { t, setLang, useLang, LANGUAGES, type Lang } from './i18n.js';
import './landing.css';

const APP_URL = '/app';
const DOCS_URL = '/docs';

function openApp() { window.location.href = APP_URL; }

const FEATURES: Array<{ icon: string; title: string; body: string; kw: string }> = [
  { icon: '📝', title: 'Edit any PDF like Word', kw: 'edit pdf online', body: 'Click any line and retype — even in “non-editable” flat PDFs. The original bytes stay intact via incremental update.' },
  { icon: '📂', title: 'Open any document — natively', kw: 'docx editor online', body: 'Word in a rich-text editor, Markdown/text in a text editor, PDFs & images in the PDF editor. Edit in place — no forced PDF conversion.' },
  { icon: '🔄', title: 'Convert to any format', kw: 'convert pdf to word', body: 'Export to editable Word, Markdown, EPUB, CSV, text, or page images. No upload, no watermark.' },
  { icon: '🔍', title: 'OCR scanned PDFs', kw: 'ocr pdf free', body: 'Turn image-only scans into real, searchable, selectable text in 13 languages, then edit them like any digital PDF.' },
  { icon: '🛡️', title: 'True redaction — verified', kw: 'redact pdf', body: 'Physically removes the text, then re-reads the exported file to certify nothing is recoverable — the check famous leaks failed.' },
  { icon: '✍️', title: 'Fill & sign forms', kw: 'fill and sign pdf', body: 'Fill existing AcroForm fields, add new ones, and drop signatures, stamps, dates, and images.' },
  { icon: '📄', title: 'Organize & merge pages', kw: 'merge pdf, split pdf', body: 'Reorder, delete, rotate, and merge multiple PDFs — via incremental update, original untouched.' },
  { icon: '🌐', title: 'Translate in place', kw: 'translate pdf', body: 'Translate every line while preserving layout — works on scans after OCR. On-device or your own AI key.' },
  { icon: '⇆', title: 'Compare versions', kw: 'compare pdf', body: 'Text diff + visual/pixel diff + an optional AI summary of what changed and why it matters.' },
  { icon: '🗜️', title: 'Compress images, PDFs & video', kw: 'compress image pdf video reduce file size', body: 'Batch-shrink photos, PDFs and clips without visible quality loss — a quality slider, before/after sizes, and a zip download. All client-side.' },
  { icon: '🔄', title: 'Convert HEIC → JPG & more', kw: 'heic to jpg converter', body: 'Turn iPhone HEIC photos into JPG/PNG/WebP/AVIF — or combine images into a PDF — decoded and re-encoded right in your browser.' },
  { icon: '📸', title: 'Scan documents', kw: 'document scanner online', body: 'Capture pages with your camera (or add photos), auto-enhance them, reorder, and export a clean multi-page PDF. A private CamScanner alternative.' },
  { icon: '⏺', title: 'Record screen & camera', kw: 'screen recorder online free', body: 'Record your screen or webcam with mic, pause/resume, preview, and download — captured entirely on-device with native browser APIs.' },
  { icon: '🎬', title: 'Video Studio', kw: 'trim video make gif online', body: 'Trim, compress, extract audio, or turn a clip into a GIF — your own files only, no uploads, no site-ripping.' },
  { icon: '💌', title: 'Invitations & greeting cards', kw: 'make invitation greeting card online', body: 'Beautiful editable invitations and festival greetings — birthdays, weddings, New Year, Diwali, Christmas, Eid — download print-ready PNG/PDF or share a live link.' },
  { icon: '🏛️', title: 'PDF/A for archiving', kw: 'pdf to pdfa', body: 'Convert to image-based PDF/A-1b with our own generated sRGB ICC OutputIntent + XMP — no external assets.' },
  { icon: '🔐', title: 'Open encrypted Word', kw: 'open password protected docx', body: 'Unlock password-protected .docx files with our own from-scratch AES + agile-encryption implementation.' },
  { icon: '♿', title: 'Make PDFs accessible', kw: 'pdf accessibility wcag', body: 'Audit against WCAG 2.1 AA / PDF/UA, remediate (tags + structure tree + language), and produce a filed-ready report.' },
  { icon: '✦', title: 'AI assistant', kw: 'chat with pdf ai', body: 'Ask questions about your document with page citations, summarize, extract key facts, and auto-detect form fields.' },
  { icon: '🤖', title: 'Agent-native (MCP)', kw: 'pdf mcp server', body: 'Ships a Model Context Protocol server so AI agents can extract, fill, tag, and truly-redact PDFs locally.' },
];

/** Animated feature tour — auto-advancing spotlights that show what a feature
 *  does AND the exact menu path to reach it. Also crawlable feature content. */
const TOUR: Array<{ icon: string; tag: string; title: string; body: string; access: string }> = [
  { icon: '📝', tag: 'Documents', title: 'Edit any PDF like Word', body: 'Click a line and retype — even in flat, “non-editable” PDFs. Then save, convert, or sign.', access: 'Open a file ▸ click text to edit' },
  { icon: '🛡️', tag: 'Privacy', title: 'True redaction, verified', body: 'Physically removes the text, then re-reads the export to prove nothing is recoverable.', access: 'Smart Tools ▸ Redact PII' },
  { icon: '✨', tag: 'Design · AI', title: 'Prompt to design', body: 'Describe it — “summer sale, 30% off” — and get a finished, on-brand design in a click. On-device.', access: 'Tools ▸ Prompt to design' },
  { icon: '⤢', tag: 'Design', title: 'Magic Resize', body: 'Turn one design into every social & print size at once, on brand — export a ZIP or one PDF.', access: 'Open a design ▸ ✨ Resize all' },
  { icon: '🎬', tag: 'Design · Video', title: 'Animate & add music', body: 'Give elements a staggered entrance and export a GIF, sharp Animated PNG, or video with music.', access: 'Open a design ▸ 🎬 Animate' },
  { icon: '🌐', tag: 'Design · Global', title: 'Designs in any language', body: 'Translate a whole design into another language as a new page — layout kept, on-device.', access: 'Open a design ▸ 🌐 Translate' },
  { icon: '🪄', tag: 'Image', title: 'Remove background & objects', body: 'Cut out the background or erase an unwanted object — inpainted locally, nothing uploaded.', access: 'Tools ▸ Image ▸ Erase / Remove bg' },
  { icon: '★', tag: 'Brand', title: 'Brand kits, enforced', body: 'Drag in your logo, set colours & fonts — every new design stays on brand automatically.', access: 'Open a design ▸ ★ Brand' },
  { icon: '🎥', tag: 'Media', title: 'Video studio & recorder', body: 'Trim clips, make GIFs, extract audio, or record your screen/camera — your own files only.', access: 'Tools ▸ Video / Record' },
  { icon: '🤝', tag: 'Collaborate', title: 'Real-time, encrypted', body: 'Share a link and co-edit across devices — end-to-end encrypted, no account.', access: 'Open a doc ▸ 🔗 Share' },
];

function FeatureTour() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    const t = setInterval(() => setI((p) => (p + 1) % TOUR.length), 4500);
    return () => clearInterval(t);
  }, [paused]);
  const f = TOUR[i]!;
  return (
    <section className="lp-tour" aria-label="Feature tour" aria-roledescription="carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <h2>See what you can do — and where to find it</h2>
      <p className="lp-tour-lead">A quick tour of Pyntra’s studio. Hover to pause, or jump with the dots.</p>
      <div className="lp-tour-stage">
        <div className="lp-tour-visual" key={`v${i}`} aria-hidden>
          <span className="lp-tour-blob lp-tour-blob--a" />
          <span className="lp-tour-blob lp-tour-blob--b" />
          <span className="lp-tour-emoji">{f.icon}</span>
        </div>
        <div className="lp-tour-info" key={`i${i}`}>
          <span className="lp-tour-tag">{f.tag}</span>
          <h3>{f.title}</h3>
          <p>{f.body}</p>
          <div className="lp-tour-access"><span className="lp-tour-access-label">Find it</span> <code>{f.access}</code></div>
          <TkxButton size="md" colorScheme="primary" onClick={openApp}>Try it →</TkxButton>
        </div>
      </div>
      <div className="lp-tour-dots" role="tablist">
        {TOUR.map((t, d) => (
          <button key={t.title} role="tab" aria-selected={d === i} aria-label={t.title} className={'lp-tour-dot' + (d === i ? ' lp-tour-dot--on' : '')} onClick={() => setI(d)}>
            {d === i && !paused && <span className="lp-tour-dot-fill" />}
          </button>
        ))}
      </div>
    </section>
  );
}

const OPEN_FORMATS = 'PDF · Word (.docx) · OpenDocument (.odt) · RTF · Markdown · HTML · Text · Images (PNG, JPEG, WEBP, GIF, BMP, SVG, TIFF)';
const EXPORT_FORMATS = 'PDF · Editable Word (.docx) · EPUB · Markdown · CSV · Plain text · Page images (PNG/JPEG) · PDF/A-1b';

const WHY: Array<{ title: string; body: string }> = [
  { title: 'Private by design', body: 'Every operation runs locally in your browser. Files never leave your device — no upload, no server, no processor, no DPA or BAA to sign.' },
  { title: 'Real redaction, proven', body: 'Most tools draw a black box you can copy-paste under. Pyntra removes the glyphs and independently re-reads the export to prove they’re gone.' },
  { title: 'We build it ourselves', body: 'Our own AES cipher, CFB reader, TIFF decoder, PNG encoder, ICC-profile generator and OOXML writers — so capabilities aren’t gated behind a paid API.' },
  { title: 'No subscription trap', body: 'Free in the browser, no account, no watermark, no dark patterns. Embed it commercially with an offline-verified license key.' },
  { title: 'Agent & SEO ready', body: 'An MCP server, an llms.txt, an ai-plugin manifest and schema.org metadata mean any AI assistant or search engine can find and use Pyntra.' },
];

const STEPS: Array<{ n: string; title: string; body: string }> = [
  { n: '1', title: 'Open anything', body: 'Drop a PDF — or a Word, OpenDocument, image, or text file. Non-PDFs are converted in your browser instantly.' },
  { n: '2', title: 'Edit & enhance', body: 'Retype text, redact, sign, OCR, translate, add fields, organize pages, or run the AI assistant and Smart Tools.' },
  { n: '3', title: 'Export anywhere', body: 'Save back to PDF, or convert to Word, EPUB, Markdown, images, or archival PDF/A. Download — nothing uploaded.' },
];

const FAQ = [
  { id: 'free', title: 'Is Pyntra really free?', content: 'Yes — every tool is free in your browser with no account and no watermark. Commercial embedding in your own product uses an offline-verified license key; there is no usage metering or phone-home.' },
  { id: 'upload', title: 'Do my files get uploaded to a server?', content: 'No. All editing, OCR, redaction, conversion, encryption/decryption, and AI retrieval happen locally in your browser. There is no backend, which is why it’s GDPR- and HIPAA-friendly by architecture.' },
  { id: 'formats', title: 'Which document formats can it open and convert?', content: `Open: ${OPEN_FORMATS}. Export: ${EXPORT_FORMATS}.` },
  { id: 'edit', title: 'Can I edit text in a PDF that isn’t editable?', content: 'Yes. Pyntra reads the real text layer so you can click and edit any line. Scanned, image-only PDFs can be OCR’d first to recover an editable, searchable text layer.' },
  { id: 'redact', title: 'Does it really redact, or just cover the text?', content: 'It physically removes the text from the file via a content-stream interpreter, then independently re-reads the exported bytes and certifies that no text survives in any redacted region.' },
  { id: 'encrypted', title: 'Can it open password-protected Word files?', content: 'Yes — modern (agile, Office 2010+) encrypted .docx files are unlocked entirely in-browser with our own AES + CFB + key-derivation implementation. You’re prompted for the password on open.' },
  { id: 'enterprise', title: 'Can I embed Pyntra in my own enterprise app?', content: 'Yes. It ships as composable npm packages with a headless React core and a tiny 9-method UI-adapter contract (HTML, MUI, Tekivex adapters included). It can be vendored with no registry access. See the documentation.' },
];

const SITE = 'https://pyntra.tekivex.com';
const SEO_KEYWORDS = [
  'pdf editor', 'edit pdf online free', 'docx editor online', 'word editor online',
  'convert pdf to word', 'word to pdf', 'markdown editor',
  'ocr pdf', 'redact pdf', 'fill and sign pdf', 'merge pdf', 'compress pdf', 'pdf to pdfa',
  'compress image', 'heic to jpg', 'document scanner online', 'screen recorder online',
  'trim video online', 'video to gif', 'make invitation online', 'greeting card maker',
  'open docx online', 'chat with pdf ai', 'in-browser document editor', 'no upload pdf editor',
].join(', ');

export function Landing() {
  const lang = useLang();
  const changeLang = (code: Lang) => setLang(code);
  return (
    <main className="lp">
      <TkxSEO
        title="Pyntra — Free Online PDF, Document & Media Studio · 100% in your browser"
        description="Edit PDFs and documents, compress images/PDFs/video, convert HEIC→JPG, scan documents, record your screen, trim video & make GIFs, and design invitations & greeting cards — 100% in your browser. No upload, no account, no watermark."
        canonical={`${SITE}/`}
        keywords={SEO_KEYWORDS}
        ogType="website"
        locale="en_US"
        robots="index, follow, max-image-preview:large, max-snippet:-1"
        image={`${SITE}/og-image.png`}
        schema={[
          seoSchema.softwareApplication({
            name: 'Pyntra',
            description: 'Free, private, in-browser PDF, document & media studio. Edit PDFs and Word/Markdown documents; compress images, PDFs and video; convert HEIC→JPG; scan documents; record the screen; trim video and make GIFs; design invitations and greeting cards; OCR, redact, sign and use AI — all client-side.',
            url: `${SITE}/`,
            license: 'Proprietary',
            price: '0',
            currency: 'USD',
          }),
          seoSchema.faqPage(FAQ.map((f) => ({ question: f.title, answer: f.content }))),
          seoSchema.breadcrumbList([
            { name: 'Home', url: `${SITE}/` },
            { name: 'Documentation', url: `${SITE}/docs` },
            { name: 'Editor', url: `${SITE}/app` },
          ]),
        ]}
      />
      <header className="lp-nav">
        <span className="lp-brand">Pyntra</span>
        <nav className="lp-nav-links">
          <select className="lp-lang" aria-label={t('lang_label', lang)} value={lang} onChange={(e) => changeLang(e.target.value as Lang)}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.native}</option>)}
          </select>
          <a href={DOCS_URL}>Docs</a>
          <TkxButton variant="ghost" size="sm" colorScheme="primary" onClick={openApp}>Open the editor</TkxButton>
        </nav>
      </header>

      <section className="lp-hero">
        <TkxBadge variant="success" size="md" dot>100% in your browser · no upload</TkxBadge>
        <h1>{t('brand_tagline', lang)}</h1>
        {lang === 'en'
          ? (
            <p className="lp-sub">
              Edit PDFs and documents, <strong>compress images, PDFs &amp; video</strong>, convert <strong>HEIC→JPG</strong>,
              scan documents, record your screen, trim clips &amp; make GIFs, and design <strong>invitations &amp; greeting cards</strong> —
              all <strong>100% in your browser.</strong> No account, no upload, no watermark — your files never leave your device.
            </p>
          )
          : <p className="lp-sub">{t('hero_sub', lang)}</p>}
        <div className="lp-hero-actions">
          <TkxButton size="lg" colorScheme="primary" glow onClick={openApp}>{t('cta_primary', lang)}</TkxButton>
          <TkxButton variant="link" size="lg" colorScheme="primary" onClick={() => (window.location.href = DOCS_URL)}>{t('cta_docs', lang)} →</TkxButton>
        </div>
        <p className="lp-trust">🔒 Your documents stay on your device · GDPR &amp; HIPAA-friendly by architecture · open-source-friendly</p>
        <a className="lp-seo-link" href={APP_URL}>Open the Pyntra online PDF editor</a>
      </section>

      <section className="lp-showcase" aria-label="Everything in one place">
        <img
          className="lp-showcase-card"
          src="/pyntra-promo.svg"
          width={1280}
          height={720}
          loading="lazy"
          alt="Pyntra feature tour — edit any PDF like Word, open Word documents natively, design studio, image editor with background remover, OCR, QR codes and true redaction, real-time collaboration; 100% private, installable and free."
        />
        <aside className="lp-showcase-qr">
          <img src="/qr-app.png" width={132} height={132} loading="lazy" alt="QR code that opens pyntra.tekivex.com" />
          <div className="lp-showcase-qr-text">
            <strong>Open it on your phone</strong>
            <span>Scan to launch Pyntra at <code>pyntra.tekivex.com</code> — nothing to install, works on any device.</span>
          </div>
        </aside>
      </section>

      <FeatureTour />

      <section className="lp-features" aria-label="Features">
        <TkxRow gutter={[16, 16]} align="stretch">
          {FEATURES.map((f) => (
            <TkxCol key={f.title} span={24} sm={12} lg={8}>
              <TkxCard as="article" variant="elevated" isHoverable padding="lg" data-kw={f.kw}>
                <TkxCardBody>
                  <div className="lp-card-icon" aria-hidden>{f.icon}</div>
                  <h2>{f.title}</h2>
                  <p>{f.body}</p>
                </TkxCardBody>
              </TkxCard>
            </TkxCol>
          ))}
        </TkxRow>
      </section>

      <section className="lp-formats" aria-label="Supported formats">
        <h2>Open and convert almost anything</h2>
        <TkxRow gutter={[16, 16]} align="stretch">
          <TkxCol span={24} md={12}>
            <TkxCard variant="glass" padding="lg">
              <TkxCardBody>
                <h3>📥 Open these → edit as PDF</h3>
                <p>{OPEN_FORMATS}</p>
              </TkxCardBody>
            </TkxCard>
          </TkxCol>
          <TkxCol span={24} md={12}>
            <TkxCard variant="glass" padding="lg">
              <TkxCardBody>
                <h3>📤 Export your PDF to</h3>
                <p>{EXPORT_FORMATS}</p>
              </TkxCardBody>
            </TkxCard>
          </TkxCol>
        </TkxRow>
        <p className="lp-formats-note">Word keeps run formatting, tables and images. All conversion runs locally.</p>
      </section>

      <section className="lp-steps" aria-label="How it works">
        <h2>How it works</h2>
        <TkxRow gutter={[16, 16]} align="stretch">
          {STEPS.map((s) => (
            <TkxCol key={s.n} span={24} md={8}>
              <TkxCard variant="elevated" padding="lg">
                <TkxCardBody>
                  <div className="lp-step-n" aria-hidden>{s.n}</div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </TkxCardBody>
              </TkxCard>
            </TkxCol>
          ))}
        </TkxRow>
      </section>

      <section className="lp-why">
        <h2>Why Pyntra is different</h2>
        <TkxRow gutter={[16, 16]} align="stretch">
          {WHY.map((w) => (
            <TkxCol key={w.title} span={24} sm={12} lg={8}>
              <TkxCard variant="glass" padding="md">
                <TkxCardBody>
                  <h3>{w.title}</h3>
                  <p>{w.body}</p>
                </TkxCardBody>
              </TkxCard>
            </TkxCol>
          ))}
        </TkxRow>
        <div className="lp-hero-actions">
          <TkxButton size="lg" colorScheme="primary" glow onClick={openApp}>Open the editor</TkxButton>
        </div>
      </section>

      <section className="lp-enterprise">
        <TkxCard variant="elevated" padding="lg">
          <TkxCardBody>
            <TkxBadge variant="primary" size="sm">For teams &amp; enterprises</TkxBadge>
            <h2>Embeddable, composable, and compliant</h2>
            <p>
              Pyntra is a set of npm packages with a headless React core and a 9-method UI-adapter
              contract, so it drops into your design system (HTML, MUI, Tekivex adapters included). Because
              everything runs client-side, there’s <strong>no data processor, no DPA, and no BAA</strong> to
              negotiate. Self-host the worker and assets for air-gapped deployments, or vendor the built
              packages with <strong>no registry access</strong> required.
            </p>
            <div className="lp-hero-actions">
              <TkxButton variant="outline" size="md" colorScheme="primary" onClick={() => (window.location.href = DOCS_URL)}>Integration guide</TkxButton>
            </div>
          </TkxCardBody>
        </TkxCard>
      </section>

      <section className="lp-faq">
        <h2>Frequently asked questions</h2>
        <TkxAccordion items={FAQ} variant="separated" iconStyle="plus" />
      </section>

      <footer className="lp-footer">
        <a href={APP_URL}>Open editor</a>
        <a href={DOCS_URL}>Documentation</a>
        <a href="/llms.txt">llms.txt</a>
        <a href="/.well-known/ai-plugin.json">AI plugin</a>
        <span>© {new Date().getFullYear()} Pyntra · Free, private, in-browser PDF editor &amp; document converter</span>
      </footer>
    </main>
  );
}
