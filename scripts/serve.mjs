#!/usr/bin/env node
/*
 * pdfcraft production server — serves the built static site (dist/) AND runs the
 * zero-knowledge collaboration relay on the SAME origin. Deploying this (instead
 * of a static host) is what makes cross-device sharing work with no extra config:
 * the client auto-connects its relay to the same host it loaded from.
 *
 * The relay only rebroadcasts already-encrypted frames within a room — it never
 * sees document contents (see apps/demo-react/src/v2/collab/crypto.ts). Zero
 * dependencies: static file serving + RFC 6455 framing over Node built-ins.
 *
 *   pnpm build:site && node scripts/serve.mjs   # PORT defaults to 10000
 */
import http from 'node:http';
import crypto from 'node:crypto';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, join, normalize, extname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = resolve(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 10000;

// ── Server-side AI proxy (Groq) ──────────────────────────────────────────────
// So the app can offer AI script-writing to everyone WITHOUT shipping any key to
// the browser. The key(s) live only here, read from the Render environment. When
// one key hits its quota/rate-limit (429) or is rejected (401/403), we rotate to
// the next and retry — so you can drop in a spare key and keep the feature free.
//
// Configure in Render → Environment (any of these; all optional):
//   GROQ_API_KEY      primary key
//   GROQ_API_KEY_2    fallback used when the primary is rate-limited / exhausted
//   GROQ_API_KEY_3…   any number of further fallbacks (checked in order)
//   GROQ_API_KEYS     alternatively, a comma-separated list of keys
//   GROQ_MODEL        default model (default: llama-3.3-70b-versatile)
// With no key set, the AI endpoints report "disabled" and the UI hides the
// button — the app keeps working exactly as before.
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_KEYS = loadGroqKeys();
const AI_MAX_BODY = 256 * 1024; // 256 KiB — script prompts are tiny
const AI_TIMEOUT_MS = 30_000;

function loadGroqKeys() {
  const keys = [];
  if (process.env.GROQ_API_KEYS) keys.push(...process.env.GROQ_API_KEYS.split(','));
  if (process.env.GROQ_API_KEY) keys.push(process.env.GROQ_API_KEY);
  for (let i = 2; i <= 12; i++) { const k = process.env[`GROQ_API_KEY_${i}`]; if (k) keys.push(k); }
  // De-dupe + trim + drop empties, preserving order (primary first).
  return [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
}

// ── Web Push (optional, opt-in FESTIVAL notifications) ───────────────────────
// Sends festival-day notifications to subscribed devices — festivals are PUBLIC
// data, so nothing personal is stored (just the opaque push subscription).
// Personal reminders stay entirely on-device (see the service worker). Fully
// gated on VAPID keys; with none set the endpoint reports "disabled" and no
// scheduler runs, so the server behaves exactly as before.
//   Configure in Render → Environment:
//     VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   (generate: npx web-push generate-vapid-keys)
//     VAPID_SUBJECT     (mailto: or https URL; default mailto:hello@pyntra.app)
const VAPID_PUBLIC = (process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE = (process.env.VAPID_PRIVATE_KEY || '').trim();
const VAPID_SUBJECT = (process.env.VAPID_SUBJECT || 'mailto:hello@pyntra.app').trim();
const PUSH_OK = !!(VAPID_PUBLIC && VAPID_PRIVATE);
const SUBS_FILE = resolve(ROOT, 'push-subs.json');
let webpush = null;
let subs = [];
if (PUSH_OK) {
  try {
    webpush = (await import('web-push')).default;
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    try { const raw = JSON.parse(await readFile(SUBS_FILE, 'utf8')); if (Array.isArray(raw)) subs = raw; } catch { /* first run */ }
    console.log(`Web Push enabled — ${subs.length} subscription(s) loaded`);
  } catch (e) { webpush = null; console.warn('Web Push disabled — web-push not available:', e.message); }
}
const saveSubs = () => writeFile(SUBS_FILE, JSON.stringify(subs)).catch(() => { /* ephemeral fs — non-fatal */ });

// Festival dates the SERVER knows (public). Mirror of festivalCalendar.ts —
// keep in step when updating dates. Fixed + the published lunar dates.
const PUSH_FIXED = [[1, 1, 'New Year'], [1, 14, 'Makar Sankranti / Pongal'], [1, 26, 'Republic Day'], [4, 14, 'Baisakhi'], [8, 15, 'Independence Day'], [10, 2, 'Gandhi Jayanti'], [11, 14, "Children's Day"], [12, 25, 'Christmas']];
const PUSH_LUNAR = {
  2026: [[1, 23, 'Vasant Panchami'], [2, 15, 'Maha Shivratri'], [3, 4, 'Holi'], [3, 19, 'Ugadi / Gudi Padwa'], [3, 20, 'Eid ul-Fitr'], [3, 26, 'Ram Navami'], [4, 19, 'Akshaya Tritiya'], [5, 1, 'Buddha Purnima'], [5, 27, 'Bakrid'], [8, 26, 'Onam'], [8, 28, 'Raksha Bandhan'], [9, 4, 'Janmashtami'], [9, 14, 'Ganesh Chaturthi'], [10, 20, 'Dussehra'], [10, 29, 'Karva Chauth'], [11, 8, 'Diwali'], [11, 15, 'Chhath Puja'], [11, 24, 'Guru Nanak Jayanti']],
  2027: [[2, 11, 'Vasant Panchami'], [3, 6, 'Maha Shivratri'], [3, 22, 'Holi'], [4, 7, 'Ugadi / Gudi Padwa'], [3, 10, 'Eid ul-Fitr'], [4, 15, 'Ram Navami'], [5, 8, 'Akshaya Tritiya'], [5, 20, 'Buddha Purnima'], [5, 17, 'Bakrid'], [7, 6, 'Rath Yatra'], [7, 18, 'Guru Purnima'], [9, 14, 'Onam'], [8, 17, 'Raksha Bandhan'], [8, 25, 'Janmashtami'], [9, 4, 'Ganesh Chaturthi'], [10, 9, 'Dussehra'], [10, 17, 'Karva Chauth'], [10, 27, 'Dhanteras'], [10, 29, 'Diwali'], [10, 31, 'Bhai Dooj'], [11, 4, 'Chhath Puja'], [11, 14, 'Guru Nanak Jayanti']],
};
function istNow() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(new Date());
  const g = (t) => Number(parts.find((p) => p.type === t).value);
  return { y: g('year'), m: g('month'), d: g('day'), hr: g('hour') };
}
function festivalsToday() {
  const { y, m, d } = istNow();
  const out = PUSH_FIXED.filter(([fm, fd]) => fm === m && fd === d).map(([, , n]) => n);
  for (const [lm, ld, n] of (PUSH_LUNAR[y] || [])) if (lm === m && ld === d) out.push(n);
  return out;
}
async function handlePush(req, res, url) {
  if (url.pathname === '/api/push/vapid' && req.method === 'GET') return sendJson(res, 200, { enabled: PUSH_OK && !!webpush, publicKey: PUSH_OK ? VAPID_PUBLIC : null });
  if (!PUSH_OK || !webpush) return sendJson(res, 503, { error: 'push disabled' });
  if (url.pathname === '/api/push/subscribe' && req.method === 'POST') {
    try { const sub = JSON.parse(await readBody(req, 16 * 1024)); if (sub && sub.endpoint) { if (!subs.some((s) => s.endpoint === sub.endpoint)) { subs.push(sub); void saveSubs(); } return sendJson(res, 200, { ok: true }); } } catch { /* */ }
    return sendJson(res, 400, { error: 'bad subscription' });
  }
  if (url.pathname === '/api/push/unsubscribe' && req.method === 'POST') {
    try { const { endpoint } = JSON.parse(await readBody(req, 16 * 1024)); subs = subs.filter((s) => s.endpoint !== endpoint); void saveSubs(); } catch { /* */ }
    return sendJson(res, 200, { ok: true });
  }
  return sendJson(res, 404, { error: 'not found' });
}
async function sendFestivalPush() {
  if (!PUSH_OK || !webpush || !subs.length) return;
  const fests = festivalsToday();
  if (!fests.length) return;
  const payload = JSON.stringify({ title: `🎉 ${fests[0]} today!`, body: `${fests.join(', ')} — open Pyntra to make & send a card` });
  const dead = [];
  await Promise.all(subs.map(async (s) => { try { await webpush.sendNotification(s, payload); } catch (e) { if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.endpoint); } }));
  if (dead.length) { subs = subs.filter((s) => !dead.includes(s.endpoint)); void saveSubs(); }
}
// Once per day at/after 8am IST, push that day's festivals to subscribers.
let lastPushDay = '';
if (PUSH_OK) setInterval(() => { try { const { y, m, d, hr } = istNow(); const day = `${y}-${m}-${d}`; if (hr >= 8 && day !== lastPushDay) { lastPushDay = day; void sendFestivalPush(); } } catch { /* */ } }, 60 * 60 * 1000);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.pdf': 'application/pdf',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.map': 'application/json',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/x-m4v', '.vtt': 'text/vtt',
};

