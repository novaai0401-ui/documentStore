/**
 * Visual QA harness: serves the built app and screenshots the key screens in
 * light and dark via headless Chromium, so we can actually *see* the editor
 * screens (home, design studio, PDF) to verify polish. Output: /tmp/shots/*.png
 *
 * On-demand dev tool — Puppeteer is NOT a committed dependency (it downloads
 * Chromium on install, which would bloat CI). To run:
 *     pnpm dlx puppeteer-core@latest   # or: pnpm add -D puppeteer
 *     pnpm -C apps/demo-react build && node scripts/shoot.mjs
 */
import { createRequire } from 'module';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'fs';
import { resolve, extname, join } from 'path';

const require = createRequire('/home/user/editable-pdf/package.json');
const puppeteer = require('puppeteer');

const DIST = resolve('apps/demo-react/dist');
const OUT = '/tmp/shots';
mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.pdf': 'application/pdf' };

// Static server with SPA fallback: /app, /docs and everything else -> index.html.
const server = createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = join(DIST, url);
  try {
    if (existsSync(file) && statSync(file).isFile()) { /* serve file */ }
    else file = join(DIST, 'index.html');
  } catch { file = join(DIST, 'index.html'); }
  try {
    const body = readFileSync(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('nf'); }
});

await new Promise((r) => server.listen(5599, r));
const base = 'http://localhost:5599';
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });

async function shot(name, url, { theme = 'light', width = 1366, height = 900, before } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(base + url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 700));
  if (before) { try { await before(page); } catch (e) { console.log('  before() failed for', name, e.message.slice(0, 120)); } }
  if (theme === 'dark') {
    // Apply after the app's mount effect has run so it isn't overwritten.
    await page.evaluate(() => {
      try { localStorage.setItem('pyntra.theme', 'dark'); } catch {}
      document.documentElement.setAttribute('data-theme', 'dark');
      const m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', '#0b1220');
    });
  }
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });
  console.log('shot', name);
  await page.close();
}

const clickText = (sel, text) => async (page) => {
  await page.waitForSelector(sel, { timeout: 8000 });
  const ok = await page.evaluate((s, t) => {
    const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t));
    if (el) { el.click(); return true; } return false;
  }, sel, text);
  if (ok) await new Promise((r) => setTimeout(r, 1400));
};

// Home (light + dark)
await shot('home-light', '/app', { theme: 'light' });
await shot('home-dark', '/app', { theme: 'dark' });
await shot('home-mobile', '/app', { theme: 'light', width: 390, height: 844 });
// Design Studio via "Blank design"
await shot('studio-light', '/app', { theme: 'light', before: clickText('.ws-template-card', 'Blank design') });
await shot('studio-dark', '/app', { theme: 'dark', before: clickText('.ws-template-card', 'Blank design') });
// PDF editor via opening a sample PDF
const openPdf = async (page) => {
  const input = await page.$('input[type=file]');
  if (input) { await input.uploadFile(resolve('apps/demo-react/dist/sample.pdf')); await new Promise((r) => setTimeout(r, 3500)); }
};
await shot('pdf-light', '/app', { theme: 'light', before: openPdf });
await shot('pdf-dark', '/app', { theme: 'dark', before: openPdf });
// Landing + docs
await shot('landing-light', '/', { theme: 'light' });
await shot('docs-light', '/docs', { theme: 'light' });

await browser.close();
server.close();
console.log('done -> /tmp/shots');
