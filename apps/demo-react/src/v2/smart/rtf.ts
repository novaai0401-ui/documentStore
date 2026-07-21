/**
 * RTF → plain text — ours. A small, correct-enough RTF tokenizer: it tracks
 * group depth, skips the non-body "destination" groups (font/colour/style
 * tables, info, embedded pictures), decodes \'xx hex and \uN unicode escapes,
 * and maps \par/\line/\tab to whitespace. Enough to recover the readable text
 * of typical RTF documents; formatting is dropped (text-first).
 */
const IGNORED = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'themedata', 'colorschememapping', 'datastore', 'latentstyles', 'listtable', 'rsidtbl', 'generator']);

export function rtfToText(rtf: string): string {
  let out = '';
  let i = 0;
  const n = rtf.length;
  // Per-group state: whether the group's text is ignored, and the \uc skip count.
  const stack: Array<{ ignore: boolean; ucSkip: number }> = [{ ignore: false, ucSkip: 1 }];
  let top = () => stack[stack.length - 1]!;
  let skip = 0; // characters to skip after a \uN (unicode fallback)

  const emit = (s: string) => { if (!top().ignore) out += s; };

  while (i < n) {
    const ch = rtf[i]!;
    if (ch === '{') { stack.push({ ...top() }); i++; continue; }
    if (ch === '}') { if (stack.length > 1) stack.pop(); i++; continue; }
    if (ch === '\\') {
      const next = rtf[i + 1]!;
      // Control symbol (e.g. \', \\, \{, \})
      if (next === "'") {
        const hex = rtf.substr(i + 2, 2);
        i += 4;
        if (skip > 0) { skip--; continue; }
        emit(String.fromCharCode(parseInt(hex, 16) || 0));
        continue;
      }
      if (next === '\\' || next === '{' || next === '}') { emit(next); i += 2; continue; }
      if (next === '*') { top().ignore = true; i += 2; continue; } // ignorable destination
      if (next === '\n' || next === '\r') { emit('\n'); i += 2; continue; }
      // Control word: letters, optional minus + digits, optional single trailing space.
      const mWord = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i));
      if (mWord) {
        const word = mWord[1]!;
        const param = mWord[2] ? Number(mWord[2]) : undefined;
        i += mWord[0].length;
        if (IGNORED.has(word)) top().ignore = true;
        else if (word === 'par' || word === 'sect' || word === 'line') emit('\n');
        else if (word === 'tab') emit('\t');
        else if (word === 'uc') top().ucSkip = param ?? 1;
        else if (word === 'u' && param !== undefined) {
          const code = param < 0 ? param + 65536 : param;
          if (!top().ignore) emit(String.fromCharCode(code));
          skip = top().ucSkip;
        }
        continue;
      }
      i++; // lone backslash
      continue;
    }
    if (ch === '\r' || ch === '\n') { i++; continue; } // raw line breaks are not text in RTF
    i++;
    if (skip > 0) { skip--; continue; }
    emit(ch);
  }
  void top;
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
