/**
 * pdfcraft collab relay — a dumb, zero-knowledge WebSocket rebroadcaster.
 *
 * It has exactly one job: forward binary frames between clients that joined the
 * same room. It never decrypts anything — every data frame is already
 * end-to-end encrypted by the browser (see src/v2/collab/crypto.ts), so the relay
 * only sees opaque ciphertext and an opaque room id. That's what lets two people
 * on different machines, in different countries, co-edit a document through this
 * box without trusting it with their content.
 *
 * Zero dependencies: it speaks the RFC 6455 WebSocket framing directly over
 * Node's built-in http/net, so you can `node server.mjs` anywhere with no install.
 *
 *   PORT=8787 node server.mjs
 *   # then point the app at it:  localStorage['pdfcraft:relay'] = 'wss://your-host'
 *   #                            (or build with VITE_COLLAB_RELAY=wss://your-host)
 */
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT) || 8787;
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_FRAME = 8 << 20; // 8 MiB — large enough for image data URLs in shared designs
const rooms = new Map(); // room id -> Set<socket>

const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200); res.end('ok'); return; }
  res.writeHead(426, { 'Content-Type': 'text/plain' });
  res.end('Upgrade Required');
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
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
        case 0x8: drop(socket); return;                                  // close
        case 0x9: socket.write(encode(frame.payload, 0xA)); break;       // ping -> pong
        case 0x1: control(socket, frame.payload); break;                 // text control
        case 0x2: broadcast(socket, frame.payload); break;               // binary data
        default: break;                                                  // pong/continuation: ignore
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
    drop(socket, /* keepOpen */ true);
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
  if (!keepOpen) { try { socket.destroy(); } catch { /* already gone */ } }
}

/** Decode one client frame (clients always mask). Returns null if incomplete. */
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

/** Encode a server frame (servers never mask). */
function encode(payload, opcode = 0x2) {
  const len = payload.length;
  let header;
  if (len < 126) { header = Buffer.from([0x80 | opcode, len]); }
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([header, payload]);
}

server.listen(PORT, () => console.log(`pdfcraft collab relay listening on :${PORT}`));
