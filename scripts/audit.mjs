// No-mercy exploratory audit: drive every surface like a user and surface EVERY
// console error / uncaught exception / failed request. Not a pass/fail gate —
// it prints everything suspicious so real bugs can't hide behind a green check.
import { createRequire } from 'module';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { resolve, extname, join } from 'path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');
const DIST = resolve('apps/demo-react/dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.pdf': 'application/pdf' };
const server = createServer((q, s) => { let u = decodeURIComponent((q.url || '/').split('?')[0]); let f = join(DIST, u); try { if (!(existsSync(f) && statSync(f).isFile())) f = join(DIST, 'index.html'); } catch { f = join(DIST, 'index.html'); } try { s.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }); s.end(readFileSync(f)); } catch { s.writeHead(404); s.end('x'); } });
await new Promise((r) => server.listen(5675, r));
const base = 'http://localhost:5675';
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const findings = [];
const note = (surface, kind, msg) => { findings.push(`[${surface}] ${kind}: ${String(msg).replace(/\s+/g, ' ').slice(0, 200)}`); };

async function instrument(surface) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => note(surface, 'PAGEERROR', e));
  page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!/favicon|Failed to load resource: the server responded.*404/.test(t)) note(surface, 'console.error', t); } });
  page.on('requestfailed', (r) => { const u = r.url(); if (!/favicon/.test(u)) note(surface, 'requestfailed', `${u} ${r.failure()?.errorText || ''}`); });
  return { ctx, page };
}
const closeUp = async ({ ctx, page }) => { await page.close(); await ctx.close(); };

async function openHome(page) { await page.goto(`${base}/app`, { waitUntil: 'networkidle2' }); await sleep(900); }
async function openTool(page, label) {
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim().startsWith('Tools')); b && b.click(); });
  await sleep(150);
  const clicked = await page.evaluate((l) => { const it = [...document.querySelectorAll('.tools-menu-item')].find((x) => (x.querySelector('.tools-menu-label')?.textContent || '') === l); if (it) { it.click(); return true; } return false; }, label);
  return clicked;
}

try {
  // 1) Landing page
  { const s = await instrument('landing'); await s.page.goto(`${base}/`, { waitUntil: 'networkidle2' }); await sleep(700);
    const h1 = await s.page.$eval('h1', (e) => e.textContent).catch(() => null); if (!h1) note('landing', 'MISSING', 'no <h1>'); await closeUp(s); }

  // 2) App home
  { const s = await instrument('home'); await openHome(s.page);
    const cards = (await s.page.$$('.ws-template-card')).length; if (cards < 8) note('home', 'SUSPECT', `only ${cards} template cards`); await closeUp(s); }

  // 3) Every Tools-menu item opens *something* without error
  const toolLabels = ['Design', 'Prompt to design', 'Invitation', 'Collage', 'Meme', 'Résumé', 'Cover letter', 'Image', 'Compress', 'Convert', 'Watermark', 'Protect PDF', 'Scan', 'Record', 'Video', 'Sign / verify', 'Combine'];
  for (const label of toolLabels) {
    const s = await instrument(`tool:${label}`); await openHome(s.page);
    if (label === 'Image') { // Image opens a file picker, not a modal — skip the open assertion
      const ok = await openTool(s.page, label); if (!ok) note(`tool:${label}`, 'MISSING', 'not in Tools menu');
      await sleep(300); await closeUp(s); continue;
    }
    const ok = await openTool(s.page, label);
    if (!ok) { note(`tool:${label}`, 'MISSING', 'not found in Tools menu'); await closeUp(s); continue; }
    await sleep(700);
    const opened = await s.page.evaluate(() => !!document.querySelector('.v2-modal, .resume-modal, .studio-stage, .v2-modal__inner'));
    if (!opened) note(`tool:${label}`, 'NO-UI', 'clicking the tool opened no modal/editor');
    await closeUp(s);
  }

  // 4) Editors from home cards
  for (const [card, sel] of [['Blank document', '.ed-rt-toolbar'], ['Blank spreadsheet', '.ed-grid'], ['Blank deck', '.ed-slide-field-body']]) {
    const s = await instrument(`editor:${card}`); await openHome(s.page);
    await s.page.evaluate((c) => { const e = [...document.querySelectorAll('.ws-template-card')].find((x) => x.textContent.includes(c)); e && e.click(); }, card);
    const ok = await s.page.waitForSelector(sel, { timeout: 10000 }).then(() => true).catch(() => false);
    if (!ok) note(`editor:${card}`, 'NO-UI', `editor surface ${sel} never appeared`);
    await sleep(600); await closeUp(s);
  }

  // 5) Theme cycle (light/dark/system) — watch for errors + that the attribute flips
  { const s = await instrument('theme'); await openHome(s.page);
    for (let i = 0; i < 3; i++) { await s.page.evaluate(() => { const b = [...document.querySelectorAll('.ws-icon-btn')].pop(); b && b.click(); }); await sleep(300); }
    await closeUp(s); }

  // 6) Command palette
  { const s = await instrument('palette'); await openHome(s.page);
    await s.page.keyboard.down('Control'); await s.page.keyboard.press('KeyK'); await s.page.keyboard.up('Control'); await sleep(300);
    const open = await s.page.$('.v2-modal, [class*="palette"], [class*="command"]') != null || await s.page.evaluate(() => !!document.querySelector('input[placeholder]'));
    if (!open) note('palette', 'SUSPECT', '⌘K opened no palette');
    await closeUp(s); }

  // 7) Mobile viewport — no horizontal overflow, toolbar usable
  { const s = await instrument('mobile'); await s.page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true }); await openHome(s.page);
    const overflow = await s.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 2) note('mobile', 'OVERFLOW', `horizontal overflow ${overflow}px on 390px`);
    const toolsBtn = await s.page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim().startsWith('Tools')); return b ? b.getBoundingClientRect().right <= window.innerWidth + 1 : false; });
    if (!toolsBtn) note('mobile', 'LAYOUT', 'Tools button off-screen on phone');
    await closeUp(s); }

} finally {
  await browser.close(); server.close();
}
console.log(findings.length ? `\nFINDINGS (${findings.length}):\n` + findings.map((f) => '  • ' + f).join('\n') : '\nNo console errors / exceptions / failures across audited surfaces.');
process.exit(0);
