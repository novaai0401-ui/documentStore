/**
 * Feature promo generator for Pyntra.
 *
 * Builds a short, looping product explainer and encodes it for social posting:
 *   - public/pyntra-promo.mp4  (H.264 — the format Twitter/X, LinkedIn, etc. want)
 *   - public/pyntra-promo.gif  (smaller fallback for places that prefer GIF)
 *   - public/pyntra-promo.svg  (self-contained animated SVG for web / README)
 *
 * Frames are drawn as plain SVG (no color-emoji — resvg can't raster those, so
 * every icon is a hand-drawn vector), rasterised to RGBA via resvg, then fed to
 * the H.264 / GIF encoders. Pure-JS pipeline; no system ffmpeg required.
 */
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const require = createRequire(import.meta.url);
const { Resvg } = require('@resvg/resvg-js');
const HME = require('h264-mp4-encoder');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');

const W = 1280, H = 720, FPS = 24;
const OUT = resolve(process.cwd(), 'apps/demo-react/public');

// ── Palette ────────────────────────────────────────────────────────────────
const INK = '#f8fafc', MUT = '#cbd5e1', SUB = '#94a3b8', AC = '#38bdf8';

// ── Vector icons (centered at 0,0; ~140px tall), no fonts/emoji ──────────────
const icons = {
  brand: () => `
    <rect x="-34" y="-44" width="68" height="84" rx="12" fill="url(#ac)"/>
    <text x="0" y="14" font-size="52" font-weight="800" fill="#fff" text-anchor="middle">P</text>`,
  doc: () => `
    <rect x="-50" y="-66" width="100" height="132" rx="12" fill="#fff"/>
    <rect x="-50" y="-66" width="100" height="34" rx="12" fill="url(#ac)"/>
    <rect x="-34" y="-14" width="68" height="9" rx="4.5" fill="#94a3b8"/>
    <rect x="-34" y="6" width="68" height="9" rx="4.5" fill="#cbd5e1"/>
    <rect x="-34" y="26" width="44" height="9" rx="4.5" fill="#cbd5e1"/>`,
  office: () => `
    <rect x="-66" y="-40" width="54" height="80" rx="9" fill="#2e5bff"/>
    <rect x="-22" y="-52" width="54" height="92" rx="9" fill="#22a06b"/>
    <rect x="20" y="-40" width="50" height="80" rx="9" fill="#e8833a"/>
    <text x="-39" y="14" font-size="30" font-weight="800" fill="#fff" text-anchor="middle">W</text>
    <text x="5" y="6" font-size="30" font-weight="800" fill="#fff" text-anchor="middle">X</text>
    <text x="45" y="14" font-size="26" font-weight="800" fill="#fff" text-anchor="middle">P</text>`,
  design: () => `
    <circle cx="-26" cy="-6" r="40" fill="#2e5bff" opacity="0.92"/>
    <rect x="-6" y="-34" width="64" height="64" rx="10" fill="#38bdf8" opacity="0.92"/>
    <path d="M2 44 L40 -20 L78 44 Z" transform="translate(-40,4)" fill="#f59e0b" opacity="0.92"/>`,
  image: () => `
    <rect x="-64" y="-48" width="128" height="96" rx="12" fill="#fff"/>
    <circle cx="30" cy="-18" r="13" fill="#f59e0b"/>
    <path d="M-58 44 L-18 -2 L14 28 L34 8 L58 44 Z" fill="#2e5bff"/>`,
  shield: () => `
    <path d="M0 -66 L54 -42 V6 C54 42 30 60 0 70 C-30 60 -54 42 -54 6 V-42 Z" fill="url(#ac)"/>
    <path d="M-22 2 L-6 20 L26 -20" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`,
  collab: () => `
    <circle cx="-38" cy="-2" r="30" fill="#2e5bff"/>
    <circle cx="38" cy="-2" r="30" fill="#38bdf8"/>
    <circle cx="0" cy="10" r="34" fill="#22c55e" stroke="#0b1220" stroke-width="6"/>`,
  rocket: () => `
    <rect x="-44" y="-44" width="88" height="88" rx="18" fill="url(#ac)"/>
    <path d="M-16 14 L-2 14 L6 -18 L-24 -2 Z M2 14 L16 14 L16 -2 Z" fill="#fff"/>
    <text x="0" y="2" font-size="44" font-weight="800" fill="#fff" text-anchor="middle">↓</text>`,
};

