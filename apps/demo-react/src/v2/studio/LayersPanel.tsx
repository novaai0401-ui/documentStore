/**
 * Layers panel — the stack of design elements, top layer first (the editor
 * paints in array order, so the last element is on top). Click to select,
 * reorder z-order with the arrows, and toggle visibility/lock. Pure UI; all
 * state changes go back through StudioEditor's history-aware handlers.
 */
import { elementLabel, type Element, type LayerOp } from './model.js';

const ICON: Record<Element['type'], string> = { text: 'T', rect: '▭', ellipse: '◯', line: '╱', image: '🖼' };

export function LayersPanel({ elements, selected, onSelect, onReorder, onToggleHidden, onToggleLocked }: {
  elements: Element[];
  selected: string[];
  onSelect: (id: string, additive: boolean) => void;
  onReorder: (id: string, op: LayerOp) => void;
  onToggleHidden: (id: string) => void;
  onToggleLocked: (id: string) => void;
}) {
  if (!elements.length) return null;
  // Display top-first; "up" in the list means toward the front of the canvas.
  const rows = elements.slice().reverse();
  return (
    <div className="lp">
      <div className="brand-section">Layers</div>
      <ul className="lp-list">
        {rows.map((el) => (
          <li key={el.id} className={'lp-row' + (selected.includes(el.id) ? ' lp-row--sel' : '') + (el.hidden ? ' lp-row--hidden' : '')}>
            <button type="button" className="lp-main" onClick={(e) => onSelect(el.id, e.shiftKey)} title="Select">
              <span className="lp-icon">{ICON[el.type]}</span>
              <span className="lp-label">{elementLabel(el)}</span>
            </button>
            <div className="lp-actions">
              <button type="button" className="lp-act" title="Bring forward" onClick={() => onReorder(el.id, 'forward')}>▲</button>
              <button type="button" className="lp-act" title="Send backward" onClick={() => onReorder(el.id, 'backward')}>▼</button>
              <button type="button" className={'lp-act' + (el.hidden ? ' lp-act--on' : '')} title={el.hidden ? 'Show' : 'Hide'} onClick={() => onToggleHidden(el.id)}>{el.hidden ? '🚫' : '👁'}</button>
              <button type="button" className={'lp-act' + (el.locked ? ' lp-act--on' : '')} title={el.locked ? 'Unlock' : 'Lock'} onClick={() => onToggleLocked(el.id)}>{el.locked ? '🔒' : '🔓'}</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
