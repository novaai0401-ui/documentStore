/**
 * Reminders manager — save the birthdays, anniversaries and milestones you care
 * about. On the day (India time) the home greets you with a ready card. All
 * on-device; optionally turn on this-device notifications so a reminder can pop
 * even when you're not looking at the page.
 */
import { useMemo, useState } from 'react';
import { TkxButton, TkxInput, TkxSelect } from 'tekivex-ui';
import { loadReminders, saveReminders, newReminderId, upcomingReminders, reminderYears, type Reminder, type ReminderType } from './reminders.js';
import { upcomingFestivals, LUNAR_FESTIVALS } from './festivalCalendar.js';
import { enableBackgroundReminders } from './bgReminders.js';
import { MicButton } from './MicButton.js';

export function RemindersModal({ onClose, onMakeCard, onFestival }: { onClose: () => void; onMakeCard: (r: Reminder) => void; onFestival?: (occasion: string) => void }) {
  const [list, setList] = useState<Reminder[]>(() => loadReminders());
  const [name, setName] = useState('');
  const [type, setType] = useState<ReminderType>('birthday');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [notif, setNotif] = useState<'default' | 'granted' | 'denied' | 'unsupported'>(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission));

  const upcoming = useMemo(() => upcomingReminders(list, 366), [list]);
  const persist = (next: Reminder[]) => { setList(next); saveReminders(next); };

  const add = () => {
    if (!name.trim()) { setErr('Please enter a name.'); return; }
    if (!date) { setErr('Please pick a date.'); return; }
    const [y, m, d] = date.split('-').map(Number);
    if (!m || !d) { setErr('Please pick a valid date.'); return; }
    persist([...list, { id: newReminderId(), name: name.trim(), type, month: m, day: d, year: y || undefined, note: note.trim() || undefined }]);
    setName(''); setDate(''); setNote(''); setErr(null);
  };
  const remove = (id: string) => persist(list.filter((r) => r.id !== id));
  const fmt = (r: Reminder) => new Date(2000, r.month - 1, r.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const when = (n: number) => (n === 0 ? 'Today!' : n === 1 ? 'Tomorrow' : `in ${n} days`);
  const askNotif = async () => { try { setNotif(await enableBackgroundReminders()); } catch { /* */ } };

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner rem-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>🔔 Reminders</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <p className="studio-hint">Save the birthdays, anniversaries and milestones you never want to miss. On the day (India time) Pyntra greets you with a ready-to-send card. Everything stays on your device.</p>

          <details className="rem-guide">
            <summary>📖 How do reminders &amp; festival alerts work?</summary>
            <ol>
              <li><strong>Save the dates you care about</strong> — add birthdays, anniversaries and milestones below. They stay on your device only; no account needed.</li>
              <li><strong>Festivals are already tracked</strong> — Diwali, Ganesh Chaturthi, Durga Puja, Chhath, Eid, Christmas and more appear automatically in “Upcoming festivals”. No need to add them yourself.</li>
              <li><strong>Turn on notifications</strong> — tap “🔔 Turn on reminders on this device” at the bottom and allow the browser prompt. You’ll get a heads-up the day before (“🪔 Diwali is tomorrow!”) and a nudge on the day itself.</li>
              <li><strong>On the day</strong> — open Pyntra and a ready-made card for that person or festival greets you on the home screen. Tap “Make card”, personalise, and share on WhatsApp in seconds.</li>
              <li><strong>Tip:</strong> install Pyntra to your home screen (browser menu → “Add to Home Screen”) so notifications work like a normal app.</li>
            </ol>
          </details>

          <div className="rem-form">
            <span className="rem-name-row">
              <TkxInput label="Whose day?" value={name} placeholder="e.g. Aisha" onChange={(e) => setName(e.target.value)} />
              <MicButton onText={(v) => setName((n) => (n ? `${n} ${v}` : v))} title="Say the name" />
            </span>
            <div className="rem-row">
              <label className="rem-field"><span>Occasion</span>
                <TkxSelect size="sm" value={type} options={[{ value: 'birthday', label: '🎂 Birthday' }, { value: 'anniversary', label: '💞 Anniversary' }, { value: 'milestone', label: '🏆 Milestone' }]} onChange={(v) => setType(v as ReminderType)} />
              </label>
              <label className="rem-field"><span>Date</span>
                <input type="date" className="rem-date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
            </div>
            {type === 'milestone' && <TkxInput label="Note (optional)" value={note} placeholder="e.g. 10th work anniversary" onChange={(e) => setNote(e.target.value)} />}
            {err && <span className="cmp-row-note cmp-row-note--warn">{err}</span>}
            <TkxButton variant="solid" colorScheme="primary" size="sm" onClick={add}>＋ Add reminder</TkxButton>
          </div>

          {upcoming.length > 0 ? (
            <div className="rem-list">
              {upcoming.map(({ r, inDays }) => (
                <div key={r.id} className={'rem-item' + (inDays === 0 ? ' rem-item--today' : '')}>
                  <span className="rem-emoji" aria-hidden>{r.type === 'anniversary' ? '💞' : r.type === 'milestone' ? '🏆' : '🎂'}</span>
                  <span className="rem-info">
                    <strong>{r.name}</strong>
                    <span>{fmt(r)}{r.year ? ` · ${reminderYears(r)} yrs` : ''} · {when(inDays)}</span>
                  </span>
                  <TkxButton variant="outline" size="sm" onClick={() => onMakeCard(r)}>Make card</TkxButton>
                  <button className="rem-del" onClick={() => remove(r.id)} aria-label={`Delete ${r.name}`}>🗑</button>
                </div>
              ))}
            </div>
          ) : <p className="rem-empty">No reminders yet — add your first above.</p>}

          <div className="rem-fest">
            <div className="rem-fest-head">📅 Upcoming festivals</div>
            <div className="rem-list">
              {upcomingFestivals(6).map(({ f, inDays, m, d }) => (
                <div key={f.key} className={'rem-item' + (inDays === 0 ? ' rem-item--today' : '')}>
                  <span className="rem-emoji" aria-hidden>{f.emoji}</span>
                  <span className="rem-info">
                    <strong>{f.name}</strong>
                    <span>{new Date(2000, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {when(inDays)}{f.states ? ` · ${f.states.join(', ')}` : ''}</span>
                  </span>
                  {onFestival && <TkxButton variant="outline" size="sm" onClick={() => onFestival(f.cardOccasion)}>Make a card</TkxButton>}
                </div>
              ))}
            </div>
            {onFestival && (
              <button className="rem-fest-more" onClick={() => onFestival('Festivals')}>
                Browse all {LUNAR_FESTIVALS.length + 9}+ festival cards — Diwali, Holi, Eid, Onam & more →
              </button>
            )}
            <span className="rem-fest-note">Dates follow the standard Indian calendar; regional almanacs may differ by a day, and Eid depends on the moon.</span>
          </div>

          {notif !== 'unsupported' && (
            <div className="rem-notif">
              {notif === 'granted'
                ? <span className="rem-notif-on">🔔 Notifications on for this device — you’ll be nudged on the day.</span>
                : <TkxButton variant="ghost" size="sm" onClick={() => void askNotif()} disabled={notif === 'denied'}>{notif === 'denied' ? 'Notifications blocked in your browser settings' : '🔔 Turn on reminders on this device'}</TkxButton>}
            </div>
          )}
        </div>
        <div className="resume-foot"><TkxButton variant="ghost" size="sm" onClick={onClose}>Close</TkxButton></div>
      </div>
    </div>
  );
}
