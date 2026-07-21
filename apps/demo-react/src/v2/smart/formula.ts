/**
 * Spreadsheet formula evaluation — a small, self-contained parser + evaluator.
 * Cells beginning with "=" are parsed and computed against the rest of the grid:
 * =SUM(A1:A3), =A1*B2, =AVERAGE(...), arithmetic, parens, common functions. Pure
 * and synchronous, with cycle protection; used to show live values in both the
 * cell grid and the gridstorm Table view. A1 = top-left cell (row 1, col A).
 *
 * (Previously delegated to @gridstorm/plugin-formula; the unified `gridstorm`
 * package only exposes formula as a grid plugin, not a standalone evaluator, so
 * this grid-independent engine lives here.)
 */

// ── Tiny formula engine ───────────────────────────────────────────────────────
type CellResolver = (rowIndex: number, colIndex: number) => unknown;
type Node =
  | { k: 'num'; v: number }
  | { k: 'cell'; row: number; col: number }
  | { k: 'range'; r0: number; c0: number; r1: number; c1: number }
  | { k: 'un'; op: string; x: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'fn'; name: string; args: Node[] };

const colToIndex = (letters: string): number => {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

type Tok = { t: string; v?: string; col?: number; row?: number };
function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === ' ' || c === '\t') { i++; continue; }
    if (/[0-9.]/.test(c)) { let j = i + 1; while (j < src.length && /[0-9.]/.test(src[j]!)) j++; toks.push({ t: 'num', v: src.slice(i, j) }); i = j; continue; }
    if (/[A-Za-z]/.test(c)) {
      let j = i; while (j < src.length && /[A-Za-z]/.test(src[j]!)) j++;
      const letters = src.slice(i, j);
      let k = j; while (k < src.length && /[0-9]/.test(src[k]!)) k++;
      if (k > j) { toks.push({ t: 'cell', col: colToIndex(letters), row: Number(src.slice(j, k)) - 1 }); i = k; continue; }
      toks.push({ t: 'fn', v: letters.toUpperCase() }); i = j; continue; // letters with no digits → function name
    }
    if ('+-*/^%'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    if (c === '(') { toks.push({ t: 'lp' }); i++; continue; }
    if (c === ')') { toks.push({ t: 'rp' }); i++; continue; }
    if (c === ',') { toks.push({ t: 'comma' }); i++; continue; }
    if (c === ':') { toks.push({ t: 'colon' }); i++; continue; }
    throw new Error('bad char ' + c);
  }
  return toks;
}

function parse(toks: Tok[]): Node {
  let p = 0;
  const peek = () => toks[p];
  const eat = (t?: string) => { const tk = toks[p++]; if (t && (!tk || tk.t !== t)) throw new Error('expected ' + t); return tk!; };

  const addSub = (): Node => { let a = mulDiv(); while (peek()?.t === 'op' && (peek()!.v === '+' || peek()!.v === '-')) { const op = eat('op').v!; a = { k: 'bin', op, a, b: mulDiv() }; } return a; };
  const mulDiv = (): Node => { let a = pow(); while (peek()?.t === 'op' && '*/%'.includes(peek()!.v!)) { const op = eat('op').v!; a = { k: 'bin', op, a, b: pow() }; } return a; };
  const pow = (): Node => { const a = unary(); if (peek()?.t === 'op' && peek()!.v === '^') { eat('op'); return { k: 'bin', op: '^', a, b: pow() }; } return a; };
  const unary = (): Node => { if (peek()?.t === 'op' && peek()!.v === '-') { eat('op'); return { k: 'un', op: '-', x: unary() }; } if (peek()?.t === 'op' && peek()!.v === '+') { eat('op'); return unary(); } return primary(); };
  const primary = (): Node => {
    const tk = peek();
    if (!tk) throw new Error('unexpected end');
    if (tk.t === 'num') { eat('num'); return { k: 'num', v: Number(tk.v) }; }
    if (tk.t === 'lp') { eat('lp'); const e = addSub(); eat('rp'); return e; }
    if (tk.t === 'cell') {
      eat('cell');
      if (peek()?.t === 'colon') { eat('colon'); const end = eat('cell'); return { k: 'range', r0: tk.row!, c0: tk.col!, r1: end.row!, c1: end.col! }; }
      return { k: 'cell', row: tk.row!, col: tk.col! };
    }
    if (tk.t === 'fn') {
      eat('fn'); eat('lp');
      const args: Node[] = [];
      if (peek()?.t !== 'rp') { args.push(addSub()); while (peek()?.t === 'comma') { eat('comma'); args.push(addSub()); } }
      eat('rp');
      return { k: 'fn', name: tk.v!, args };
    }
    throw new Error('unexpected token ' + tk.t);
  };
  const out = addSub();
  if (p !== toks.length) throw new Error('trailing tokens');
  return out;
}

