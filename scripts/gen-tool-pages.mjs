/**
 * Per-tool SEO landing pages.
 *
 * Generates one static, self-contained HTML page per tool at /tools/<slug>
 * (plus a /tools index), so that a search for a specific tool — "reel maker",
 * "birthday video maker", "photo background remover", "pdf editor" — can land on
 * a focused, keyword-rich page that funnels into the app. Each page ships unique
 * title/description/keywords, a canonical URL, Open Graph tags, and
 * SoftwareApplication + HowTo + BreadcrumbList JSON-LD so Google and AI answer
 * engines can recommend Pyntra for that exact task.
 *
 * Pure content + a template; called from build-site.mjs with the dist dir.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ORIGIN = 'https://pyntra.tekivex.com';

/** @typedef {{slug:string,title:string,h1:string,tagline:string,description:string,keywords:string,emoji:string,intro:string,features:string[],steps:string[],faqs:[string,string][]}} Tool */

/** The tool catalog — the 9 home tools, each as a focused landing page. */
export const TOOLS = [
  {
    slug: 'reel-maker', emoji: '🎬', title: 'Free Reel Maker — edit video for Instagram Reels & YouTube Shorts',
    h1: 'Reel maker', tagline: 'Upload a video and turn it into a scroll-stopping reel — free, no watermark, in your browser.',
    description: 'Free online reel maker: upload and edit your video, trim and join clips, add music, captions and transitions, and export a 9:16 reel for Instagram, YouTube Shorts and WhatsApp status. No watermark, no upload — everything runs in your browser.',
    keywords: 'reel maker, video editor online free no watermark, instagram reel maker, youtube shorts maker, trim video, join video clips, add music to video, add captions to video, 9:16 video editor',
    intro: 'Make reels people actually watch. Trim the boring bits, join your best clips, drop in music and captions, and export a vertical reel ready for Instagram, YouTube Shorts or WhatsApp status — with no watermark and nothing uploaded to a server.',
    features: [
      'Trim, split and join multiple clips into one reel',
      'Add background music and control per-clip volume',
      'Auto-fit captions and timed text overlays',
      'Crossfade transitions and per-clip speed (slow/fast motion)',
      'Export vertical 9:16 at up to 1080p — no watermark',
      '100% in your browser: your footage never leaves your device',
    ],
    steps: ['Open the reel maker and upload your video.', 'Trim clips, add music, captions and transitions.', 'Preview, then export your 9:16 reel and share it.'],
    faqs: [
      ['Is this reel maker really free with no watermark?', 'Yes. Pyntra exports your reel with no watermark and no account, entirely in your browser.'],
      ['Do my videos get uploaded?', 'No. Editing happens locally on your device — your footage is never uploaded to a server.'],
    ],
  },
  {
    slug: 'text-to-video', emoji: '✍️', title: 'Text to Video — turn a script into a captioned reel (free)',
    h1: 'Text to video', tagline: 'Type a script and get a captioned video — no camera or footage needed.',
    description: 'Free text-to-video maker: type a script and each line becomes a captioned scene with music and animation. Optional AI drafting writes the script for you. Great for faceless reels, tips and quotes — all in your browser.',
    keywords: 'text to video, script to video, captioned video maker, faceless reel maker, ai script writer, text video maker free, quote video maker',
    intro: 'No camera? No problem. Type what you want to say and Pyntra turns each line into a captioned scene with music and motion — perfect for faceless reels, tips lists and quotes. Let AI draft the script from a topic, or write your own.',
    features: [
      'Each line becomes a styled, auto-captioned scene',
      'Optional AI script writing from a topic (English, Hindi, Hinglish and more)',
      '"Auto — match my words" backgrounds that fit the message',
      'Built-in music and record-your-own voice-over',
      'Export a shareable vertical video — no watermark',
    ],
    steps: ['Type your script (one thought per line) or let AI draft it from a topic.', 'Pick a style and add music or a voice-over.', 'Export your captioned reel.'],
    faqs: [
      ['Can AI write the script for me?', 'Yes — type a topic and the optional AI writer drafts caption lines you can edit, in several languages.'],
      ['Do I need footage?', 'No. Text-to-video generates the scenes from your words, so no camera or clips are required.'],
    ],
  },
  {
    slug: 'animated-wish', emoji: '🎁', title: 'Animated Wishes — birthday & festival greeting video maker (free)',
    h1: 'Animated wish maker', tagline: 'Birthday, anniversary and festival greeting videos in seconds.',
    description: 'Free animated wish maker: create birthday, anniversary and festival greeting videos with a name and message, animation and music. Share on WhatsApp and Instagram — made in your browser, no upload.',
    keywords: 'birthday video maker with name, animated birthday wish, anniversary video maker, festival greeting video, whatsapp wish video maker, happy birthday video with name and song',
    intro: 'Send a wish that moves. Pick an occasion, add a name and a heartfelt message, and Pyntra animates a greeting video with music you can share on WhatsApp or Instagram in seconds.',
    features: [
      'Birthday, anniversary, love and festival occasions',
      'Personalise with a name, message and optional photo',
      'Animated scenes with music and a voice-over option',
      'Perfect square/vertical sizes for WhatsApp and Instagram',
      'Free, no watermark, nothing uploaded',
    ],
    steps: ['Choose an occasion (birthday, anniversary, festival…).', 'Type the recipient’s name and your message.', 'Export and share the animated wish video.'],
    faqs: [
      ['Can I add a name to the birthday video?', 'Yes — add the recipient’s name and a personal message, and optionally a photo.'],
      ['Which festivals are supported?', 'Diwali, Eid, Holi, Christmas, Raksha Bandhan, Navratri and many more, plus everyday wishes.'],
    ],
  },
  {
    slug: 'memory-video', emoji: '💝', title: 'Memory Video Maker — photos to video with music (free)',
    h1: 'Memory video maker', tagline: 'Turn your photos into a beautiful video slideshow with music.',
    description: 'Free memory video maker: turn your photos into a video slideshow with music, frames, captions and Ken-Burns motion. Great for birthdays, weddings and anniversaries — made privately in your browser.',
    keywords: 'memory video maker, photo to video with music, slideshow maker with music, wedding slideshow maker, birthday photo video maker, photo video maker free',
    intro: 'Relive the moments. Drop in your favourite photos and Pyntra builds a smooth video slideshow with music, gentle motion and captions — ideal for birthdays, weddings and anniversaries.',
    features: [
      'Add many photos at once and reorder them',
      'Photo frames (polaroid, film strip, rounded, vignette)',
      'Ken-Burns pan/zoom motion and smooth fades',
      'Add a title, per-photo captions and background music',
      'Free, private, no upload — export and share',
    ],
    steps: ['Add your photos and arrange the order.', 'Pick a frame style, motion and music; add captions.', 'Export your memory video and share it.'],
    faqs: [
      ['Can I add music to the slideshow?', 'Yes — add your own music track and adjust its volume.'],
      ['Are my photos uploaded anywhere?', 'No. The video is built on your device; your photos never leave it.'],
    ],
  },
  {
    slug: 'card-maker', emoji: '🎉', title: 'Card & Invitation Maker — birthdays, weddings & festivals (free)',
    h1: 'Card & invitation maker', tagline: 'Wishes and invitations for every occasion and festival.',
    description: 'Free card and invitation maker: birthday, wedding and anniversary invitations plus greeting cards for Diwali, Eid, Christmas, Raksha Bandhan and more. Edit every word in any language and share — made in your browser.',
    keywords: 'invitation maker, birthday invitation maker, wedding invitation maker free, greeting card maker, diwali card maker, eid mubarak card, anniversary card maker, festival greeting card',
    intro: 'A card for every occasion. Start from a designed template — birthdays, weddings, anniversaries, and every major festival — then tap any word to retype it in any language and share as an image or animation.',
    features: [
      'Birthday, wedding, anniversary and baby-shower invitations',
      'Festival cards: Diwali, Eid, Holi, Christmas, Raksha Bandhan, Navratri…',
      'Poems, shayari and respectful faith blessing cards',
      'Every element editable; type in any language',
      'Export as image or animate to a video/GIF',
    ],
    steps: ['Pick a card or invitation template.', 'Edit the text, colours and photos.', 'Download as an image or animated video and share.'],
    faqs: [
      ['Can I write the card in Hindi or another language?', 'Yes — tap any text and retype it in any language.'],
      ['Are the cards free?', 'Yes, every card and invitation is free with no watermark.'],
    ],
  },
  {
    slug: 'design-maker', emoji: '🎨', title: 'Design Maker — free poster & social media post maker',
    h1: 'Design maker', tagline: 'Posters, social posts, quotes and business cards — a free Canva alternative.',
    description: 'Free design maker and Canva alternative: create posters, social media posts, quote graphics, business cards and logos with brand kits and Magic Resize. Runs 100% in your browser, no account, no watermark.',
    keywords: 'design maker, poster maker, social media post maker, canva alternative free, quote maker, business card maker, brand kit, magic resize, instagram post maker',
    intro: 'Design anything, on brand. Start from a template or a blank canvas and make posters, social posts, quote graphics, business cards and logos — with brand kits and one-click Magic Resize to every size.',
    features: [
      'Templates for social posts, posters, quotes, cards and logos',
      'Brand kits (logo, colours, fonts) with on-brand enforcement',
      'Magic Resize: one design to every size at once',
      'Layers, custom fonts, multi-page campaigns',
      'Animate designs to GIF or video with music — free',
    ],
    steps: ['Open a template or a blank canvas in your size.', 'Add text, photos, shapes and your brand colours.', 'Download as image/PDF, or animate and share.'],
    faqs: [
      ['Is this a free Canva alternative?', 'Yes — posters, social posts, brand kits and Magic Resize are free, with no upload.'],
      ['Can I resize one design to many sizes?', 'Yes — Magic Resize turns a design into every social and print size at once.'],
    ],
  },
  {
    slug: 'photo-editor', emoji: '🖼️', title: 'Photo Editor — crop, filters & background remover (free)',
    h1: 'Photo editor', tagline: 'Crop, filter and cut out — remove or change your photo background free.',
    description: 'Free online photo editor: crop in any shape, apply filters, remove the background, erase objects with a magic eraser, and put any scenery behind a person. Runs on your device — no upload, no watermark.',
    keywords: 'photo editor, remove background from image free, change photo background, background remover, magic eraser, remove object from photo, crop image in shape, circle crop photo',
    intro: 'Edit photos privately, right in the browser. Crop to any shape, tune with filters, cut out the background on-device, erase unwanted objects, and drop any scenery behind a person — no upload, no watermark.',
    features: [
      'One-tap background removal (on-device)',
      'Put a colour or any scenery photo behind the subject',
      'Magic eraser to remove objects, blemishes and photobombers',
      'Crop into circle, star, heart, hexagon or diamond',
      'Filters, brightness/contrast and resize',
    ],
    steps: ['Open your photo in the editor.', 'Crop, filter, remove the background or erase objects.', 'Download your edited image.'],
    faqs: [
      ['Can I remove the background for free?', 'Yes — background removal runs free on your device, with no watermark.'],
      ['Can I change the background to a new scene?', 'Yes — after cutting out the subject, place any colour or scenery photo behind them.'],
    ],
  },
  {
    slug: 'pdf-word-excel-editor', emoji: '📄', title: 'Open & Edit PDF, Word, Excel, PowerPoint (free, in browser)',
    h1: 'Open & edit any file', tagline: 'Edit PDF, Word, Excel and PowerPoint — and convert between them.',
    description: 'Free in-browser editor for PDF, Word, Excel and PowerPoint: edit text in any PDF, OCR scans, fill and sign forms, truly redact, merge and convert to/from Word, Excel and more. Files never leave your device.',
    keywords: 'edit pdf online free, pdf editor, edit word online, edit excel online, edit powerpoint online, pdf to word, ocr pdf, sign pdf, fill pdf form, merge pdf, redact pdf, convert pdf',
    intro: 'Your documents, edited privately. Open a PDF, Word, Excel, PowerPoint or OpenDocument file and edit it in place — click any line of a PDF to edit the real text, OCR scans, fill and sign forms, truly redact, merge, and convert between formats.',
    features: [
      'Edit text directly in any PDF — even flat/scanned ones (OCR)',
      'Fill and create form fields; sign, stamp and highlight',
      'True redaction that physically removes text, then verifies it',
      'Merge, split, reorder, rotate and compress pages',
      'Convert PDF ⇄ Word/Excel/PowerPoint/Markdown/images',
    ],
    steps: ['Open your PDF or Office file.', 'Edit, fill, sign, redact, merge or convert.', 'Download the result — the original never leaves your device.'],
    faqs: [
      ['Can I edit a PDF that isn’t editable?', 'Yes — click any line to edit the real text; scanned PDFs can be OCR’d first.'],
      ['Are my documents uploaded?', 'No. All editing and conversion happen locally in your browser.'],
    ],
  },
  {
    slug: 'describe-it-ai-design', emoji: '✨', title: 'Describe It — AI text-to-design maker (free)',
    h1: 'Describe it', tagline: 'Type what you want and get a finished, editable design.',
    description: 'Free text-to-design maker: describe a poster or social post and get a finished, on-brand design you can edit — generated on your device, no upload.',
    keywords: 'ai design generator, text to design, prompt to design, ai poster maker, describe design, ai social media post maker',
    intro: 'From words to a design. Describe what you want — "a modern birthday poster in purple" — and Pyntra lays out a finished, editable design in your size, generated on your device.',
    features: [
      'Type a prompt and get a finished layout instantly',
      'Choose the size (Instagram post, story, poster…)',
      'Apply your brand kit automatically',
      'Everything stays editable — tweak text, colours and images',
      'Generated on-device — nothing uploaded',
    ],
    steps: ['Describe the design you want.', 'Pick a size and (optionally) your brand kit.', 'Open the result and fine-tune it, then export.'],
    faqs: [
      ['Does this use AI?', 'It turns your description into a finished layout on your device — no account or upload needed.'],
      ['Can I edit the result?', 'Yes — every element stays fully editable after it is generated.'],
    ],
  },
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STYLE = `:root{color-scheme:light dark}*{box-sizing:border-box}
body{margin:0;font:16px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1e293b;background:#f8fafc}
@media(prefers-color-scheme:dark){body{color:#e2e8f0;background:#0b1120}a{color:#7da2ff}.wrap,.card{background:#0f172a}}
.wrap{max-width:860px;margin:0 auto;padding:28px 22px 72px;background:#fff}
header nav{display:flex;gap:16px;flex-wrap:wrap;align-items:center;padding:14px 0;border-bottom:1px solid #e2e8f033}
header nav a{text-decoration:none;color:#2e5bff;font-weight:600}header .brand{font-weight:800;font-size:18px;margin-right:auto;color:inherit}
h1{font-size:34px;margin:26px 0 6px}h2{font-size:22px;margin:30px 0 8px}h3{font-size:17px;margin:18px 0 4px}
.tagline{font-size:19px;color:#475569}.cta{display:inline-block;margin:18px 0;padding:12px 22px;background:#2e5bff;color:#fff;border-radius:10px;text-decoration:none;font-weight:700}
a{color:#2e5bff}ul{padding-left:20px}.grid{display:grid;gap:14px;grid-template-columns:1fr}.card{border:1px solid #e2e8f033;border-radius:12px;padding:14px 16px;background:#fff}
footer{border-top:1px solid #e2e8f033;margin-top:40px;padding-top:18px;color:#64748b;font-size:14px}footer a{color:inherit;margin-right:14px}
.crumbs{font-size:13px;color:#64748b;margin-top:14px}.crumbs a{color:#64748b}`;

const NAV = `<header><nav>
  <a class="brand" href="/welcome">Pyntra</a>
  <a href="/app/">Open app</a>
  <a href="/tools">All tools</a>
  <a href="/about">About</a>
  <a href="/privacy">Privacy</a>
</nav></header>`;

const FOOT = `<footer>
  <a href="/welcome">Home</a><a href="/tools">All tools</a><a href="/about">About</a>
  <a href="/contact">Contact</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a>
  <div style="margin-top:8px">© 2026 Pyntra · Private, in your browser · Your files never leave your device.</div>
</footer>`;

/** @param {Tool} t */
function toolPage(t) {
  const url = `${ORIGIN}/tools/${t.slug}`;
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication', name: `Pyntra ${t.h1}`, applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Any (web browser)', url, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        description: t.description, featureList: t.features,
      },
      {
        '@type': 'HowTo', name: `How to use the Pyntra ${t.h1}`,
        step: t.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, text: s })),
      },
      {
        '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Tools', item: `${ORIGIN}/tools` },
          { '@type': 'ListItem', position: 2, name: t.h1, item: url },
        ],
      },
      t.faqs?.length ? {
        '@type': 'FAQPage', mainEntity: t.faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
      } : null,
    ].filter(Boolean),
  };
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(t.title)}</title>
<meta name="description" content="${esc(t.description)}"/>
<meta name="keywords" content="${esc(t.keywords)}"/>
<link rel="canonical" href="${url}"/>
<meta name="robots" content="index, follow, max-image-preview:large"/>
<meta name="theme-color" content="#2e5bff"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="Pyntra"/>
<meta property="og:title" content="${esc(t.title)}"/>
<meta property="og:description" content="${esc(t.description)}"/>
<meta property="og:url" content="${url}"/>
<meta property="og:image" content="${ORIGIN}/og-image.png"/>
<meta name="twitter:card" content="summary_large_image"/>
<style>${STYLE}</style>
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
</head><body><div class="wrap">
${NAV}
<p class="crumbs"><a href="/tools">Tools</a> › ${esc(t.h1)}</p>
<h1>${t.emoji} ${esc(t.h1)}</h1>
<p class="tagline">${esc(t.tagline)}</p>
<a class="cta" href="/app/">Open the ${esc(t.h1)} — it's free →</a>
<p>${esc(t.intro)}</p>
<h2>What you can do</h2>
<ul>${t.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
<h2>How to use it</h2>
<ol>${t.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
<h2>Frequently asked questions</h2>
<div class="grid">${t.faqs.map(([q, a]) => `<div class="card"><h3>${esc(q)}</h3><p>${esc(a)}</p></div>`).join('')}</div>
<p style="margin-top:26px"><a class="cta" href="/app/">Open Pyntra — it's free →</a></p>
${FOOT}
</div></body></html>`;
}

function indexPage() {
  const url = `${ORIGIN}/tools`;
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'ItemList', name: 'Pyntra tools',
    itemListElement: TOOLS.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.h1, url: `${ORIGIN}/tools/${t.slug}` })),
  };
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Pyntra tools — free video, design, photo & PDF makers in your browser</title>
<meta name="description" content="All Pyntra tools: reel maker, text-to-video, animated wishes, memory videos, card & invitation maker, design maker, photo editor, PDF/Word/Excel editor and AI design — free, private, in your browser."/>
<link rel="canonical" href="${url}"/>
<meta name="robots" content="index, follow, max-image-preview:large"/>
<meta name="theme-color" content="#2e5bff"/>
<style>${STYLE}</style>
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
</head><body><div class="wrap">
${NAV}
<h1>All Pyntra tools</h1>
<p class="tagline">Free, private tools that run 100% in your browser — your files never leave your device.</p>
<div class="grid">${TOOLS.map((t) => `<a class="card" style="text-decoration:none;color:inherit;display:block" href="/tools/${t.slug}"><h3>${t.emoji} ${esc(t.h1)}</h3><p style="color:#64748b;margin:2px 0 0">${esc(t.tagline)}</p></a>`).join('')}</div>
<p style="margin-top:26px"><a class="cta" href="/app/">Open Pyntra — it's free →</a></p>
${FOOT}
</div></body></html>`;
}

/** Write /tools/index.html + /tools/<slug>.html into the given dist directory. */
export function generateToolPages(distDir) {
  const dir = resolve(distDir, 'tools');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'index.html'), indexPage());
  for (const t of TOOLS) writeFileSync(resolve(dir, `${t.slug}.html`), toolPage(t));
  return TOOLS.map((t) => `/tools/${t.slug}`);
}