async function tryFiles(...candidates) {
  for (const c of candidates) {
    try { const s = await stat(c); if (s.isFile()) return c; } catch { /* next */ }
  }
  return null;
}

// ── AI proxy handler ─────────────────────────────────────────────────────────
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolvePromise, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleAi(req, res, url) {
  // Status probe — lets the UI show the AI button only when a key is configured.
  if (url.pathname === '/api/ai/status' && req.method === 'GET') {
    return sendJson(res, 200, { enabled: GROQ_KEYS.length > 0, model: GROQ_MODEL });
  }
  // OpenAI-compatible chat proxy (same shape the client already speaks).
  if (url.pathname === '/api/ai/chat/completions' && req.method === 'POST') {
    if (GROQ_KEYS.length === 0) return sendJson(res, 503, { error: 'AI is not configured on this server.' });
    let payload;
    try { payload = JSON.parse(await readBody(req, AI_MAX_BODY)); }
    catch { return sendJson(res, 400, { error: 'Invalid or oversized request body.' }); }
    if (!Array.isArray(payload?.messages) || payload.messages.length === 0) {
      return sendJson(res, 400, { error: 'messages[] is required.' });
    }
    // Only forward a safe, fixed set of fields — never a client-supplied key/url.
    const upstreamBody = {
      model: typeof payload.model === 'string' && payload.model ? payload.model : GROQ_MODEL,
      messages: payload.messages,
      temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.7,
      max_tokens: Math.min(typeof payload.max_tokens === 'number' ? payload.max_tokens : 700, 2048),
    };
    return proxyToGroq(res, upstreamBody);
  }
  return sendJson(res, 404, { error: 'Not found.' });
}

