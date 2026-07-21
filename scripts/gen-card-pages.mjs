/**
 * Per-occasion card landing pages.
 *
 * Generates one static, crawlable HTML page per occasion at /cards/<slug>
 * (plus a /cards index), so a search for "birthday cards", "wedding invitation
 * templates", "diwali greeting card", etc. can land on a focused, keyword-rich
 * page that deep-links straight into the gallery pre-filtered to that occasion
 * (/app/?cards=<slug>). This is the multi-page navigation layer that gives the
 * app real, indexable URLs (better SEO and ad inventory) on top of the single
 * in-app Cards gallery — the gallery itself is unchanged.
 *
 * The <slug> here MUST match occasionSlug() in cardCatalog.ts so the CTA links
 * resolve to the right occasion tab in the app.
 *
 * Pure content + a template; called from build-site.mjs with the dist dir.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ORIGIN = 'https://pyntra.tekivex.com';

/** @typedef {{slug:string,occasion:string,emoji:string,title:string,h1:string,tagline:string,description:string,keywords:string,intro:string,examples:string[]}} Occasion */

/** The occasions surfaced as home deep-link chips — each a focused landing page.
 *  `occasion` is the exact gallery tab; `slug` matches occasionSlug(occasion). */
export const CARD_OCCASION_PAGES = [
  {
    slug: 'animated', occasion: 'Animated', emoji: '✨',
    title: 'Animated Greeting Cards — free video wishes you can personalise',
    h1: 'Animated cards', tagline: 'Moving greeting cards with music you can send in seconds.',
    description: 'Free animated greeting cards: birthday, anniversary, festival and everyday wishes that animate with music. Add a name and message and share a video card on WhatsApp or Instagram — made in your browser, no watermark.',
    keywords: 'animated greeting card, video wish maker, birthday video card, animated card with name, whatsapp greeting video, moving greeting card free',
    intro: 'Send a card that moves. Every animated design plays a short, musical greeting you can personalise with a name and message, then share as a video.',
    examples: ['Confetti pop', 'Floating hearts', 'Diya glow', 'Fireworks night'],
  },
  {
    slug: 'birthday', occasion: 'Birthday', emoji: '🎂',
    title: 'Birthday Cards & Invitations — free, editable, no watermark',
    h1: 'Birthday cards', tagline: 'Illustrated birthday cards and party invitations for everyone.',
    description: 'Free birthday cards and invitations: balloons, watercolor florals, photo cards, funny quote cards and party invites. Personalise every word, colour and photo and share as an image, PDF or animated video — all in your browser.',
    keywords: 'birthday card maker, free birthday invitation, birthday card with name, funny birthday card, birthday photo card, happy birthday card online',
    intro: 'A birthday card for every personality — sweet, funny, elegant or photo-first. Tap any card to make it yours, add a photo, and send it as an image, PDF or animated wish.',
    examples: ['Pink Cheer', 'Happy Balloons', 'Polaroid', 'Older & Awesome', 'Hoppy Frog', 'Birthday Hearts'],
  },
  {
    slug: 'wedding', occasion: 'Wedding', emoji: '💍',
    title: 'Wedding Invitations — free, elegant, editable templates',
    h1: 'Wedding invitations', tagline: 'Elegant wedding, engagement and shower invitations.',
    description: 'Free wedding invitation templates: elegant, boho and modern designs plus engagement, haldi, mehndi, sangeet and bridal-shower invites. Edit every detail in any language and share — made privately in your browser.',
    keywords: 'wedding invitation maker, free wedding invite template, engagement invitation, haldi mehndi invitation, bridal shower invite, save the date maker',
    intro: 'From save-the-dates to the big day — elegant and modern suites you can edit in any language, plus every pre-wedding celebration.',
    examples: ['Elegant Wedding', 'Boho Arch Wedding', 'Haldi / Mehndi', 'Sangeet Night', 'Engagement'],
  },
  {
    slug: 'anniversary', occasion: 'Anniversary', emoji: '💞',
    title: 'Anniversary Cards — free, romantic, personalised',
    h1: 'Anniversary cards', tagline: 'Romantic anniversary cards to celebrate the years.',
    description: 'Free anniversary cards: romantic and elegant designs to celebrate a wedding anniversary or a special milestone. Personalise the names, message and photo and share as an image or animated video.',
    keywords: 'anniversary card maker, happy anniversary card, wedding anniversary card free, anniversary card with photo, anniversary wish video',
    intro: 'Mark the milestone. Warm, romantic designs you can personalise with names, a message and a favourite photo.',
    examples: ['Happy Anniversary', 'Floating hearts', 'Golden years'],
  },
  {
    slug: 'baby', occasion: 'Baby', emoji: '🍼',
    title: 'Baby Shower & New Baby Cards — free invitation templates',
    h1: 'Baby cards', tagline: 'Baby shower invitations and new-baby announcements.',
    description: 'Free baby shower invitations and new-baby announcement cards: gender reveal, naming ceremony and welcome-baby designs. Edit the details and share — made in your browser, no watermark.',
    keywords: 'baby shower invitation maker, gender reveal invitation, new baby announcement card, naming ceremony invite, welcome baby card free',
    intro: 'Sweet, gentle designs for every step — showers, gender reveals, naming ceremonies and welcoming the new arrival.',
    examples: ['Baby Shower', 'Gender Reveal', 'Naming Ceremony', 'Welcome Baby'],
  },
  {
    slug: 'love', occasion: 'Love', emoji: '❤️',
    title: 'Love & Valentine Cards — free, romantic, editable',
    h1: 'Love cards', tagline: 'Valentine, love-you and miss-you cards.',
    description: "Free love and Valentine's Day cards: romantic designs to say I love you, I miss you or I'm sorry. Personalise the message and photo and share as an image or animated video — all in your browser.",
    keywords: 'valentine card maker, i love you card, romantic card free, miss you card, love card with photo, valentines day card online',
    intro: 'Say it with something made just for them — romantic designs for Valentine’s Day and every day.',
    examples: ["Valentine's Day", 'Love You', 'I Miss You'],
  },
  {
    slug: 'thank-you', occasion: 'Thank You', emoji: '💐',
    title: 'Thank You Cards — free, printable, personalised',
    h1: 'Thank you cards', tagline: 'Warm thank-you cards for every kind of thanks.',
    description: 'Free thank-you cards: botanical, bold and photo designs to say thank you for a gift, help or a celebration. Edit the message and share as an image or PDF — made in your browser.',
    keywords: 'thank you card maker, free printable thank you card, thank you card online, thank you card with photo, thank you note template',
    intro: 'A little gratitude goes a long way — clean, warm designs you can send digitally or print.',
    examples: ['Thank You · Botanical', 'Thank You · Bold', 'With gratitude'],
  },
  {
    slug: 'congratulations', occasion: 'Congratulations', emoji: '🎊',
    title: 'Congratulations Cards — graduation, new job, new home & more',
    h1: 'Congratulations cards', tagline: 'Celebrate graduations, new jobs, new homes and wins.',
    description: 'Free congratulations cards: graduation, new job, new home, promotion, retirement and good-luck designs. Personalise the message and share as an image or animated video — all in your browser.',
    keywords: 'congratulations card maker, graduation card free, new job card, new home card, good luck card, retirement card online',
    intro: 'Cheer them on — bright, celebratory designs for every kind of big news and milestone.',
    examples: ['Congratulations!', 'New Job', 'New Home', "You've Got This", 'Farewell & Good Luck'],
  },
  {
    slug: 'get-well', occasion: 'Get Well', emoji: '🌻',
    title: 'Get Well Soon Cards — free, cheerful, personalised',
    h1: 'Get well cards', tagline: 'Cheerful get-well and thinking-of-you cards.',
    description: 'Free get-well-soon and thinking-of-you cards: warm, cheerful designs to brighten someone’s day. Personalise the message and share as an image or animated video — made in your browser.',
    keywords: 'get well soon card, free get well card, thinking of you card, feel better card, get well card with photo',
    intro: 'Brighten a tough day with a warm, cheerful note that says you’re thinking of them.',
    examples: ['Get Well Soon', 'Thinking of You', 'Sunny wishes'],
  },
  {
    slug: 'festivals', occasion: 'Festivals', emoji: '🪔',
    title: 'Festival Cards — Diwali, Eid, Holi, Christmas & more (free)',
    h1: 'Festival cards', tagline: 'Greeting cards for every festival and holiday.',
    description: 'Free festival greeting cards: Diwali, Eid, Holi, Raksha Bandhan, Navratri, Ganesh Chaturthi, Pongal, Christmas and more. Edit the wish in any language and share as an image or animated video — made in your browser.',
    keywords: 'diwali card maker, eid mubarak card, holi card, raksha bandhan card, festival greeting card free, happy diwali card with name',
    intro: 'Celebrate every festival with a card that fits — write the wish in any language and share it as an image or animated greeting.',
    examples: ['Happy Diwali', 'Eid Mubarak', 'Happy Holi', 'Raksha Bandhan', 'Merry Christmas'],
  },
  {
    slug: 'seasonal', occasion: 'Seasonal', emoji: '🎄',
    title: 'Seasonal Cards — New Year, Christmas, Mother’s & Father’s Day',
    h1: 'Seasonal cards', tagline: 'Cards for New Year, holidays and special days.',
    description: 'Free seasonal cards: New Year, Christmas, Halloween, Thanksgiving, Easter, Mother’s Day and Father’s Day. Personalise and share as an image or animated video — made in your browser, no watermark.',
    keywords: 'new year card maker, christmas card free, mothers day card, fathers day card, halloween card, thanksgiving card online',
    intro: 'Mark the season with a design made for the moment — from New Year to the holidays and every special day between.',
    examples: ['Happy New Year', 'Merry Christmas', "Mother's Day", "Father's Day", 'Happy Easter'],
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
a{color:#2e5bff}ul{padding-left:20px}.grid{display:grid;gap:14px;grid-template-columns:1fr}@media(min-width:560px){.grid{grid-template-columns:1fr 1fr}}
.card{border:1px solid #e2e8f033;border-radius:12px;padding:14px 16px;background:#fff}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}
.chips a{display:inline-block;padding:7px 14px;border:1px solid #e2e8f0;border-radius:999px;text-decoration:none;color:#334155;font-weight:600;font-size:14px}
footer{border-top:1px solid #e2e8f033;margin-top:40px;padding-top:18px;color:#64748b;font-size:14px}footer a{color:inherit;margin-right:14px}
.crumbs{font-size:13px;color:#64748b;margin-top:14px}.crumbs a{color:#64748b}`;

const NAV = `<header><nav>
  <a class="brand" href="/welcome">Pyntra</a>
  <a href="/app/">Open app</a>
  <a href="/cards">All cards</a>
  <a href="/tools">Tools</a>
  <a href="/about">About</a>
</nav></header>`;

const FOOT = `<footer>
  <a href="/welcome">Home</a><a href="/cards">All cards</a><a href="/tools">Tools</a>
  <a href="/about">About</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a>
  <div style="margin-top:8px">© 2026 Pyntra · Private, in your browser · Your files never leave your device.</div>
</footer>`;

const chipRow = () => `<div class="chips">${CARD_OCCASION_PAGES.map((o) => `<a href="/cards/${o.slug}">${o.emoji} ${esc(o.occasion)}</a>`).join('')}</div>`;

/** @param {Occasion} o */
function occasionPage(o) {
  const url = `${ORIGIN}/cards/${o.slug}`;
  const app = `/app/?cards=${o.slug}`;
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage', name: `${o.h1} — Pyntra`, url, description: o.description,
      },
      {
        '@type': 'ItemList', name: `${o.h1}`,
        itemListElement: o.examples.map((name, i) => ({ '@type': 'ListItem', position: i + 1, name })),
      },
      {
        '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Cards', item: `${ORIGIN}/cards` },
          { '@type': 'ListItem', position: 2, name: o.h1, item: url },
        ],
      },
    ],
  };
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}"/>
<meta name="keywords" content="${esc(o.keywords)}"/>
<link rel="canonical" href="${url}"/>
<meta name="robots" content="index, follow, max-image-preview:large"/>
<meta name="theme-color" content="#2e5bff"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="Pyntra"/>
<meta property="og:title" content="${esc(o.title)}"/>
<meta property="og:description" content="${esc(o.description)}"/>
<meta property="og:url" content="${url}"/>
<meta property="og:image" content="${ORIGIN}/og-image.png"/>
<meta name="twitter:card" content="summary_large_image"/>
<style>${STYLE}</style>
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
</head><body><div class="wrap">
${NAV}
<p class="crumbs"><a href="/cards">Cards</a> › ${esc(o.h1)}</p>
<h1>${o.emoji} ${esc(o.h1)}</h1>
<p class="tagline">${esc(o.tagline)}</p>
<a class="cta" href="${app}">Browse ${esc(o.h1)} in Pyntra — it's free →</a>
<p>${esc(o.intro)}</p>
<h2>Popular ${esc(o.occasion.toLowerCase())} designs</h2>
<ul>${o.examples.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
<h2>How it works</h2>
<ol>
  <li>Open the ${esc(o.h1.toLowerCase())} gallery and pick a design.</li>
  <li>Tap any text, colour or photo to make it yours — in any language.</li>
  <li>Download a print-ready image or PDF, or animate it to a video and share.</li>
</ol>
<h2>Browse another occasion</h2>
${chipRow()}
<p style="margin-top:26px"><a class="cta" href="${app}">Open ${esc(o.h1)} — it's free →</a></p>
${FOOT}
</div></body></html>`;
}

function indexPage() {
  const url = `${ORIGIN}/cards`;
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'ItemList', name: 'Pyntra cards by occasion',
    itemListElement: CARD_OCCASION_PAGES.map((o, i) => ({ '@type': 'ListItem', position: i + 1, name: o.h1, url: `${ORIGIN}/cards/${o.slug}` })),
  };
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Cards for every occasion — free greeting cards & invitations | Pyntra</title>
<meta name="description" content="Browse free, editable greeting cards and invitations by occasion: birthday, wedding, anniversary, baby, love, thank you, congratulations, get well, festivals and seasonal. Personalise and share — made in your browser."/>
<link rel="canonical" href="${url}"/>
<meta name="robots" content="index, follow, max-image-preview:large"/>
<meta name="theme-color" content="#2e5bff"/>
<meta property="og:title" content="Cards for every occasion — Pyntra"/>
<meta property="og:description" content="Free, editable greeting cards and invitations for every occasion."/>
<meta property="og:url" content="${url}"/>
<style>${STYLE}</style>
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
</head><body><div class="wrap">
${NAV}
<h1>Cards for every occasion</h1>
<p class="tagline">Free, editable greeting cards and invitations — one gallery, every occasion. Personalise every word, colour and photo, then share as an image, PDF or animated video.</p>
<a class="cta" href="/app/?cards=all">Open the card gallery — it's free →</a>
<h2>Browse by occasion</h2>
<div class="grid">${CARD_OCCASION_PAGES.map((o) => `<a class="card" style="text-decoration:none;color:inherit;display:block" href="/cards/${o.slug}"><h3>${o.emoji} ${esc(o.h1)}</h3><p style="color:#64748b;margin:2px 0 0">${esc(o.tagline)}</p></a>`).join('')}</div>
<p style="margin-top:26px"><a class="cta" href="/app/?cards=all">Open Pyntra — it's free →</a></p>
${FOOT}
</div></body></html>`;
}

/** Write /cards/index.html + /cards/<slug>.html into the given dist directory.
 *  Returns the list of generated paths (for logging / sitemap). */
export function generateCardPages(distDir) {
  const dir = resolve(distDir, 'cards');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'index.html'), indexPage());
  for (const o of CARD_OCCASION_PAGES) writeFileSync(resolve(dir, `${o.slug}.html`), occasionPage(o));
  return ['/cards', ...CARD_OCCASION_PAGES.map((o) => `/cards/${o.slug}`)];
}
