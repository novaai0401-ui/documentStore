/**
 * Feature tour — a spotlight walkthrough of the app, one feature at a time.
 * Skippable at any moment (Skip button, ✕, Esc, or clicking the dark veil);
 * fully keyboard-driven; remembers completion in localStorage so it only
 * auto-plays once, with a "Take the tour" button to replay whenever.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { TkxButton } from 'tekivex-ui';

export interface TourStep {
  /** CSS selector of the element to spotlight ('' = centred welcome card). */
  target: string;
  title: string;
  body: string;
}

export const TOUR_DONE_KEY = 'pyntra-tour-v1';

export function Tour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[Math.min(i, steps.length - 1)]!;
  const done = useCallback(() => { try { localStorage.setItem(TOUR_DONE_KEY, '1'); } catch { /* */ } onClose(); }, [onClose]);

  // One persistent frame loop tracks the CURRENT step's element — it follows
  // scrolling, resizes and step changes without any listener bookkeeping.
  const targetHolder = useRef(step.target);
  targetHolder.current = step.target;
  useEffect(() => {
    const same = (a: DOMRect | null, b: DOMRect | null) =>
      (!a && !b) || (!!a && !!b && Math.abs(a.top - b.top) < 1 && Math.abs(a.left - b.left) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1);
    const tick = () => {
      const sel = targetHolder.current;
      const el = sel ? document.querySelector(sel) : null;
      const r = el ? el.getBoundingClientRect() : null;
      setRect((prev) => (same(prev, r) ? prev : r));
    };
    tick();
    // A timer, NOT requestAnimationFrame: rAF freezes in hidden/background
    // pages, which would pin the spotlight to a stale position.
    const id = setInterval(tick, 120);
    return () => clearInterval(id);
  }, []);
  // Bring each step's element into view.
  useEffect(() => {
    const el = step.target ? document.querySelector(step.target) : null;
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [i, step.target]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') done();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') setI((n) => Math.min(steps.length - 1, n + 1));
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [done, steps.length]);

  // Tooltip below the spotlight when there's room, above otherwise, centred if no target.
  const pad = 8;
  const tipStyle: React.CSSProperties = rect
    ? (rect.bottom + 190 < window.innerHeight
      ? { top: rect.bottom + pad + 6, left: Math.max(12, Math.min(window.innerWidth - 332, rect.left + rect.width / 2 - 160)) }
      : { top: Math.max(12, rect.top - 190), left: Math.max(12, Math.min(window.innerWidth - 332, rect.left + rect.width / 2 - 160)) })
    : { top: '38%', left: '50%', transform: 'translate(-50%,-50%)' };

  return (
    <div className="tour" role="dialog" aria-label="Feature tour">
      {/* Veil — clicking it skips; the spotlight cutout stays visible. */}
      <div className="tour-veil" onClick={done} />
      {rect && <div className="tour-spot" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />}
      <div className="tour-tip" style={tipStyle} onClick={(e) => e.stopPropagation()}>
        <button className="brand-x tour-x" aria-label="Skip the tour" onClick={done}>✕</button>
        <strong className="tour-title">{step.title}</strong>
        <p className="tour-body">{step.body}</p>
        <div className="tour-foot">
          <span className="tour-count">{i + 1} / {steps.length}</span>
          <span className="tour-btns">
            <TkxButton variant="ghost" size="sm" onClick={done}>Skip</TkxButton>
            {i > 0 && <TkxButton variant="outline" size="sm" onClick={() => setI((n) => n - 1)}>← Back</TkxButton>}
            {i < steps.length - 1
              ? <TkxButton variant="solid" colorScheme="primary" size="sm" onClick={() => setI((n) => n + 1)}>Next →</TkxButton>
              : <TkxButton variant="solid" colorScheme="primary" size="sm" onClick={done}>✓ Got it!</TkxButton>}
          </span>
        </div>
      </div>
    </div>
  );
}
