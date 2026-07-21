/**
 * Accessible command palette (⌘K / Ctrl-K). A single keyboard-first launcher for
 * every primary action — open a file, start a design, build a résumé, switch
 * theme. Pure matching/ranking lives in commands.ts; this is the dialog shell:
 * role="dialog" + aria-modal, a labelled listbox with roving aria-activedescendant,
 * full arrow/Enter/Escape keyboard control, focus restoration, and an aria-live
 * count for screen readers.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { filterCommands, type Command } from './commands.js';

export function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const results = useMemo(() => filterCommands(commands, query), [commands, query]);

  // Keep the active row in range as results shrink, and remember focus to restore.
  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => { restoreRef.current?.focus?.(); };
  }, []);

  // Scroll the active option into view as the user arrows through.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (cmd: Command | undefined) => { if (cmd) { onClose(); cmd.run(); } };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(results.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[active]); }
  };

  return (
    <div className="cmdk" onMouseDown={onClose}>
      <div
        className="cmdk-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Command menu"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="cmdk-search">
          <span className="cmdk-search-icon" aria-hidden>⌕</span>
          <input
            ref={inputRef}
            className="cmdk-input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={results[active] ? `cmdk-opt-${results[active].id}` : undefined}
            aria-label="Search commands"
            placeholder="Search actions… (e.g. resume, design, theme)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="cmdk-esc">esc</kbd>
        </div>
        <div className="cmdk-list" id="cmdk-list" role="listbox" aria-label="Commands" ref={listRef}>
          {results.length === 0 && <div className="cmdk-empty">No matching actions</div>}
          {results.map((c, i) => (
            <button
              key={c.id}
              id={`cmdk-opt-${c.id}`}
              type="button"
              data-i={i}
              role="option"
              aria-selected={i === active}
              className={'cmdk-opt' + (i === active ? ' is-active' : '')}
              onMouseMove={() => setActive(i)}
              onClick={() => choose(c)}
            >
              {c.group && <span className="cmdk-opt-group">{c.group}</span>}
              <span className="cmdk-opt-title">{c.title}</span>
              {c.hint && <span className="cmdk-opt-hint">{c.hint}</span>}
            </button>
          ))}
        </div>
        <div className="cmdk-foot">
          <span aria-live="polite">{results.length} action{results.length === 1 ? '' : 's'}</span>
          <span className="cmdk-foot-keys"><kbd>↑</kbd><kbd>↓</kbd> navigate · <kbd>↵</kbd> run · <kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
