/**
 * Family Portrait Studio — live multiplayer sync codec.
 *
 * The whole family project (theme, members, votes) is mapped to/from the flat
 * string-keyed entries the collaboration LWW-Map syncs — the SAME transport the
 * design editor uses (end-to-end encrypted; the relay only rebroadcasts
 * ciphertext, see collab/crypto.ts). This is what makes the studio multiplayer:
 *
 *   • each relative opens the invite link on THEIR phone, adds ONE photo →
 *     `member:<id>` updates stream to everyone (per-person upload, no accounts);
 *   • each person taps ❤️ on a variant → `vote:<voterId>` (one vote each, LWW so
 *     re-tapping moves your vote) → everyone sees the tally update live.
 *
 * Per-key entries mean two relatives editing different members never conflict.
 * Photos (data-URI hrefs) ride inside each member's JSON, so a contributed photo
 * reaches the whole family through the same encrypted frames. Pure & unit-tested;
 * the modal owns the React/transport glue via useCollabMap.
 */
import type { FamilyMember, FamilyProject } from './familyStudio.js';

/** A stable, on-device voter identity (so one person = one vote across
 *  reconnects, without any account). Persisted in localStorage. */
let cachedVoter: string | null = null;
export function voterId(): string {
  if (cachedVoter) return cachedVoter;
  try {
    const k = 'pyntra:familyVoter';
    let v = localStorage.getItem(k);
    if (!v) { v = 'v' + Math.random().toString(36).slice(2, 10); localStorage.setItem(k, v); }
    return (cachedVoter = v);
  } catch { return (cachedVoter = 'v' + Math.random().toString(36).slice(2, 10)); }
}

/** Project → synced entries. `theme` + ordered `member:<id>` blobs + `vote:*`. */
export function projectToEntries(p: FamilyProject, votesByVoter: Record<string, number> = {}): Record<string, string> {
  const e: Record<string, string> = {
    theme: p.themeId,
    order: JSON.stringify(p.members.map((m) => m.id)),
  };
  for (const m of p.members) e['member:' + m.id] = JSON.stringify(m);
  for (const [vid, variant] of Object.entries(votesByVoter)) e['vote:' + vid] = String(variant);
  return e;
}

/** Synced entries → { themeId, members[] } (ordered), tolerant of partial/bad data. */
export function entriesToProject(entries: Record<string, string>): { themeId: string; members: FamilyMember[] } {
  const themeId = typeof entries.theme === 'string' && entries.theme ? entries.theme : 'diwali';
  let order: string[] = [];
  try { const o = JSON.parse(entries.order ?? '[]'); if (Array.isArray(o)) order = o.filter((x): x is string => typeof x === 'string'); } catch { /* none */ }
  // Include any member keys not in `order` too (a late joiner may add themselves
  // before the order entry propagates), appended after the ordered ones.
  const seen = new Set(order);
  for (const k in entries) if (k.startsWith('member:')) { const id = k.slice(7); if (!seen.has(id)) { order.push(id); seen.add(id); } }
  const members: FamilyMember[] = [];
  for (const id of order) {
    const raw = entries['member:' + id];
    if (!raw) continue;
    try { const m = JSON.parse(raw) as FamilyMember; if (m && m.id === id && typeof m.name === 'string') members.push({ ...m, costume: m.costume ?? '', photo: m.photo ?? '' }); } catch { /* skip bad */ }
  }
  return { themeId, members };
}

/** Tally per-voter votes into a per-variant count array of length `variants`. */
export function tallyVotes(entries: Record<string, string>, variants: number): number[] {
  const counts = new Array(variants).fill(0) as number[];
  for (const k in entries) {
    if (!k.startsWith('vote:')) continue;
    const v = Number(entries[k]);
    if (Number.isInteger(v) && v >= 0 && v < variants) counts[v] += 1;
  }
  return counts;
}

/** The winning variant index (most ❤️; ties → lowest index; -1 if no votes). */
export function winningVariant(counts: number[]): number {
  let best = -1, bestN = 0;
  counts.forEach((n, i) => { if (n > bestN) { bestN = n; best = i; } });
  return best;
}
