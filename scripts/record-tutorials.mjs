/**
 * Record the in-app how-to tutorial videos by DRIVING THE REAL APP.
 *
 * For each tutorial we launch the built app in Chromium (Playwright), perform the
 * actual steps a user would (open the tool, click, type) with a big on-screen
 * caption for each step, and record the screen to a WebM. The clips are written
 * to apps/demo-react/public/tutorials/<id>.webm so the Help Center plays them.
 *
 * Run:  pnpm build && node scripts/record-tutorials.mjs [id ...]
 * (Optional ids limit which tutorials to (re)record; default = all scripted.)
 *
 * These are genuine screen recordings of the working app — not slideshows — so
 * they stay accurate as long as the flows below match the UI.
 */
import { createServer } from 'http';
import { readFileSync, existsSync, statSync, mkdirSync, renameSync, rmSync, readdirSync } from 'fs';
import { resolve, extname, join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.error('Install Playwright first: pnpm add -D -w playwright'); process.exit(2); }

const ROOT = resolve(process.argv[1], '../..');
const DIST = resolve(ROOT, 'apps/demo-react/dist');
const OUT = resolve(ROOT, 'apps/demo-react/public/tutorials');
const CHROME = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TMP = resolve(ROOT, '.tutorial-rec');
const W = 480, H = 860;              // phone-shaped: the app's primary audience
const only = process.argv.slice(2);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.mp4': 'video/mp4', '.webm': 'video/webm',
};
const server = createServer((req, res) => {
  let file = join(DIST, decodeURIComponent((req.url || '/').split('?')[0]));
  try { if (!(existsSync(file) && statSync(file).isFile())) file = join(DIST, 'index.html'); } catch { file = join(DIST, 'index.html'); }
  try { res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' }); res.end(readFileSync(file)); } catch { res.writeHead(404); res.end(); }
});

// A tiny noise PNG we can feed to the photo flows (reused from the e2e helper idea).
function noisePng() {
  const require2 = createRequire(import.meta.url);
  const { deflateSync } = require2('zlib');
  const w = 600, h = 600;
  const tbl = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = tbl[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const t = Buffer.from(type, 'ascii'); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, cr]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  let s = 0x9e3779b9 >>> 0; const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s & 0xff; };
  for (let y = 0; y < h; y++) { const row = y * (w * 3 + 1); raw[row] = 0; for (let x = 0; x < w * 3; x++) raw[row + 1 + x] = rnd(); }
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
  const p = resolve(TMP, 'sample.png'); mkdirSync(TMP, { recursive: true });
  require2('fs').writeFileSync(p, png); return p;
}

const base = 'http://localhost:5702';

// ── The scripted flows. Each `step` shows a caption, runs an action, holds. ──
function driver(page) {
  const caption = (text, n, total) => page.evaluate(({ text, n, total }) => {
    let el = document.getElementById('__tut_cap');
    if (!el) {
      el = document.createElement('div'); el.id = '__tut_cap';
      el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;padding:16px 18px 20px;background:linear-gradient(0deg,rgba(8,12,24,.92),rgba(8,12,24,.72),transparent);color:#fff;font:600 17px/1.35 Inter,system-ui,sans-serif;pointer-events:none;';
      document.body.appendChild(el);
    }
    el.innerHTML = `<div style="opacity:.7;font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px">Step ${n} of ${total}</div>${text}`;
  }, { text, n, total });
  const clearCap = () => page.evaluate(() => document.getElementById('__tut_cap')?.remove());
  return { caption, clearCap };
}

const click = async (page, sel, textRe) => page.evaluate(({ sel, textRe }) => {
  const els = [...document.querySelectorAll(sel)];
  const el = textRe ? els.find((x) => new RegExp(textRe, 'i').test(x.textContent || '')) : els[0];
  if (el) { el.click(); return true; } return false;
}, { sel, textRe: textRe?.source ?? null });

