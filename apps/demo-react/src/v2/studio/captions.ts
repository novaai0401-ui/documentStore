/**
 * Captions / subtitles — pure helpers shared by the video editor (auto-captions,
 * SRT import/export) and Script→Reel (turn typed text into timed caption cues).
 * No browser APIs here; rendering + timing-to-overlay glue lives in the modals.
 */

export interface Cue {
  /** Start on the movie timeline, seconds. */
  startS: number;
  /** End on the movie timeline, seconds. */
  endS: number;
  text: string;
}

/** Estimate how long `text` takes to say, at `wpm` words per minute (floor 0.8s). */
export function speakSeconds(text: string, wpm = 150): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(0.8, (words / Math.max(60, wpm)) * 60);
}

/**
 * Break a script into short, readable caption chunks: split on sentence
 * boundaries and newlines, then wrap any long sentence to ≤ `maxChars` on word
 * boundaries. Empty input → []. This is what makes "type a paragraph" become
 * caption-sized lines.
 */
export function splitScript(script: string, maxChars = 42): string[] {
  const sentences = script
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const s of sentences) {
    if (s.length <= maxChars) { out.push(s); continue; }
    let line = '';
    for (const word of s.split(' ')) {
      if (line && (line + ' ' + word).length > maxChars) { out.push(line); line = word; }
      else line = line ? line + ' ' + word : word;
    }
    if (line) out.push(line);
  }
  return out;
}

/**
 * Lay caption chunks across `[0, durationS]`, each chunk's share proportional to
 * how long it takes to say (with a small readable minimum), scaled to fill the
 * duration exactly. Returns sequential, non-overlapping cues.
 */
export function autoTimeCaptions(chunks: string[], durationS: number, minS = 1.2): Cue[] {
  const list = chunks.map((c) => c.trim()).filter(Boolean);
  if (!list.length || durationS <= 0) return [];
  const weights = list.map((c) => Math.max(minS, speakSeconds(c)));
  const sum = weights.reduce((a, b) => a + b, 0);
  const scale = durationS / sum;
  const cues: Cue[] = [];
  let t = 0;
  for (let i = 0; i < list.length; i++) {
    const dur = weights[i]! * scale;
    const start = t;
    const end = i === list.length - 1 ? durationS : t + dur;
    cues.push({ startS: Math.max(0, start), endS: Math.min(durationS, end), text: list[i]! });
    t = end;
  }
  return cues;
}

/** Total time to narrate a list of chunks (for sizing a script→reel). */
export const scriptSeconds = (chunks: string[]): number =>
  chunks.reduce((s, c) => s + speakSeconds(c), 0);

// ── SRT (SubRip) ────────────────────────────────────────────────────────────

const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, '0');

/** Seconds → "HH:MM:SS,mmm". */
export function srtTime(sec: number): string {
  const s = Math.max(0, sec);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const total = Math.floor(s);
  return `${pad(total / 3600)}:${pad((total % 3600) / 60)}:${pad(total % 60)},${pad(ms, 3)}`;
}

/** "HH:MM:SS,mmm" (or with '.') → seconds. Returns NaN when unparseable. */
export function parseSrtTime(t: string): number {
  const m = t.trim().match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/);
  if (!m) return NaN;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000;
}

/** Serialize cues to an SRT file body. */
export function toSrt(cues: Cue[]): string {
  return cues
    .map((c, i) => `${i + 1}\n${srtTime(c.startS)} --> ${srtTime(c.endS)}\n${c.text}`)
    .join('\n\n') + (cues.length ? '\n' : '');
}

/** Parse an SRT file body into cues (tolerant of \r\n, missing index lines). */
export function parseSrt(srt: string): Cue[] {
  const blocks = srt.replace(/\r\n/g, '\n').split(/\n\s*\n/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter((l, i) => l !== '' || i > 0);
    const tcIdx = lines.findIndex((l) => l.includes('-->'));
    if (tcIdx === -1) continue;
    const [a, b] = lines[tcIdx]!.split('-->');
    const startS = parseSrtTime(a ?? '');
    const endS = parseSrtTime(b ?? '');
    if (Number.isNaN(startS) || Number.isNaN(endS)) continue;
    const text = lines.slice(tcIdx + 1).join('\n').trim();
    if (text) cues.push({ startS, endS, text });
  }
  return cues;
}