/** POST to Groq, rotating through the key pool on quota/auth failures. */
async function proxyToGroq(res, body) {
  let lastStatus = 502;
  let lastDetail = '';
  for (let i = 0; i < GROQ_KEYS.length; i++) {
    const key = GROQ_KEYS[i];
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
    try {
      const upstream = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (upstream.ok) {
        const json = await upstream.text();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(json);
        return;
      }
      lastStatus = upstream.status;
      lastDetail = (await upstream.text().catch(() => '')).slice(0, 300);
      // Rotate on quota / rate-limit / auth problems; otherwise stop (client error).
      const rotatable = upstream.status === 429 || upstream.status === 401 || upstream.status === 403 || upstream.status >= 500;
      if (!rotatable) break;
      console.warn(`[ai] key ${i + 1}/${GROQ_KEYS.length} failed (${upstream.status}); rotating`);
    } catch (err) {
      clearTimeout(timer);
      lastStatus = 504;
      lastDetail = String(err?.message || err);
      console.warn(`[ai] key ${i + 1}/${GROQ_KEYS.length} error: ${lastDetail}; rotating`);
    }
  }
  // All keys exhausted / failed.
  const msg = lastStatus === 429
    ? 'All AI keys have hit their quota for now. Please try again later.'
    : `AI request failed (${lastStatus}).`;
  sendJson(res, lastStatus === 429 ? 429 : 502, { error: msg, detail: lastDetail });
}

