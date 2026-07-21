import { ByteReader, isDelimiter, isDigit, isWhitespace } from './reader.js';
import type { PdfObject } from './types.js';
import { PDF_NULL } from './types.js';

/**
 * Parse one PDF object starting at the reader's current position.
 * Handles every variant: null, bool, number, name, string (literal +
 * hex), array, dict, ref, stream. A stream is parsed as its dict plus
 * the raw bytes between `stream` and `endstream` keywords — caller
 * applies the filters (FlateDecode, etc.) separately.
 */
export function parseObject(r: ByteReader): PdfObject {
  r.skipWhitespace();
  if (r.pos >= r.length) throw new Error('parseObject: unexpected EOF');

  const c = r.peek();

  // null / true / false
  if (r.consumeKeyword('null')) return PDF_NULL;
  if (r.consumeKeyword('true')) return { kind: 'bool', value: true };
  if (r.consumeKeyword('false')) return { kind: 'bool', value: false };

  // name: /Foo
  if (c === 0x2f /* '/' */) return parseName(r);

  // string literal: (...) — balanced parens, with backslash escapes
  if (c === 0x28 /* '(' */) return parseLiteralString(r);

  // hex string or dict: <abcd> or <<...>>
  if (c === 0x3c /* '<' */) {
    if (r.peek(1) === 0x3c) return parseDict(r);
    return parseHexString(r);
  }

  // array
  if (c === 0x5b /* '[' */) return parseArray(r);

  // number, ref, indirect-object header
  if (isDigit(c) || c === 0x2b /* '+' */ || c === 0x2d /* '-' */ || c === 0x2e /* '.' */) {
    return parseNumericOrRef(r);
  }

  throw new Error(`parseObject: unexpected byte 0x${c.toString(16)} at ${r.pos}`);
}

function parseName(r: ByteReader): PdfObject {
  r.read(); // consume '/'
  const start = r.pos;
  while (r.pos < r.length) {
    const b = r.peek();
    if (isWhitespace(b) || isDelimiter(b)) break;
    r.pos++;
  }
  // PDF names may contain #XX hex escapes. Decode them.
  const raw = r.asciiOf(start, r.pos);
  let decoded = '';
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '#' && i + 2 < raw.length) {
      decoded += String.fromCharCode(parseInt(raw.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      decoded += raw[i];
    }
  }
  return { kind: 'name', value: decoded };
}

function parseLiteralString(r: ByteReader): PdfObject {
  r.read(); // consume '('
  const out: number[] = [];
  let depth = 1;
  while (r.pos < r.length && depth > 0) {
    const b = r.read();
    if (b === 0x5c /* '\\' */) {
      const next = r.read();
      switch (next) {
        case 0x6e: out.push(0x0a); break; // \n
        case 0x72: out.push(0x0d); break; // \r
        case 0x74: out.push(0x09); break; // \t
        case 0x62: out.push(0x08); break; // \b
        case 0x66: out.push(0x0c); break; // \f
        case 0x28: out.push(0x28); break; // \(
        case 0x29: out.push(0x29); break; // \)
        case 0x5c: out.push(0x5c); break; // \\
        case 0x0a: break; // line continuation
        case 0x0d:
          if (r.peek() === 0x0a) r.read();
          break;
        default:
          // octal \ddd (1-3 digits)
          if (next >= 0x30 && next <= 0x37) {
            let n = next - 0x30;
            for (let i = 0; i < 2; i++) {
              const d = r.peek();
              if (d >= 0x30 && d <= 0x37) { n = n * 8 + (d - 0x30); r.read(); }
              else break;
            }
            out.push(n & 0xff);
          } else {
            // unknown escape: drop backslash, keep the char
            if (next >= 0) out.push(next);
          }
      }
    } else if (b === 0x28) {
      depth++;
      out.push(b);
    } else if (b === 0x29) {
      depth--;
      if (depth > 0) out.push(b);
    } else {
      out.push(b);
    }
  }
  return { kind: 'string', value: new Uint8Array(out), literal: true };
}

function parseHexString(r: ByteReader): PdfObject {
  r.read(); // consume '<'
  const bytes: number[] = [];
  let hi = -1;
  while (r.pos < r.length) {
    const b = r.read();
    if (b === 0x3e /* '>' */) break;
    if (isWhitespace(b)) continue;
    const v = hexValue(b);
    if (v < 0) continue;
    if (hi < 0) hi = v;
    else { bytes.push((hi << 4) | v); hi = -1; }
  }
  if (hi >= 0) bytes.push(hi << 4); // pad with 0 nibble per spec
  return { kind: 'string', value: new Uint8Array(bytes), literal: false };
}

