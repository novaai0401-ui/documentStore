/**
 * Alignment snapping for the Design Studio. While an element is dragged, its
 * edges and centre snap to the artboard's edges/centre and to other elements'
 * edges/centres when they're within a pixel threshold — and we report the guide
 * lines to draw. Pure and deterministic so it's unit-testable; the editor feeds it
 * live drag positions and renders the returned guides.
 */
export interface SnapRect { x: number; y: number; w: number; h: number }
/** A guide line to draw: 'x' = vertical line at this x; 'y' = horizontal line at this y. */
export interface Guide { axis: 'x' | 'y'; pos: number }
export interface SnapResult { x: number; y: number; guides: Guide[] }

function bestSnap(anchors: number[], targets: number[], threshold: number): { delta: number; pos: number } | null {
  let best: { delta: number; pos: number } | null = null;
  for (const a of anchors) {
    for (const t of targets) {
      const d = t - a;
      if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, pos: t };
    }
  }
  return best;
}

/**
 * Snap `rect`'s position against the artboard and `others`. Returns the adjusted
 * x/y and the guides that fired (empty when nothing was within `threshold`).
 */
export function computeSnap(rect: SnapRect, others: SnapRect[], artW: number, artH: number, threshold: number): SnapResult {
  const xTargets = [0, artW / 2, artW];
  const yTargets = [0, artH / 2, artH];
  for (const o of others) {
    xTargets.push(o.x, o.x + o.w / 2, o.x + o.w);
    yTargets.push(o.y, o.y + o.h / 2, o.y + o.h);
  }
  const sx = bestSnap([rect.x, rect.x + rect.w / 2, rect.x + rect.w], xTargets, threshold);
  const sy = bestSnap([rect.y, rect.y + rect.h / 2, rect.y + rect.h], yTargets, threshold);
  const guides: Guide[] = [];
  let x = rect.x, y = rect.y;
  if (sx) { x = Math.round(x + sx.delta); guides.push({ axis: 'x', pos: sx.pos }); }
  if (sy) { y = Math.round(y + sy.delta); guides.push({ axis: 'y', pos: sy.pos }); }
  return { x, y, guides };
}
