#!/usr/bin/env node
/**
 * Build a single deployable static site that serves the tools (the demo app)
 * at / — visitors land directly in the app — and keeps the marketing/SEO
 * landing at /welcome.
 *
 * Output layout:
 *   dist/
 *   ├── index.html              ← tools (copy of app shell)
 *   ├── app/                    ← tools (same app, also reachable at /app/)
 *   │   ├── index.html
 *   │   └── assets/...
 *   └── welcome/                ← marketing landing
 *       ├── index.html
 *       └── style.css
 *
 * Render's Publish Directory should be set to `dist`.
 *
 * Cross-platform — uses Node's fs APIs instead of shell cp/mkdir so
 * Windows + Linux + macOS all work the same.
 */
import { spawnSync } from 'node:child_process';
import { rmSync, mkdirSync, cpSync, existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { generateToolPages } from './gen-tool-pages.mjs';
import { generateCardPages } from './gen-card-pages.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = resolve(ROOT, 'dist');

// Google AdSense — scaffolded so it goes live by setting ONE env var, with no
// code change. Set VITE_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX in the Render
// dashboard once your account is approved; the build then (a) injects the
// AdSense loader into every page's <head> and (b) writes a real ads.txt. With
// the var unset (the default) nothing is injected and ads.txt stays empty, so
// the site behaves exactly as before.
const ADSENSE_CLIENT = (process.env.VITE_ADSENSE_CLIENT || '').trim();
const ADSENSE_OK = /^ca-pub-\d{16}$/.test(ADSENSE_CLIENT);
if (ADSENSE_CLIENT && !ADSENSE_OK) {
  console.warn(`\n⚠ VITE_ADSENSE_CLIENT="${ADSENSE_CLIENT}" is not a valid ca-pub-XXXXXXXXXXXXXXXX id — skipping AdSense injection.`);
}

/** Recursively list every .html file under a directory. */
function htmlFilesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...htmlFilesUnder(p));
    else if (extname(p).toLowerCase() === '.html') out.push(p);
  }
  return out;
}

/** Inject the AdSense loader (Auto Ads) into every page and write ads.txt. */
function applyAdsense() {
  if (!ADSENSE_OK) return;
  const tag = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}" crossorigin="anonymous"></script>`;
  let n = 0;
  for (const file of htmlFilesUnder(DIST)) {
    let html = readFileSync(file, 'utf8');
    if (html.includes('adsbygoogle.js?client=')) continue; // idempotent
    if (html.includes('</head>')) { html = html.replace('</head>', `  ${tag}\n</head>`); writeFileSync(file, html); n++; }
  }
  // ads.txt authorises Google as a seller. The record uses the "pub-…" form.
  const pub = ADSENSE_CLIENT.replace(/^ca-/, '');
  writeFileSync(resolve(DIST, 'ads.txt'), `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`);
  console.log(`  AdSense loader injected into ${n} page(s); ads.txt written for ${pub}`);
}

function step(label) {
  console.log(`\n→ ${label}`);
}