// ── Scenes ───────────────────────────────────────────────────────────────────
const scenes = [
  { kind: 'intro', icon: 'brand', title: 'Pyntra', sub: 'Your private document & design studio', tag: '100% in your browser · nothing uploaded', secs: 2.4 },
  { icon: 'doc', title: 'Edit any PDF like Word', sub: 'Click any line and retype — even flat, “non-editable” PDFs', secs: 2.1 },
  { icon: 'office', title: 'Open Office files natively', sub: 'Word · Excel · PowerPoint · Markdown · Images — edit in place', secs: 2.1 },
  { icon: 'design', title: 'Design studio', sub: 'Social posts · posters · résumés & cover letters · brand kits', secs: 2.1 },
  { icon: 'image', title: 'Image editor', sub: 'Crop, filters, resize & one-click background remover', secs: 2.1 },
  { icon: 'shield', title: 'OCR · QR · true redaction', sub: 'Scan to text, generate QR codes, verifiably remove sensitive text', secs: 2.1 },
  { icon: 'collab', title: 'Real-time collaboration', sub: 'Co-edit across devices — end-to-end encrypted', secs: 2.1 },
  { kind: 'outro', icon: 'rocket', title: 'Free · Private · Installable', sub: 'No account · no upload · no watermark', tag: 'pyntra.tekivex.com', secs: 2.8 },
];
const TOTAL = scenes.reduce((s, x) => s + x.secs, 0);
const starts = []; { let a = 0; for (const s of scenes) { starts.push(a); a += s.secs; } }

const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function sceneAt(t) {
  let i = scenes.length - 1;
  for (let k = 0; k < scenes.length; k++) if (t >= starts[k]) i = k;
  return i;
}