const type = (page, sel, val) => page.evaluate(({ sel, val }) => {
  let el = document.querySelector(sel);
  if (el && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') el = el.querySelector('input,textarea') || el;
  if (!el) return;
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, { sel, val });

const FLOWS = {
  welcome: {
    title: 'Welcome tour',
    steps: [
      ['Welcome to Pyntra — everything you can make lives here on the home screen.', async (p) => { await p.waitForTimeout(200); }, 3200],
      ['Switch between “Tools & designs” and your “Documents” using these tabs.', async (p) => { await click(p, '.ws-home-tab', /Documents/); await p.waitForTimeout(600); await click(p, '.ws-home-tab', /Tools/); }, 3200],
      ['Tap any card to start — cards, reels, family portraits, PDFs and more.', async (p) => { await p.evaluate(() => window.scrollTo({ top: 300, behavior: 'smooth' })); await p.waitForTimeout(700); await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); }, 3000],
      ['Your work stays on your device — nothing is uploaded. Let’s make something!', async (p) => { await p.waitForTimeout(200); }, 3000],
    ],
  },
  'make-a-card': {
    title: 'Make a greeting card',
    steps: [
      ['Tap “Make an invitation” to open the card gallery.', async (p) => { await click(p, '.ws-template-card', /Make an invitation/); await p.waitForSelector('.inv-modal', { timeout: 8000 }); }, 3000],
      ['Pick an occasion — Birthday, Diwali, Wedding, Trending and more.', async (p) => { await click(p, '.inv-cat', /Festivals|Birthday/); await p.waitForTimeout(800); }, 3200],
      ['Tap a design you like — it opens ready to personalise.', async (p) => { await click(p, '.inv-card'); await p.waitForTimeout(900); }, 3200],
      ['Change the words to your own, then share it straight to WhatsApp. Done!', async (p) => { await p.waitForTimeout(300); }, 3200],
    ],
  },
  'photo-art': {
    title: 'Photo Art',
    file: true,
    steps: [
      ['Open the “Photo Art” tool from the home screen.', async (p) => { await click(p, '.ws-template-card', /Photo Art/); await p.waitForSelector('.pa-drop', { timeout: 8000 }); }, 3000],
      ['Choose a photo from your device.', async (p, file) => { const inp = await p.$('.pa-modal input[type=file]'); await inp.setInputFiles(file); await p.waitForSelector('.pa-style', { timeout: 8000 }); }, 3000],
      ['Tap a style — sketch, cartoon, painting… the preview shows your photo.', async (p) => { await click(p, '.pa-style', /Sketch/); await p.waitForTimeout(1200); await click(p, '.pa-style', /Cartoon/); await p.waitForTimeout(1200); }, 3600],
      ['Save the picture, or share it straight to WhatsApp. Free, on your device!', async (p) => { await p.waitForTimeout(300); }, 3000],
    ],
  },
  'family-portrait': {
    title: 'Family portrait',
    steps: [
      ['Open “Family portrait” and pick an occasion theme.', async (p) => { await click(p, '.ws-template-card', /Family portrait/); await p.waitForSelector('.fam-themes', { timeout: 8000 }); await click(p, '.fam-theme', /Bollywood/); await p.waitForTimeout(500); }, 3200],
      ['Add each family member by name.', async (p) => { await type(p, '.fam-add-row input', 'Aai'); await p.waitForTimeout(400); await click(p, '.fam-add-row button', /Add/); await p.waitForTimeout(700); }, 3200],
      ['Tap “Invite family (live)” so everyone adds their own photo from their phone.', async (p) => { await p.waitForTimeout(300); }, 3400],
      ['Everyone votes ❤️ on their favourite look — then save it as the family DP.', async (p) => { await p.evaluate(() => document.querySelector('.fam-variant')?.scrollIntoView({ block: 'center' })); await p.waitForTimeout(500); await click(p, '.fam-vote'); await p.waitForTimeout(600); }, 3400],
    ],
  },
  reminders: {
    title: 'Reminders',
    steps: [
      ['Open Reminders from the home screen.', async (p) => { await click(p, '.ws-reminders-link'); await p.waitForSelector('.rem-modal', { timeout: 8000 }); }, 3000],
      ['Add birthdays, anniversaries and milestones you never want to miss.', async (p) => { await type(p, '.rem-name-row input', 'Aisha'); await p.waitForTimeout(500); }, 3200],
      ['Festivals like Diwali and Eid are already tracked for you.', async (p) => { await p.evaluate(() => document.querySelector('.rem-fest')?.scrollIntoView({ block: 'center' })); await p.waitForTimeout(700); }, 3200],
      ['Turn on notifications for a nudge the day before. A ready card greets you!', async (p) => { await p.evaluate(() => document.querySelector('.rem-guide')?.scrollIntoView({ block: 'center' })); await p.waitForTimeout(500); }, 3200],
    ],
  },
  'edit-pdf': {
    title: 'Work with PDFs',
    steps: [
      ['Pyntra has every PDF tool — combine, compress, protect, sign. Let’s compress one.', async (p) => { await p.evaluate(() => { const b = [...document.querySelectorAll('.ws-template-card')].find((x) => /Compress/i.test(x.textContent || '')); b?.scrollIntoView({ block: 'center' }); }); await p.waitForTimeout(700); }, 3400],
      ['Open “Compress files”.', async (p) => { await click(p, '.ws-template-card', /Compress/); await p.waitForSelector('.cmp-modal', { timeout: 8000 }); await p.waitForTimeout(500); }, 3200],
      ['Shrink a big PDF or photo so it’s easy to share — with almost no quality loss.', async (p) => { await p.waitForTimeout(400); }, 3400],
      ['Everything happens in your browser — your file never leaves your device.', async (p) => { await p.waitForTimeout(300); }, 3200],
    ],
  },
};

async function recordFlow(browser, id, flow, file) {
  mkdirSync(TMP, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: { dir: TMP, size: { width: W, height: H } } });
  // Suppress the app's first-run tour reliably (before any page script runs).
  await ctx.addInitScript(() => { try { localStorage.setItem('pyntra-tour-v1', '1'); } catch { /* */ } });
  const page = await ctx.newPage();
  const { caption, clearCap } = driver(page);
  await page.goto(`${base}/app`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.ws-bar', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  // Dismiss the app's own first-run tour so it doesn't cover the flow.
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Skip$/i.test((x.textContent || '').trim())); b && b.click(); }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);
  const steps = flow.steps;
  for (let i = 0; i < steps.length; i++) {
    const [text, action, hold] = steps[i];
    await caption(text, i + 1, steps.length);
    try { await action(page, file); } catch (e) { console.warn(`  step ${i + 1} note: ${String(e).slice(0, 80)}`); }
    await page.waitForTimeout(hold);
  }
  await clearCap();
  await page.waitForTimeout(400);
  await page.close();
  await ctx.close();
  // Move the produced webm to public/tutorials/<id>.webm.
  const produced = readdirSync(TMP).filter((f) => f.endsWith('.webm'));
  if (produced.length) {
    mkdirSync(OUT, { recursive: true });
    renameSync(join(TMP, produced[0]), join(OUT, `${id}.webm`));
    console.log(`  ✓ ${id}.webm`);
  } else {
    console.warn(`  ✗ no video produced for ${id}`);
  }
}

await new Promise((r) => server.listen(5702, r));
const file = noisePng();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
const ids = only.length ? only : Object.keys(FLOWS);
for (const id of ids) {
  const flow = FLOWS[id];
  if (!flow) { console.warn(`(no scripted flow for "${id}")`); continue; }
  console.log(`Recording: ${flow.title} (${id})`);
  try { await recordFlow(browser, id, flow, file); } catch (e) { console.error(`  error: ${String(e).slice(0, 160)}`); }
}
await browser.close();
server.close();
try { rmSync(TMP, { recursive: true, force: true }); } catch { /* */ }
console.log('Done.');
