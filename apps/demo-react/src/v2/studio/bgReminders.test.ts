import { describe, it, expect } from 'vitest';
import { todayNotification, dayNotification } from './bgReminders.js';

describe('background reminder notification', () => {
  it('is null when nothing is today', () => {
    expect(todayNotification([], [])).toBeNull();
  });
  it('greets a personal reminder', () => {
    const n = todayNotification(['Aisha'], [])!;
    expect(n.title).toContain('special day');
    expect(n.body).toContain('Aisha');
    expect(n.body).toContain('Pyntra');
  });
  it('leads with the festival name when only a festival is today', () => {
    const n = todayNotification([], ['Diwali'])!;
    expect(n.title).toContain('Diwali');
  });
  it('combines reminders and festivals', () => {
    const n = todayNotification(['Aisha'], ['Republic Day'])!;
    expect(n.body).toContain('Aisha');
    expect(n.body).toContain('Republic Day');
  });
  it('builds a day-before heads-up for festivals and reminders', () => {
    expect(dayNotification([], [], 'tomorrow')).toBeNull();
    const fest = dayNotification([], ['🪔 Diwali'], 'tomorrow')!;
    expect(fest.title).toContain('Diwali');
    expect(fest.title).toContain('tomorrow');
    expect(fest.body).toContain('get your card ready');
    const both = dayNotification(['Aisha'], ['Chhath Puja'], 'tomorrow')!;
    expect(both.title).toContain('tomorrow');
    expect(both.body).toContain('Aisha');
    expect(both.body).toContain('Chhath Puja');
    // 'today' path stays identical to todayNotification.
    expect(dayNotification(['Aisha'], [], 'today')).toEqual(todayNotification(['Aisha'], []));
  });
});
