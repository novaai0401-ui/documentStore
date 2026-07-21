/**
 * Pure command-palette matching. A subsequence fuzzy match that rewards
 * consecutive hits and prefix matches, so typing "rb" surfaces "Resume builder".
 * Kept framework-free and unit-tested; the palette UI consumes it.
 */
export interface Command {
  id: string;
  title: string;
  hint?: string;
  group?: string;
  keywords?: string;
  run: () => void;
}

/** Subsequence score for `text` against `query`; -1 if not all chars match. */
export function fuzzyScore(text: string, query: string): number {
  if (!query) return 0;
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  let ti = 0, score = 0, streak = 0;
  for (const ch of q) {
    const idx = t.indexOf(ch, ti);
    if (idx < 0) return -1;
    streak = idx === ti ? streak + 1 : 0;
    score += 1 + streak + (idx === 0 ? 3 : 0);
    ti = idx + 1;
  }
  return score;
}

/** Filter + rank commands for a query (best first). Empty query returns all. */
export function filterCommands(commands: Command[], query: string): Command[] {
  if (!query.trim()) return commands;
  return commands
    .map((c) => ({ c, s: Math.max(fuzzyScore(c.title, query), fuzzyScore(`${c.keywords ?? ''} ${c.group ?? ''}`, query)) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c);
}
