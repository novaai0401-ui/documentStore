// Filter-decoder vectors. Covers ASCIIHex, ASCII85, RunLength, LZW,
// and Flate inflate/deflate round-trip.
import {
  asciiHexDecode, ascii85Decode,
  runLengthDecode, lzwDecode,
  inflate, deflate,
} from '../dist/index.js';

const enc = (s) => new TextEncoder().encode(s);
const dec = (u) => new TextDecoder().decode(u);

function expect(name, got, want) {
  if (got !== want) {
    console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    process.exit(1);
  }
  console.log(`OK   ${name}: ${JSON.stringify(got)}`);
}

// ─── ASCIIHexDecode ──────────────────────────────────────────────────────────
expect('hex hello', dec(asciiHexDecode(enc('48656C6C6F>'))), 'Hello');
expect('hex with whitespace', dec(asciiHexDecode(enc('48 65\n6C\t6C 6F>'))), 'Hello');
expect('hex odd nibble pads 0', dec(asciiHexDecode(enc('41>'))), 'A');

// ─── ASCII85Decode ───────────────────────────────────────────────────────────
expect('a85 Man', dec(ascii85Decode(enc('9jqo^~>'))), 'Man ');
expect('a85 Hello', dec(ascii85Decode(enc('87cURDZ~>'))), 'Hello');
expect('a85 Man no term', dec(ascii85Decode(enc('9jqo^'))), 'Man ');
const four0 = ascii85Decode(enc('z~>'));
if (four0.length !== 4 || four0.some((b) => b !== 0)) {
  console.error('FAIL a85 z shortcut');
  process.exit(1);
}
console.log('OK   a85 z shortcut: 4 zero bytes');

// ─── RunLengthDecode ─────────────────────────────────────────────────────────
// length byte 4 (= 5 literal bytes) + "HELLO" + EOD
expect('rle 5 literal', dec(runLengthDecode(new Uint8Array([4, 0x48, 0x45, 0x4C, 0x4C, 0x4F, 0x80]))), 'HELLO');
// 254 = 257-254 = 3 copies of next byte
expect('rle 3x A', dec(runLengthDecode(new Uint8Array([254, 0x41, 0x80]))), 'AAA');
// 1 literal 'A', then 253 (= 4 copies) of 'B'
expect('rle mixed', dec(runLengthDecode(new Uint8Array([0, 0x41, 253, 0x42, 0x80]))), 'ABBBB');
// No EOD — still terminates cleanly when bytes run out.
expect('rle no eod', dec(runLengthDecode(new Uint8Array([2, 0x58, 0x59, 0x5A]))), 'XYZ');

// ─── LZWDecode ───────────────────────────────────────────────────────────────
// Hand-built bit stream — CLEAR(256), 'A'(65), 'B'(66), 'A'(65), EOD(257)
// at 9-bit codes, MSB-first. 45 bits → 6 bytes with 3 trailing zero bits.
//   bytes: 0x80, 0x10, 0x48, 0x44, 0x18, 0x08
const lzwOut = lzwDecode(new Uint8Array([0x80, 0x10, 0x48, 0x44, 0x18, 0x08]));
const lzwResult = dec(lzwOut);
if (!lzwResult.startsWith('ABA')) {
  console.error(`FAIL lzw ABA: got "${lzwResult}" from [${Array.from(lzwOut).map(b => b.toString(16)).join(',')}]`);
  process.exit(1);
}
console.log(`OK   lzw ABA: "${lzwResult}"`);

// ─── Flate inflate / deflate round-trip ──────────────────────────────────────
const sample = enc('The quick brown fox jumps over the lazy dog. '.repeat(40));
const compressed = await deflate(sample);
const back = await inflate(compressed);
if (back.length !== sample.length) {
  console.error(`FAIL flate length: ${back.length} vs ${sample.length}`);
  process.exit(1);
}
for (let i = 0; i < sample.length; i++) {
  if (back[i] !== sample[i]) {
    console.error(`FAIL flate byte ${i}: ${back[i]} vs ${sample[i]}`);
    process.exit(1);
  }
}
const ratio = ((compressed.length / sample.length) * 100).toFixed(1);
console.log(`OK   flate round-trip: ${sample.length}→${compressed.length} bytes (${ratio}%)`);

console.log('\nFILTERS OK');
