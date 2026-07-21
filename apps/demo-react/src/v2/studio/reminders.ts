/**
 * Personal date reminders — birthdays, anniversaries and milestones the user
 * saves so that ON THE DAY (in India Standard Time) the app greets them with a
 * ready-to-send card. Everything is stored on-device (localStorage); there is no
 * account and nothing leaves the browser. Background push (when the app is
 * closed) is a separate, server-backed feature — this module powers the
 * on-open "today" experience and drives any notification we can show locally.
 */
import { newElId, type Design, type Element, type TextEl } from './model.js';

export type ReminderType = 'birthday' | 'anniversary' | 'milestone';
export interface Reminder { id: string; name: string; type: ReminderType; month: number; day: number; year?: number; note?: string }

const KEY = 'pyntra:reminders';

export function loadReminders(): Reminder[] {
  try { const raw = localStorage.getItem(KEY); if (!raw) return []; const v = JSON.parse(raw); return Array.isArray(v) ? v.filter(isReminder) : []; }
  catch { return []; }
}
export function saveReminders(list: Reminder[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage full/blocked — non-fatal */ }
  // Mirror to IndexedDB so the service worker can notify on the day (best-effort).
  try { void import('./bgReminders.js').then((m) => m.mirrorReminders(list)).catch(() => { /* */ }); } catch { /* */ }
}
function isReminder(r: unknown): r is Reminder {
  const o = r as Reminder;
  return !!o && typeof o.id === 'string' && typeof o.name === 'string' && typeof o.month === 'number' && typeof o.day === 'number';
}
export function newReminderId(): string { return 'r' + Math.abs(((loadReminders().length + 1) * 2654435761) >>> 0).toString(36) + (loadReminders().length); }

/** Today's date in India Standard Time (the app's primary audience). */
export function istToday(now?: Date): { y: number; m: number; d: number } {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
  // en-CA formats as YYYY-MM-DD. If `now` is omitted the caller is in a browser
  // (real clock); tests pass a fixed date.
  const parts = f.format(now ?? nowSafe()).split('-').map(Number);
  return { y: parts[0]!, m: parts[1]!, d: parts[2]! };
}
// Wrapped so environments without a live clock (rare) don't throw.
function nowSafe(): Date { try { return new Date(); } catch { return new Date(0); } }

/** Reminders that fall on the given day (defaults to today, IST). */
export function remindersToday(list: Reminder[], on?: { m: number; d: number }): Reminder[] {
  const t = on ?? istToday();
  return list.filter((r) => r.month === t.m && r.day === t.d);
}

/** Reminders in the next `days` days (for an "upcoming" list), each with how
 *  many days away it is (0 = today). Ignores the year (recurring). */
export function upcomingReminders(list: Reminder[], days = 30, on?: { y: number; m: number; d: number }): { r: Reminder; inDays: number }[] {
  const t = on ?? istToday();
  const base = Date.UTC(t.y, t.m - 1, t.d);
  return list
    .map((r) => {
      for (let add = 0; add <= days; add++) {
        const dt = new Date(base + add * 86400000);
        if (dt.getUTCMonth() + 1 === r.month && dt.getUTCDate() === r.day) return { r, inDays: add };
      }
      return null;
    })
    .filter((x): x is { r: Reminder; inDays: number } => x !== null)
    .sort((a, b) => a.inDays - b.inDays);
}

/** The gallery occasion tab that fits a reminder type. */
export function occasionForReminder(type: ReminderType): string {
  return type === 'anniversary' ? 'Anniversary' : type === 'milestone' ? 'Congratulations' : 'Birthday';
}

/** How many years, if the birth/start year is known (e.g. "Ravi turns 30"). */
export function reminderYears(r: Reminder, on?: { y: number }): number | null {
  if (!r.year) return null;
  const y = (on ?? istToday()).y;
  return y - r.year;
}

// ── A ready personalised card for the day ────────────────────────────────────
const W = 1500, H = 2100;
const EMO = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const SANS = 'Inter, system-ui, sans-serif';
const SCRIPT = "'Brush Script MT','Segoe Script','Snell Roundhand',cursive";
const t = (o: Partial<TextEl> & { x: number; y: number; w: number; h: number; text: string }): TextEl => ({ id: newElId(), type: 'text', size: 48, color: '#0f172a', font: SANS, weight: 700, align: 'center', rotation: 0, ...o });
const ellipse = (x: number, y: number, w: number, h: number, fill: string, extra: Partial<Element> = {}): Element => ({ id: newElId(), type: 'ellipse', x, y, w, h, fill, ...extra } as Element);
const emoji = (x: number, y: number, size: number, ch: string, rot = 0): TextEl => t({ x, y, w: size * 1.4, h: size * 1.4, text: ch, size, font: EMO, rotation: rot });

/** Build a personalised card for a reminder (used by the "today" banner so the
 *  card is ready the moment they open the app). */
export function makeReminderDesign(r: Reminder, on?: { y: number }): Design {
  const yrs = reminderYears(r, on);
  const anniv = r.type === 'anniversary';
  const milestone = r.type === 'milestone';
  const bg = anniv ? '#4a0519' : milestone ? '#0b3d2e' : '#1f2b4d';
  const accent = anniv ? '#fb7185' : milestone ? '#fcd34d' : '#f5d78a';
  const soft = anniv ? '#7a1533' : milestone ? '#14532d' : '#2a3a63';
  const em = anniv ? ['💞', '❤️', '🌹', '✨'] : milestone ? ['🏆', '🎉', '✨', '🎊'] : ['🎂', '🎈', '🎉', '✨'];
  const wish = anniv ? 'Happy Anniversary' : milestone ? 'Congratulations' : 'Happy Birthday';
  const line2 = milestone ? (r.note || 'On your special day') : yrs ? `${yrs}${anniv ? ' wonderful years' : ''}` : '';
  return {
    w: W, h: H, background: bg,
    elements: [
      ellipse(W / 2 - 520, 300, 1040, 1040, soft, { opacity: 0.6 }),
      emoji(150, 250, 120, em[0]!, -12), emoji(1180, 260, 120, em[1]!, 12),
      emoji(160, 1560, 120, em[2]!, 10), emoji(1180, 1560, 120, em[3]!, -10),
      t({ x: 100, y: 620, w: 1300, h: 200, text: wish, size: 130, color: accent, weight: 700, font: SCRIPT }),
      t({ x: 100, y: 900, w: 1300, h: 160, text: r.name, size: 120, color: '#ffffff', weight: 800, font: SANS }),
      ...(line2 ? [t({ x: 150, y: 1120, w: 1200, h: 90, text: line2, size: 60, color: accent, weight: 600 })] : []),
      t({ x: 150, y: 1640, w: 1200, h: 80, text: anniv ? 'With all my love' : 'Wishing you the very best', size: 48, color: '#e2e8f0' }),
    ],
  };
}
