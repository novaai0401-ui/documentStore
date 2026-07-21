/**
 * Render a comb-formatted text field as N segmented single-character
 * cells, per PDF spec §12.7.4.3 (/Ff bit 25 set + /MaxLen N).
 *
 * Each cell is one character. Typing in cell K auto-advances focus to
 * cell K+1. Backspace at an empty cell jumps back. Paste fills cells
 * left-to-right starting from the focused position. Returns the joined
 * string via onChange on every edit.
 *
 * Adapters can use this primitive directly (`<CombInput value=... />`)
 * inside their Text/Multiline renderer when `comb && maxLength` is true.
 */
import { useEffect, useRef, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from 'react';

export interface CombInputProps {
  id: string;
  value: string;
  maxLength: number;
  readOnly?: boolean;
  onChange: (next: string) => void;
}

export function CombInput({ id, value, maxLength, readOnly, onChange }: CombInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  // Right-pad/truncate to maxLength so we always render N cells.
  const cells: string[] = [];
  for (let i = 0; i < maxLength; i++) cells.push(value[i] ?? '');

  useEffect(() => {
    refs.current = refs.current.slice(0, maxLength);
  }, [maxLength]);

  const updateAt = (i: number, ch: string) => {
    const next = cells.slice();
    next[i] = ch.slice(0, 1);
    onChange(next.join('').replace(/\s+$/, ''));
  };

  const onCellChange = (i: number) => (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw.length > 1) {
      // Multi-char input (often autofill/paste through a single cell):
      // spread across cells from i onward.
      spreadFrom(i, raw);
    } else {
      updateAt(i, raw);
      if (raw && i < maxLength - 1) refs.current[i + 1]?.focus();
    }
  };

  const spreadFrom = (i: number, text: string) => {
    const next = cells.slice();
    let p = i;
    for (const ch of text) {
      if (p >= maxLength) break;
      next[p++] = ch;
    }
    onChange(next.join('').replace(/\s+$/, ''));
    const focusAt = Math.min(p, maxLength - 1);
    window.setTimeout(() => refs.current[focusAt]?.focus(), 0);
  };

  const onKey = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !cells[i] && i > 0) {
      e.preventDefault();
      refs.current[i - 1]?.focus();
      updateAt(i - 1, '');
    } else if (e.key === 'ArrowLeft' && i > 0) {
      e.preventDefault();
      refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowRight' && i < maxLength - 1) {
      e.preventDefault();
      refs.current[i + 1]?.focus();
    }
  };

  const onPaste = (i: number) => (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (!text) return;
    e.preventDefault();
    spreadFrom(i, text);
  };

  return (
    <div className="pdf-comb-input" data-field-id={id}>
      {cells.map((ch, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="text"
          maxLength={1}
          value={ch}
          readOnly={readOnly}
          onChange={onCellChange(i)}
          onKeyDown={onKey(i)}
          onPaste={onPaste(i)}
          aria-label={`${id} character ${i + 1}`}
          className="pdf-comb-input__cell"
          style={{
            width: 28,
            height: 36,
            textAlign: 'center',
            fontSize: 16,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            border: '1px solid #cdd5e0',
            borderRadius: 4,
            padding: 0,
            background: readOnly ? '#f4f6fa' : '#fff',
            color: '#1f2933',
            outline: 'none',
          }}
        />
      ))}
    </div>
  );
}
