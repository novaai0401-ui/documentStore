/**
 * Pages rail — the campaign filmstrip under the canvas. Each page is its own
 * Design; click to edit, reorder with the arrows, duplicate or delete. Thumbnails
 * are live SVG (vector, cheap). Shown only outside collaboration rooms (collab
 * syncs the active page). All page operations live in StudioEditor.
 */
import { designToSvg, type Design } from './model.js';

const thumb = (d: Design): string => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(designToSvg(d));

export function PagesRail({ pages, active, onSelect, onAdd, onDuplicate, onDelete, onMove }: {
  pages: Design[];
  active: number;
  onSelect: (i: number) => void;
  onAdd: () => void;
  onDuplicate: () => void;
  onDelete: (i: number) => void;
  onMove: (i: number, dir: -1 | 1) => void;
}) {
  return (
    <div className="pr-rail" role="tablist" aria-label="Pages">
      {pages.map((p, i) => (
        <div key={i} className={'pr-page' + (i === active ? ' pr-page--active' : '')}>
          <button type="button" className="pr-thumb" role="tab" aria-selected={i === active} onClick={() => onSelect(i)} title={`Page ${i + 1}`}>
            <img src={thumb(p)} alt="" style={{ aspectRatio: `${p.w} / ${p.h}` }} />
            <span className="pr-num">{i + 1}</span>
          </button>
          {i === active && (
            <div className="pr-tools">
              <button type="button" title="Move left" disabled={i === 0} onClick={() => onMove(i, -1)}>‹</button>
              <button type="button" title="Move right" disabled={i === pages.length - 1} onClick={() => onMove(i, 1)}>›</button>
              <button type="button" title="Delete page" disabled={pages.length <= 1} onClick={() => onDelete(i)}>🗑</button>
            </div>
          )}
        </div>
      ))}
      <div className="pr-add">
        <button type="button" className="pr-addbtn" title="Add a blank page" onClick={onAdd}>＋</button>
        <button type="button" className="pr-dupbtn" title="Duplicate current page" onClick={onDuplicate}>⧉</button>
      </div>
    </div>
  );
}