function hexValue(b: number): number {
  if (b >= 0x30 && b <= 0x39) return b - 0x30;
  if (b >= 0x41 && b <= 0x46) return b - 0x41 + 10;
  if (b >= 0x61 && b <= 0x66) return b - 0x61 + 10;
  return -1;
}

function parseArray(r: ByteReader): PdfObject {
  r.read(); // consume '['
  const items: PdfObject[] = [];
  while (true) {
    r.skipWhitespace();
    if (r.peek() === 0x5d /* ']' */) { r.read(); break; }
    items.push(parseObject(r));
  }
  return { kind: 'array', items };
}

function parseDict(r: ByteReader): PdfObject {
  r.read(); r.read(); // consume '<<'
  const entries = new Map<string, PdfObject>();
  while (true) {
    r.skipWhitespace();
    if (r.peek() === 0x3e && r.peek(1) === 0x3e) {
      r.read(); r.read();
      break;
    }
    const key = parseObject(r);
    if (key.kind !== 'name') throw new Error(`parseDict: expected name key, got ${key.kind}`);
    r.skipWhitespace();
    const value = parseObject(r);
    entries.set(key.value, value);
  }
  // Check for a following `stream` keyword — if so this is a stream dict.
  r.skipSpacesOnly();
  if (r.consumeKeyword('stream')) {
    // Spec: stream keyword followed by EOL (LF or CR LF, not CR alone).
    if (r.peek() === 0x0d /* CR */) r.read();
    if (r.peek() === 0x0a /* LF */) r.read();
    const length = entries.get('Length');
    const streamStart = r.pos;
    if (length && length.kind === 'num') {
      const raw = r.slice(streamStart, streamStart + length.value);
      r.pos = streamStart + length.value;
      r.skipWhitespace();
      r.consumeKeyword('endstream');
      return { kind: 'stream', dict: entries, raw };
    }
    // /Length is an indirect ref (or missing). The parser has no doc
    // context to resolve it, so scan forward for the `endstream` marker
    // instead. Real-world PDFs commonly do this; the spec even sanctions
    // it as a fallback.
    const end = scanForEndstream(r, streamStart);
    const raw = r.slice(streamStart, end);
    r.pos = end;
    r.skipWhitespace();
    r.consumeKeyword('endstream');
    return { kind: 'stream', dict: entries, raw };
  }
  return { kind: 'dict', entries };
}

/** Find the byte position immediately before the literal `endstream`.
 *  Tolerates EOL variants (the keyword can be preceded by \r\n, \n, or \r). */
function scanForEndstream(r: ByteReader, from: number): number {
  const target = 'endstream';
  outer: for (let i = from; i < r.length - target.length; i++) {
    for (let j = 0; j < target.length; j++) {
      if (r.bytes[i + j] !== target.charCodeAt(j)) continue outer;
    }
    // back over the EOL bytes that precede the keyword
    let end = i;
    while (end > from && (r.bytes[end - 1] === 0x0a || r.bytes[end - 1] === 0x0d)) end--;
    return end;
  }
  throw new Error('scanForEndstream: no endstream found');
}

function parseNumericOrRef(r: ByteReader): PdfObject {
  // Could be: number, or "N G R" reference. Look ahead.
  const start = r.pos;
  const first = readNumber(r);
  // Save position after first number; peek for ref pattern.
  const afterFirst = r.pos;
  r.skipSpacesOnly();
  if (isDigit(r.peek())) {
    const secondStart = r.pos;
    const second = readNumber(r);
    if (Number.isInteger(first) && Number.isInteger(second)) {
      r.skipSpacesOnly();
      if (r.peek() === 0x52 /* 'R' */) {
        // Confirm 'R' is followed by delimiter / whitespace.
        const after = r.bytes[r.pos + 1];
        if (after === undefined || isWhitespace(after) || isDelimiter(after)) {
          r.read(); // consume 'R'
          return { kind: 'ref', objectNumber: first, generation: second };
        }
      }
      // Not a ref — rewind to right after the first number.
      r.pos = afterFirst;
    } else {
      r.pos = afterFirst;
    }
    void secondStart;
  }
  void start;
  return { kind: 'num', value: first };
}

function readNumber(r: ByteReader): number {
  const start = r.pos;
  if (r.peek() === 0x2b || r.peek() === 0x2d) r.pos++;
  while (r.pos < r.length) {
    const b = r.peek();
    if (isDigit(b) || b === 0x2e /* '.' */) r.pos++;
    else break;
  }
  return Number(r.asciiOf(start, r.pos));
}