// ── Static site (with SPA fallbacks for /app and /docs) ──────────────────────
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    // AI proxy routes are handled before static serving.
    if (url.pathname.startsWith('/api/ai/')) { await handleAi(req, res, url); return; }
    if (url.pathname.startsWith('/api/push/')) { await handlePush(req, res, url); return; }
    // Normalize, then strip leading slashes / parent refs so `rel` is a clean
    // relative path (used for both file lookup and the /app|/docs SPA routing).
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\]|\.\.[/\\])+/, '');
    const path = join(DIST, rel);
    if (!path.startsWith(DIST)) { res.writeHead(403); res.end('Forbidden'); return; }

    let file = await tryFiles(path, join(path, 'index.html'), `${path}.html`);
    if (!file) {
      // SPA fallback: unknown /app/* → the app shell; /docs → docs shell; else landing.
      file = rel.startsWith('app') ? await tryFiles(join(DIST, 'app/index.html'))
        : rel.startsWith('docs') ? await tryFiles(join(DIST, 'docs/index.html'), join(DIST, 'app/index.html'))
        : await tryFiles(join(DIST, 'index.html'));
    }
    if (!file) { res.writeHead(404); res.end('Not found'); return; }

    const body = await readFile(file);
    const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
    // Hashed assets are immutable; HTML stays fresh so deploys take effect.
    const cache = file.includes(`${join(DIST, 'app', 'assets')}`) || /\.[0-9a-f]{8}\./.test(file)
      ? 'public, max-age=31536000, immutable'
      : 'no-cache';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache });
    res.end(body);
  } catch {
    res.writeHead(500); res.end('Server error');
  }
});

// ── Collaboration relay (WebSocket, zero-knowledge) ──────────────────────────
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_FRAME = 8 << 20; // 8 MiB — large enough for image data URLs in shared designs
const rooms = new Map();

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  socket.room = null;
  pump(socket);
});

function pump(socket) {
  let buf = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    let frame;
    while ((frame = decode(buf))) {
      buf = frame.rest;
      if (frame.tooBig) { drop(socket); return; }
      switch (frame.opcode) {
        case 0x8: drop(socket); return;
        case 0x9: socket.write(encode(frame.payload, 0xA)); break;
        case 0x1: control(socket, frame.payload); break;
        case 0x2: broadcast(socket, frame.payload); break;
        default: break;
      }
    }
  });
  socket.on('close', () => drop(socket));
  socket.on('error', () => drop(socket));
}

function control(socket, payload) {
  let msg;
  try { msg = JSON.parse(payload.toString('utf8')); } catch { return; }
  if (msg && msg.t === 'join' && typeof msg.room === 'string' && msg.room.length <= 256) {
    drop(socket, true);
    socket.room = msg.room;
    let peers = rooms.get(msg.room);
    if (!peers) rooms.set(msg.room, (peers = new Set()));
    peers.add(socket);
  }
}

function broadcast(socket, payload) {
  const peers = rooms.get(socket.room);
  if (!peers) return;
  const frame = encode(payload, 0x2);
  for (const peer of peers) if (peer !== socket && peer.writable) peer.write(frame);
}

function drop(socket, keepOpen = false) {
  const peers = rooms.get(socket.room);
  if (peers) { peers.delete(socket); if (peers.size === 0) rooms.delete(socket.room); }
  socket.room = null;
  if (!keepOpen) { try { socket.destroy(); } catch { /* gone */ } }
}

function decode(buf) {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let offset = 2;
  if (len === 126) { if (buf.length < 4) return null; len = buf.readUInt16BE(2); offset = 4; }
  else if (len === 127) { if (buf.length < 10) return null; len = Number(buf.readBigUInt64BE(2)); offset = 10; }
  if (len > MAX_FRAME) return { tooBig: true, rest: Buffer.alloc(0) };
  const maskLen = masked ? 4 : 0;
  if (buf.length < offset + maskLen + len) return null;
  let payload = buf.subarray(offset + maskLen, offset + maskLen + len);
  if (masked) {
    const mask = buf.subarray(offset, offset + 4);
    const out = Buffer.allocUnsafe(len);
    for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i & 3];
    payload = out;
  }
  return { opcode, payload, rest: buf.subarray(offset + maskLen + len) };
}

function encode(payload, opcode = 0x2) {
  const len = payload.length;
  let header;
  if (len < 126) { header = Buffer.from([0x80 | opcode, len]); }
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([header, payload]);
}

server.listen(PORT, () => console.log(
  `pdfcraft serving ${DIST} + collab relay on :${PORT}` +
  ` · AI proxy ${GROQ_KEYS.length ? `enabled (${GROQ_KEYS.length} Groq key${GROQ_KEYS.length > 1 ? 's' : ''}, model ${GROQ_MODEL})` : 'disabled (no GROQ_API_KEY set)'}`,
));
