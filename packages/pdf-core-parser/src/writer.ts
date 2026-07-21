import type { PdfObject } from './types.js';

/**
 * Serialize a PdfObject back into PDF bytes. The output is byte-faithful
 * for everything our parser produced — round-tripping is safe (we test
 * this in smoke.mjs).
 */
export function serializeObject(o: PdfObject): Uint8Array {
  const out: number[] = [];
  rec(o, out);
  return new Uint8Array(out);
}

function rec(x: PdfObject, out: number[]): void {
  switch (x.kind) {
    case 'null':
      pushStr('null', out);
      return;
    case 'bool':
      pushStr(x.value ? 'true' : 'false', out);
      return;
    case 'num':
      pushStr(formatNum(x.value), out);
      return;
    case 'name':
      out.push(0x2f); // '/'
      for (let i = 0; i < x.value.length; i++) {
        const c = x.value.charCodeAt(i);
        // Names use #XX for any byte outside the printable, delimiter, or whitespace ranges.
        if (c < 0x21 || c > 0x7e || isDelim(c) || c === 0x23 /* '#' */) {
          pushStr('#' + c.toString(16).padStart(2, '0').toUpperCase(), out);
        } else {
          out.push(c);
        }
      }
      return;
    case 'string':
      writeString(x.value, x.literal, out);
      return;
    case 'ref':
      pushStr(`${x.objectNumber} ${x.generation} R`, out);
      return;
    case 'array':
      out.push(0x5b); // '['
      for (let i = 0; i < x.items.length; i++) {
        if (i > 0) out.push(0x20);
        rec(x.items[i]!, out);
      }
      out.push(0x5d); // ']'
      return;
    case 'dict':
      pushStr('<<', out);
      for (const [k, v] of x.entries) {
        out.push(0x20);
        rec({ kind: 'name', value: k }, out);
        out.push(0x20);
        rec(v, out);
      }
      pushStr(' >>', out);
      return;
    case 'stream': {
      // Stream dict precedes the stream content. We re-emit /Length from
      // the raw byte length in case the caller swapped raw out from under us.
      const dictCopy = new Map(x.dict);
      dictCopy.set('Length', { kind: 'num', value: x.raw.length });
      rec({ kind: 'dict', entries: dictCopy }, out);
      pushStr('\nstream\n', out);
      for (let i = 0; i < x.raw.length; i++) out.push(x.raw[i]!);
      pushStr('\nendstream', out);
      return;
    }
  }
}

function writeString(bytes: Uint8Array, literal: boolean, out: number[]): void {
  if (literal) {
    out.push(0x28); // '('
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i]!;
      if (b === 0x28 || b === 0x29 || b === 0x5c) {
        out.push(0x5c); // '\'
        out.push(b);
      } else {
        out.push(b);
      }
    }
    out.push(0x29); // ')'
  } else {
    out.push(0x3c); // '<'
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i]!;
      pushStr(b.toString(16).padStart(2, '0').toUpperCase(), out);
    }
    out.push(0x3e); // '>'
  }
}

function pushStr(s: string, out: number[]): void {
  for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  // Avoid scientific notation; PDF wants plain decimals.
  return n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function isDelim(c: number): boolean {
  return (
    c === 0x28 || c === 0x29 ||
    c === 0x3c || c === 0x3e ||
    c === 0x5b || c === 0x5d ||
    c === 0x7b || c === 0x7d ||
    c === 0x2f || c === 0x25
  );
}

/**
 * Build a PDF text-string value as the UTF-16BE-with-BOM hex string that
 * every modern PDF viewer reads correctly. This is what pdf-lib emits.
 */
export function makeTextString(s: string): PdfObject {
  const bytes = new Uint8Array(2 + s.length * 2);
  bytes[0] = 0xfe;
  bytes[1] = 0xff;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    bytes[2 + i * 2] = (c >> 8) & 0xff;
    bytes[2 + i * 2 + 1] = c & 0xff;
  }
  return { kind: 'string', value: bytes, literal: false };
}
