/**
 * Copywriter — generate marketing copy (headlines, captions, hashtags) and
 * rewrite text, entirely on-device with deterministic heuristics. When the user
 * has configured an AI endpoint (see ai/aiClient), the Studio can route through it
 * for higher quality, but everything here works offline with zero model and is
 * fully unit-tested. No content ever leaves the device in the heuristic path.
 */

const STOP = new Set('the a an and or of to in on for with is are was were be by as at this that it from your you our we i about into over under new now get make'.split(' '));

/** Title-case a phrase ("the future of design" → "The Future of Design"). */
export function titleCase(s: string): string {
  const small = new Set(['of', 'the', 'and', 'or', 'to', 'in', 'on', 'for', 'a', 'an', 'with']);
  return s.trim().split(/\s+/).map((w, i) => (i > 0 && small.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join(' ');
}

/** The salient keywords of a topic (stopwords removed, order preserved). */
export function keywords(topic: string, limit = 6): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of topic.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
    if (w.length > 2 && !STOP.has(w) && !seen.has(w)) { seen.add(w); out.push(w); }
  }
  return out.slice(0, limit);
}

/** Deterministic headline variants for a topic. Distinct, ordered, de-duped. */
export function headlines(topic: string, n = 5): string[] {
  const t = titleCase(topic.trim() || 'Your Idea');
  const templates = [
    t,
    `${t}, Reimagined`,
    `Discover ${t}`,
    `The Future of ${t}`,
    `${t} Starts Here`,
    `Meet ${t}`,
    `${t} — Done Right`,
    `Say Hello to ${t}`,
  ];
  const out: string[] = [];
  for (const h of templates) { if (!out.includes(h)) out.push(h); if (out.length >= n) break; }
  return out;
}

/** Hashtags derived from the topic's keywords (CamelCase, deduped, # prefixed). */
export function hashtags(topic: string, n = 5): string[] {
  return keywords(topic, n).map((w) => '#' + w.charAt(0).toUpperCase() + w.slice(1));
}

/** A social caption: a hook line + optional emoji + hashtags. */
export function caption(topic: string, opts: { emoji?: boolean; tags?: boolean } = {}): string {
  const t = titleCase(topic.trim() || 'something great');
  const lead = `${opts.emoji ? '✨ ' : ''}${t} is here — and it changes everything.`;
  const tags = opts.tags === false ? '' : '\n\n' + hashtags(topic, 4).join(' ');
  return (lead + tags).trim();
}

export type RewriteMode = 'shorter' | 'longer' | 'punchier' | 'upper' | 'title';
const FILLER = new Set('very really just quite that actually basically simply literally in order to a lot of really'.split(' '));

/** Rewrite text in a given style — all string transforms, no model. */
export function rewrite(text: string, mode: RewriteMode): string {
  const t = text.trim();
  if (!t) return t;
  switch (mode) {
    case 'upper': return t.toUpperCase();
    case 'title': return titleCase(t);
    case 'punchier': {
      const words = t.replace(/\s+/g, ' ').split(' ').filter((w) => !FILLER.has(w.toLowerCase()));
      const s = words.join(' ').replace(/\.+$/, '');
      return (s.charAt(0).toUpperCase() + s.slice(1) + '!').replace(/!+$/, '!');
    }
    case 'shorter': {
      const words = t.replace(/\s+/g, ' ').split(' ').filter((w) => !FILLER.has(w.toLowerCase()));
      return fitToLength(words.join(' '), Math.max(24, Math.ceil(t.length * 0.6)));
    }
    case 'longer': {
      const lead = t.replace(/\.+$/, '');
      return `${lead} — built to help you do more, faster, with less effort.`;
    }
  }
}

/** Trim to at most `max` characters on a word boundary, adding an ellipsis. */
export function fitToLength(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.5 ? cut.slice(0, sp) : cut).trimEnd() + '…';
}