function run(cmd, args, env = {}) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    console.error(`\n✗ command failed: ${cmd} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

step('1/4 — Building all workspace packages');
run('pnpm', ['-r', '--filter', './packages/*', 'build']);

step('2/4 — Building demo-react with base=/app/');
// VITE_BASE=/app/ rewrites every asset URL Vite emits to /app/assets/…
run('pnpm', ['--filter', 'demo-react', 'build'], { VITE_BASE: '/app/' });

step('3/4 — Assembling combined dist/');
if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// The demo (the actual tools) is now the DEFAULT experience — served both at
// the site root AND at /app/. The app is built with base=/app/, so its
// index.html references /app/assets/… (absolute paths) and therefore works
// unchanged whether it's served from "/" or "/app/".
mkdirSync(resolve(DIST, 'app'), { recursive: true });
const APP_DIST = resolve(ROOT, 'apps/demo-react/dist');
cpSync(APP_DIST, resolve(DIST, 'app'), { recursive: true });

// Root serves the app shell directly, so visitors land straight in the tools
// instead of behind a marketing gate.
cpSync(resolve(APP_DIST, 'index.html'), resolve(DIST, 'index.html'));

// Marketing / SEO landing now lives at /welcome. Copied as a self-contained
// folder (index.html + style.css together) so its relative `./style.css`
// reference keeps resolving under the new path.
mkdirSync(resolve(DIST, 'welcome'), { recursive: true });
cpSync(resolve(ROOT, 'apps/landing'), resolve(DIST, 'welcome'), { recursive: true });

// Legal / info pages (Privacy, Terms, About, Contact) are also served at the
// SITE ROOT with clean URLs (/privacy, /terms, /about, /contact) — that's what
// their canonical tags point to and what ad networks / users expect. serve.mjs
// resolves an extensionless path to `${path}.html`, so /privacy → privacy.html.
for (const f of ['privacy.html', 'terms.html', 'about.html', 'contact.html']) {
  const src = resolve(ROOT, 'apps/landing', f);
  if (existsSync(src)) cpSync(src, resolve(DIST, f));
}

// SEO / PWA / AI files are referenced at the SITE ROOT (e.g. /robots.txt,
// /sitemap.xml, /og-image.svg, /manifest.webmanifest, /sw.js, /icon.svg). The
// demo bundles them under /app, so copy the root-served ones up to dist/ too.
step('3b/4 — Publishing root-served SEO/PWA files');
for (const f of [
  'robots.txt', 'sitemap.xml', 'og-image.svg', 'og-image.png', 'qr-app.png', 'qr-app.svg', 'manifest.webmanifest', 'sw.js',
  'icon.svg', 'icon-maskable.svg', 'llms.txt', 'openapi.yaml', 'favicon.ico', 'ads.txt',
  'pyntra-promo.mp4', 'pyntra-promo.gif', 'pyntra-promo.svg',
]) {
  const src = resolve(APP_DIST, f);
  if (existsSync(src)) cpSync(src, resolve(DIST, f));
}
const wellKnown = resolve(APP_DIST, '.well-known');
if (existsSync(wellKnown)) cpSync(wellKnown, resolve(DIST, '.well-known'), { recursive: true });

// Per-tool SEO landing pages at /tools/<slug> (+ a /tools index).
step('3c/4 — Generating per-tool SEO pages');
const toolPaths = generateToolPages(DIST);
console.log(`  ${toolPaths.length} tool pages + /tools index`);

// Per-occasion card landing pages at /cards/<slug> (+ a /cards index). These
// give the Cards gallery real, crawlable, deep-linkable URLs — the multi-page
// navigation layer — without changing the in-app gallery itself.
step('3c2/4 — Generating per-occasion card pages');
const cardPaths = generateCardPages(DIST);
console.log(`  ${cardPaths.length} card pages (/cards + occasions)`);

// Add the freshly-generated tool + card URLs to sitemap.xml so they're
// discoverable. Best-effort: only if a sitemap was published to the root.
const sitemapPath = resolve(DIST, 'sitemap.xml');
if (existsSync(sitemapPath)) {
  const ORIGIN = 'https://pyntra.tekivex.com';
  let xml = readFileSync(sitemapPath, 'utf8');
  const extra = [...toolPaths, ...cardPaths]
    .filter((p) => !xml.includes(`<loc>${ORIGIN}${p}</loc>`))
    .map((p) => `  <url><loc>${ORIGIN}${p}</loc><changefreq>weekly</changefreq></url>`)
    .join('\n');
  if (extra && xml.includes('</urlset>')) {
    xml = xml.replace('</urlset>', `${extra}\n</urlset>`);
    writeFileSync(sitemapPath, xml);
    console.log(`  sitemap.xml: +${extra.split('\n').length} url(s)`);
  }
}

// AdSense (no-op unless VITE_ADSENSE_CLIENT is set) — runs last so every page,
// including the just-generated tool pages, gets the loader.
if (ADSENSE_OK) { step('3d/4 — Injecting AdSense (VITE_ADSENSE_CLIENT set)'); applyAdsense(); }

step('4/4 — Done');
console.log(`\n✓ Combined site at ${DIST}`);
console.log('  Tools (root): dist/index.html  (also at dist/app/index.html)');
console.log('  Landing:      dist/welcome/index.html');
console.log('\nRender → Publish Directory should be: dist');
