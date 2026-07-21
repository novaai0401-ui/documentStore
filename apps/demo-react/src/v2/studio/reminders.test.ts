import { describe, it, expect } from 'vitest';
import { remindersToday, upcomingReminders, occasionForReminder, reminderYears, makeReminderDesign, type Reminder } from './reminders.js';

const list: Reminder[] = [
  { id: 'a', name: 'Aisha', type: 'birthday', month: 7, day: 19, year: 1995 },
  { id: 'b', name: 'Mom & Dad', type: 'anniversary', month: 8, day: 2, year: 1990 },
  { id: 'c', name: 'Ravi turns 30', type: 'milestone', month: 7, day: 25 },
];

describe('reminders', () => {
  it('finds reminders for a given day', () => {
    expect(remindersToday(list, { m: 7, d: 19 }).map((r) => r.id)).toEqual(['a']);
    expect(remindersToday(list, { m: 1, d: 1 })).toEqual([]);
  });

  it('lists upcoming reminders in order with days-away (0 = today)', () => {
    const up = upcomingReminders(list, 30, { y: 2026, m: 7, d: 19 });
    expect(up[0]!.r.id).toBe('a');
    expect(up[0]!.inDays).toBe(0);
    expect(up[1]!.r.id).toBe('c');
    expect(up[1]!.inDays).toBe(6);
    // Aug 2 is 14 days after Jul 19.
    expect(up.find((u) => u.r.id === 'b')!.inDays).toBe(14);
  });

  it('maps a reminder type to the right occasion tab', () => {
    expect(occasionForReminder('birthday')).toBe('Birthday');
    expect(occasionForReminder('anniversary')).toBe('Anniversary');
    expect(occasionForReminder('milestone')).toBe('Congratulations');
  });

  it('computes years when a start year is known', () => {
    expect(reminderYears(list[0]!, { y: 2026 })).toBe(31);
    expect(reminderYears(list[2]!, { y: 2026 })).toBeNull();
  });

  it('builds a personalised card design with the name', () => {
    const d = makeReminderDesign(list[0]!, { y: 2026 });
    expect(d.elements.some((e) => e.type === 'text' && (e as { text: string }).text === 'Aisha')).toBe(true);
    expect(d.elements.length).toBeGreaterThan(3);
  });
});
