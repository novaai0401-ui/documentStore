/**
 * Toolbar overflow menu — a "⋯ More" dropdown so a busy editor toolbar stays
 * usable (especially on phones, where 15+ buttons distort into a cramped scroll).
 * Generic: pass a list of items; closes on outside click / Escape / scroll.
 *
 * The menu is rendered through a PORTAL to <body> and positioned `fixed`. The
 * portal is essential: the studio toolbar lives inside containers with
 * `overflow:auto` AND CSS transforms, and a transformed ancestor makes even
 * `position:fixed` clip to that ancestor. Positioning anchors the menu's LEFT edge
 * under the trigger and then CLAMPS it into the viewport using the measured menu
 * width — so it never runs off either edge (the "opens off-screen" bug), whether
 * the trigger sits on the left (desktop) or right (mobile). Tekivex-ui has no
 * toolbar-overflow primitive yet — candidate TkxToolbar.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ToolbarItem { label: string; onClick: () => void; disabled?: boolean; title?: string }

export function ToolbarMenu({ items, label = '⋯ More' }: { items: ToolbarItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Measure the trigger AND the (already-rendered) menu, then clamp into the
  // viewport. The menu is mounted (off-screen) as soon as `open`, so its real
  // width is available here on the first pass.
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const b = btnRef.current;
      if (!b) return;
      const r = b.getBoundingClientRect();
      const mw = menuRef.current?.offsetWidth ?? 220;
      const mh = menuRef.current?.offsetHeight ?? 240;
      const pad = 8;
      const left = Math.max(pad, Math.min(r.left, window.innerWidth - mw - pad));
      // Prefer below the trigger; FLIP ABOVE when there's no room (the trigger
      // can sit near — or scrolled past — the bottom edge inside the phone
      // bottom-sheet), then clamp fully into the viewport either way.
      let top = Math.round(r.bottom + 6);
      if (top + Math.min(mh, 240) > window.innerHeight - pad) top = Math.round(r.top - 6 - mh);
      top = Math.max(pad, Math.min(top, window.innerHeight - pad - Math.min(mh, 140)));
      const maxHeight = Math.max(140, window.innerHeight - top - 12);
      setPos({ top, left: Math.round(left), maxHeight });
    };
    place();
    const id = requestAnimationFrame(place); // refine once fonts/layout settle
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const tgt = e.target as Node;
      if (btnRef.current?.contains(tgt) || menuRef.current?.contains(tgt)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onScroll = () => setOpen(false); // a scroll moves the anchor — just close
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  if (!items.length) return null;
  return (
    <div className="tbm">
      <button ref={btnRef} type="button" className="tbm-btn" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>{label} ▾</button>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          className="tbm-menu"
          role="menu"
          style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, maxHeight: pos?.maxHeight, visibility: pos ? 'visible' : 'hidden' }}
        >
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" className="tbm-item" disabled={it.disabled} title={it.title} onClick={() => { it.onClick(); setOpen(false); }}>{it.label}</button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