/** One SVG frame at time `t` (seconds). */
function frameSVG(t) {
  const i = sceneAt(t);
  const s = scenes[i];
  const local = t - starts[i];
  const fade = 0.42;
  const inO = i === 0 ? 1 : clamp01(local / fade); // first frame = a clean poster
  const outO = clamp01((s.secs - local) / fade);
  const op = Math.min(easeOut(inO), easeOut(outO));
  const rise = (1 - easeOut(inO)) * 26; // content slides up on enter
  // parallax background blobs
  const bx = Math.sin(t * 0.5) * 40, by = Math.cos(t * 0.4) * 30;
  const prog = (t / TOTAL) * (W - 160);

  const big = s.kind === 'intro' || s.kind === 'outro';
  const iconScale = big ? 1.15 : 1;
  const titleSize = big ? 86 : 64;
  const titleY = big ? 372 : 470;
  const iconY = big ? 212 : 300;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter, system-ui, Arial, sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1220"/><stop offset="1" stop-color="#1e293b"/></linearGradient>
    <linearGradient id="ac" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#38bdf8"/><stop offset="1" stop-color="#2e5bff"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${1080 + bx}" cy="${140 + by}" r="340" fill="#2e5bff" opacity="0.13"/>
  <circle cx="${200 - bx}" cy="${620 - by}" r="260" fill="#38bdf8" opacity="0.09"/>

  <!-- brand watermark -->
  <g transform="translate(56,52)" opacity="0.96">
    <rect x="0" y="0" width="40" height="48" rx="8" fill="url(#ac)"/>
    <text x="20" y="34" font-size="28" font-weight="800" fill="#fff" text-anchor="middle">P</text>
    <text x="52" y="35" font-size="30" font-weight="800" fill="${INK}">Pyntra</text>
  </g>

  <!-- scene content -->
  <g opacity="${op.toFixed(3)}" transform="translate(0,${rise.toFixed(2)})">
    <g transform="translate(${W / 2},${iconY}) scale(${iconScale})">${icons[s.icon]()}</g>
    <text x="${W / 2}" y="${titleY}" font-size="${titleSize}" font-weight="800" fill="${INK}" text-anchor="middle">${esc(s.title)}</text>
    <text x="${W / 2}" y="${titleY + (big ? 56 : 52)}" font-size="${big ? 32 : 30}" font-weight="600" fill="${big ? AC : MUT}" text-anchor="middle">${esc(s.sub)}</text>
    ${s.tag ? `<text x="${W / 2}" y="${titleY + 118}" font-size="30" font-weight="700" fill="${SUB}" text-anchor="middle">${esc(s.tag)}</text>` : ''}
  </g>

  <!-- progress -->
  <rect x="80" y="${H - 46}" width="${W - 160}" height="6" rx="3" fill="#334155"/>
  <rect x="80" y="${H - 46}" width="${Math.max(0, prog).toFixed(1)}" height="6" rx="3" fill="url(#ac)"/>
</svg>`;
}

// ── Render frames ────────────────────────────────────────────────────────────
const nFrames = Math.round(TOTAL * FPS);

// Preview mode: dump a few representative frames as PNG and exit (no encoding).
if (process.env.PREVIEW) {
  for (const t of [0.9, 3.2, 5.3, 7.4, 15.5]) {
    const png = new Resvg(frameSVG(t), { fitTo: { mode: 'width', value: W }, font: { loadSystemFonts: true } }).render().asPng();
    const name = `promo-preview-${t.toString().replace('.', '_')}.png`;
    writeFileSync(resolve(OUT, name), png);
    console.log('wrote', name);
  }
  process.exit(0);
}

console.log(`Rendering ${nFrames} frames (${TOTAL.toFixed(1)}s @ ${FPS}fps) at ${W}x${H}…`);
const frames = [];
for (let f = 0; f < nFrames; f++) {
  const t = f / FPS;
  const png = new Resvg(frameSVG(t), { fitTo: { mode: 'width', value: W }, font: { loadSystemFonts: true } }).render();
  frames.push(Buffer.from(png.pixels)); // RGBA, W*H*4
  if (f % 40 === 0) process.stdout.write(`  frame ${f}/${nFrames}\r`);
}
console.log(`\nRendered ${frames.length} frames.`);

// ── Encode MP4 (H.264) ───────────────────────────────────────────────────────
const enc = await HME.createH264MP4Encoder();
enc.width = W; enc.height = H; enc.frameRate = FPS;
enc.quantizationParameter = 24; // 10(best)–51; 24 ≈ crisp & small
enc.groupOfPictures = FPS * 2;
enc.initialize();
for (const fr of frames) enc.addFrameRgba(fr);
enc.finalize();
const mp4 = enc.FS.readFile(enc.outputFilename);
writeFileSync(resolve(OUT, 'pyntra-promo.mp4'), Buffer.from(mp4));
enc.delete();
console.log(`Wrote pyntra-promo.mp4 (${(mp4.length / 1e6).toFixed(2)} MB)`);

// ── Encode GIF (downscaled for size) ─────────────────────────────────────────
const GW = 800, GH = 450, GIF_FPS = 12;
const gif = GIFEncoder();
for (let f = 0; f < nFrames; f += Math.round(FPS / GIF_FPS)) {
  // nearest-neighbour downscale RGBA W×H -> GW×GH
  const src = frames[f]; const dst = new Uint8Array(GW * GH * 4);
  for (let y = 0; y < GH; y++) {
    const sy = (y * H / GH) | 0;
    for (let x = 0; x < GW; x++) {
      const sx = (x * W / GW) | 0;
      const si = (sy * W + sx) * 4, di = (y * GW + x) * 4;
      dst[di] = src[si]; dst[di + 1] = src[si + 1]; dst[di + 2] = src[si + 2]; dst[di + 3] = 255;
    }
  }
  const palette = quantize(dst, 256);
  const index = applyPalette(dst, palette);
  gif.writeFrame(index, GW, GH, { palette, delay: Math.round(1000 / GIF_FPS) });
}
gif.finish();
const gifBuf = Buffer.from(gif.bytes());
writeFileSync(resolve(OUT, 'pyntra-promo.gif'), gifBuf);
console.log(`Wrote pyntra-promo.gif (${(gifBuf.length / 1e6).toFixed(2)} MB)`);

// ── Self-contained looping animated SVG (web / README; not for social feeds) ──
function animatedSVG() {
  const pct = (sec) => +(sec / TOTAL * 100).toFixed(3);
  let style = `.scene{opacity:0}.blob{transform-origin:center;animation:float 9s ease-in-out infinite}@keyframes float{0%,100%{transform:translate(0,0)}50%{transform:translate(26px,-20px)}}`;
  let body = '';
  scenes.forEach((s, i) => {
    const st = starts[i], en = st + s.secs, f = 0.42;
    const k = `s${i}`;
    style += i === 0
      ? `@keyframes ${k}{0%{opacity:1}${pct(en - f)}%{opacity:1}${pct(en)}%{opacity:0}100%{opacity:0}}`
      : `@keyframes ${k}{0%{opacity:0}${pct(st)}%{opacity:0}${pct(st + f)}%{opacity:1}${pct(en - f)}%{opacity:1}${pct(en)}%{opacity:0}100%{opacity:0}}`;
    style += `.${k}{animation:${k} ${TOTAL}s linear infinite}`;
    const big = s.kind === 'intro' || s.kind === 'outro';
    const iconScale = big ? 1.15 : 1, titleSize = big ? 86 : 64;
    const titleY = big ? 372 : 470, iconY = big ? 212 : 300;
    body += `<g class="scene ${k}">
      <g transform="translate(${W / 2},${iconY}) scale(${iconScale})">${icons[s.icon]()}</g>
      <text x="${W / 2}" y="${titleY}" font-size="${titleSize}" font-weight="800" fill="${INK}" text-anchor="middle">${esc(s.title)}</text>
      <text x="${W / 2}" y="${titleY + (big ? 56 : 52)}" font-size="${big ? 32 : 30}" font-weight="600" fill="${big ? AC : MUT}" text-anchor="middle">${esc(s.sub)}</text>
      ${s.tag ? `<text x="${W / 2}" y="${titleY + 118}" font-size="30" font-weight="700" fill="${SUB}" text-anchor="middle">${esc(s.tag)}</text>` : ''}
    </g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter, system-ui, Arial, sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1220"/><stop offset="1" stop-color="#1e293b"/></linearGradient>
    <linearGradient id="ac" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#38bdf8"/><stop offset="1" stop-color="#2e5bff"/></linearGradient>
    <style>${style}</style>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle class="blob" cx="1080" cy="140" r="340" fill="#2e5bff" opacity="0.13"/>
  <circle class="blob" cx="200" cy="620" r="260" fill="#38bdf8" opacity="0.09"/>
  <g opacity="0.96"><rect x="56" y="52" width="40" height="48" rx="8" fill="url(#ac)"/><text x="76" y="86" font-size="28" font-weight="800" fill="#fff" text-anchor="middle">P</text><text x="108" y="87" font-size="30" font-weight="800" fill="${INK}">Pyntra</text></g>
  ${body}
</svg>`;
}
writeFileSync(resolve(OUT, 'pyntra-promo.svg'), animatedSVG());
console.log('Wrote pyntra-promo.svg (animated, self-contained)');
