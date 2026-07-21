/**
 * A byte-level cursor over the PDF file. PDFs are mostly ASCII with
 * embedded binary in streams, so we work on raw bytes and decode strings
 * only when we need to.
 */

const SPACE = 0x20;
const TAB = 0x09;
const LF = 0x0a;
const CR = 0x0d;
const FF = 0x0c;
const NUL = 0x00;

export class ByteReader {
  constructor(public readonly bytes: Uint8Array, public pos = 0) {}

  get length(): number {
    return this.bytes.length;
  }

  peek(off = 0): number {
    return this.bytes[this.pos + off] ?? -1;
  }

  read(): number {
    return this.bytes[this.pos++] ?? -1;
  }

  back(n = 1): void {
    this.pos -= n;
  }

  slice(start: number, end: number): Uint8Array {
    return this.bytes.subarray(start, end);
  }

  /** ASCII-decode a byte range. PDF names + dictionary keys are ASCII. */
  asciiOf(start: number, end: number): string {
    let s = '';
    for (let i = start; i < end; i++) s += String.fromCharCode(this.bytes[i]!);
    return s;
  }

  /** Skip PDF whitespace + `%`-prefixed comments. */
  skipWhitespace(): void {
    while (this.pos < this.length) {
      const b = this.bytes[this.pos]!;
      if (isWhitespace(b)) {
        this.pos++;
      } else if (b === 0x25 /* '%' */) {
        // comment to end of line
        while (this.pos < this.length && !isEol(this.bytes[this.pos]!)) this.pos++;
      } else {
        break;
      }
    }
  }

  /** Skip whitespace but not comments — used inside content. */
  skipSpacesOnly(): void {
    while (this.pos < this.length) {
      const b = this.bytes[this.pos]!;
      if (b === SPACE || b === TAB || b === LF || b === CR || b === FF || b === NUL) this.pos++;
      else break;
    }
  }

  /** True if the cursor sits on the literal ASCII keyword (followed by a
   *  delimiter / whitespace). Does NOT consume. */
  matchKeyword(kw: string): boolean {
    if (this.pos + kw.length > this.length) return false;
    for (let i = 0; i < kw.length; i++) {
      if (this.bytes[this.pos + i] !== kw.charCodeAt(i)) return false;
    }
    const after = this.bytes[this.pos + kw.length];
    if (after === undefined) return true;
    return isWhitespace(after) || isDelimiter(after);
  }

  /** Consume the keyword if matched; returns whether it was. */
  consumeKeyword(kw: string): boolean {
    if (!this.matchKeyword(kw)) return false;
    this.pos += kw.length;
    return true;
  }

  /** Search backwards for the literal ASCII string `needle`. */
  lastIndexOf(needle: string): number {
    const n = needle.length;
    outer: for (let i = this.length - n; i >= 0; i--) {
      for (let j = 0; j < n; j++) {
        if (this.bytes[i + j] !== needle.charCodeAt(j)) continue outer;
      }
      return i;
    }
    return -1;
  }
}

export function isWhitespace(b: number): boolean {
  return b === SPACE || b === TAB || b === LF || b === CR || b === FF || b === NUL;
}

export function isEol(b: number): boolean {
  return b === LF || b === CR;
}

export function isDigit(b: number): boolean {
  return b >= 0x30 && b <= 0x39;
}

export function isDelimiter(b: number): boolean {
  // PDF delimiter set: ( ) < > [ ] { } / %
  return (
    b === 0x28 || b === 0x29 ||
    b === 0x3c || b === 0x3e ||
    b === 0x5b || b === 0x5d ||
    b === 0x7b || b === 0x7d ||
    b === 0x2f || b === 0x25
  );
}
