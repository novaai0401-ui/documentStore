/**
 * Tools launcher — an Adobe-style grouped popover that gathers every studio tool
 * behind one toolbar button, so the bar stays clean as the catalogue grows.
 * Includes a search box (filters by name/description) and full keyboard
 * navigation (↑/↓/←/→ to move, Enter to run, Esc to close, type to filter).
 * Closes on outside-click and Escape.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TkxButton } from 'tekivex-ui';
import { Icon, type IconName } from './icons.js';

export interface ToolItem { id: string; label: string; desc: string; icon: IconName; run: () => void }
export interface ToolGroup { title: string; items: ToolItem[] }

export function ToolsMenu({ groups, label = 'Tools' }: { groups: ToolGroup[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Filtered groups + a flat list (render order) for keyboard navigation.
  const { shownGroups, flat } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const sg = groups
      .map((g) => ({ ...g, items: needle ? g.items.filter((it) => (it.label + ' ' + it.desc).toLowerCase().includes(needle)) : g.items }))
      .filter((g) => g.items.length > 0);
    return { shownGroups: sg, flat: sg.flatMap((g) => g.items) };
  }, [groups, q]);

  useEffect(() => { if (open) { setQ(''); setActive(0); requestAnimationFrame(() => searchRef.current?.focus()); } }, [open]);
  useEffect(() => { setActive(0); }, [q]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // On small screens the popover is pinned (fixed) just below the toolbar via the
  // --ws-bar-bottom CSS var. The toolbar wraps to several rows on phones, so a
  // hardcoded offset overlapped it; measure the live bar height instead. Layout
  // effect + resize listener keep it correct after wraps/orientation changes.
  useLayoutEffect(() => {
    if (!open) return;
    const bar = ref.current?.closest('.ws-bar') as HTMLElement | null;
    const root = document.documentElement;
    const setVar = () => { if (bar) root.style.setProperty('--ws-bar-bottom', `${Math.round(bar.getBoundingClientRect().bottom + 6)}px`); };
    setVar();
    window.addEventListener('resize', setVar);
    return () => { window.removeEventListener('resize', setVar); root.style.removeProperty('--ws-bar-bottom'); };
  }, [open]);

  const cols = 2; // grid columns — arrow Left/Right step by 1, Up/Down by a row
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
    if (!flat.length) return;
    const move = (delta: number) => { e.preventDefault(); setActive((i) => Math.max(0, Math.min(flat.length - 1, i + delta))); };
    if (e.key === 'ArrowDown') move(cols);
    else if (e.key === 'ArrowUp') move(-cols);
    else if (e.key === 'ArrowRight') move(1);
    else if (e.key === 'ArrowLeft') move(-1);
    else if (e.key === 'Enter') { e.preventDefault(); const it = flat[active]; if (it) { setOpen(false); it.run(); } }
  };

  let flatIdx = -1;
  return (
    <div className="tools-menu-wrap" ref={ref}>
      <TkxButton
        variant={open ? 'solid' : 'ghost'}
        colorScheme={open ? 'primary' : undefined}
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        leftIcon={<Icon name="tools" />}
        onClick={() => setOpen((o) => !o)}
        title="All tools"
      >
        {label} <span className="tools-caret" aria-hidden>▾</span>
      </TkxButton>
      {open && (
        <div className="tools-menu" role="menu" onKeyDown={onKey}>
          <input
            ref={searchRef}
            className="tools-menu-search"
            type="search"
            value={q}
            placeholder="Search tools…"
            aria-label="Search tools"
            onChange={(e) => setQ(e.target.value)}
          />
          {shownGroups.length === 0 && <div className="tools-menu-empty">No tools match “{q}”.</div>}
          {shownGroups.map((g) => (
            <div key={g.title} className="tools-menu-group">
              <div className="tools-menu-title">{g.title}</div>
              <div className="tools-menu-grid">
                {g.items.map((it) => {
                  flatIdx++;
                  const idx = flatIdx;
                  return (
                    <button
                      key={it.id}
                      className={'tools-menu-item' + (idx === active ? ' tools-menu-item--active' : '')}
                      role="menuitem"
                      tabIndex={-1}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => { setOpen(false); it.run(); }}
                      title={it.desc}
                    >
                      <span className="tools-menu-ico"><Icon name={it.icon} size={20} /></span>
                      <span className="tools-menu-label">{it.label}</span>
                      <span className="tools-menu-desc">{it.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