/** Coerce a resolved cell value to a number for arithmetic ('' → 0; NaN throws). */
const toNum = (v: unknown): number => {
  if (typeof v === 'number') return v;
  if (v == null || v === '') return 0;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error('NaN');
  return n;
};

/** Flatten a node's value into the finite numbers it contributes (for functions). */
function collectNums(node: Node, ev: (n: Node) => unknown, resolve: CellResolver): number[] {
  if (node.k === 'range') {
    const out: number[] = [];
    const [r0, r1] = [Math.min(node.r0, node.r1), Math.max(node.r0, node.r1)];
    const [c0, c1] = [Math.min(node.c0, node.c1), Math.max(node.c0, node.c1)];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const x = resolve(r, c); const n = typeof x === 'number' ? x : Number(x); if (x !== '' && x != null && !Number.isNaN(n)) out.push(n); }
    return out;
  }
  const v = ev(node);
  const n = typeof v === 'number' ? v : Number(v);
  return v !== '' && v != null && !Number.isNaN(n) ? [n] : [];
}

const FNS: Record<string, (xs: number[]) => number> = {
  SUM: (xs) => xs.reduce((a, b) => a + b, 0),
  PRODUCT: (xs) => xs.reduce((a, b) => a * b, 1),
  AVERAGE: (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0),
  AVG: (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0),
  MIN: (xs) => (xs.length ? Math.min(...xs) : 0),
  MAX: (xs) => (xs.length ? Math.max(...xs) : 0),
  COUNT: (xs) => xs.length,
  MEDIAN: (xs) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; },
};

function evalFormula(src: string, resolve: CellResolver): number | string {
  const ast = parse(tokenize(src));
  const ev = (n: Node): number => {
    switch (n.k) {
      case 'num': return n.v;
      case 'cell': return toNum(resolve(n.row, n.col));
      case 'range': throw new Error('range outside function');
      case 'un': return -ev(n.x);
      case 'bin': {
        const a = ev(n.a), b = ev(n.b);
        switch (n.op) { case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return a / b; case '^': return Math.pow(a, b); case '%': return a % b; default: throw new Error('op'); }
      }
      case 'fn': {
        const fn = FNS[n.name];
        if (!fn) throw new Error('unknown fn ' + n.name);
        return fn(n.args.flatMap((arg) => collectNums(arg, ev, resolve)));
      }
    }
  };
  return ev(ast);
}

export function isFormula(v: string): boolean {
  return typeof v === 'string' && v.trimStart().startsWith('=');
}

/** Compute a display grid: formula cells become their computed value, others pass through. */
export function evaluateSheet(rows: string[][]): string[][] {
  const cache = new Map<string, unknown>();
  const active = new Set<string>();

  const cellValue = (rowIndex: number, colIndex: number): unknown => {
    const key = `${rowIndex}:${colIndex}`;
    if (cache.has(key)) return cache.get(key);
    if (active.has(key)) return '#CYCLE';
    const raw = rows[rowIndex]?.[colIndex] ?? '';
    let out: unknown;
    if (isFormula(raw)) {
      active.add(key);
      try {
        out = evalFormula(raw.trimStart().slice(1), cellValue);
      } catch {
        out = '#ERROR';
      }
      active.delete(key);
    } else if (raw.trim() !== '' && !Number.isNaN(Number(raw))) {
      out = Number(raw); // numeric literal → number so arithmetic works
    } else {
      out = raw;
    }
    cache.set(key, out);
    return out;
  };

  return rows.map((row, r) =>
    row.map((raw, c) => {
      if (!isFormula(raw)) return raw;
      const v = cellValue(r, c);
      return v == null ? '' : String(v);
    }),
  );
}

export interface ColumnStats { header: string; count: number; sum: number; avg: number; min: number; max: number }

/**
 * Per-column numeric stats over the *display* (computed) grid, treating row 0 as
 * the header. Columns with no numeric data are omitted — powers the status bar.
 */
export function columnStats(display: string[][]): ColumnStats[] {
  const header = display[0] ?? [];
  const out: ColumnStats[] = [];
  const cols = Math.max(0, ...display.map((r) => r.length));
  for (let c = 0; c < cols; c++) {
    const nums: number[] = [];
    for (let r = 1; r < display.length; r++) {
      const v = (display[r]?.[c] ?? '').trim();
      if (v !== '' && !Number.isNaN(Number(v))) nums.push(Number(v));
    }
    if (nums.length === 0) continue;
    const sum = nums.reduce((a, b) => a + b, 0);
    out.push({
      header: (header[c] ?? '').trim() || `Column ${c + 1}`,
      count: nums.length,
      sum,
      avg: sum / nums.length,
      min: Math.min(...nums),
      max: Math.max(...nums),
    });
  }
  return out;
}
