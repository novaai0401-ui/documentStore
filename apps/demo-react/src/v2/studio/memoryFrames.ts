/**
 * Decorative frames for the memory video — a matte/border drawn around each
 * photo so a slideshow isn't just edge-to-edge photos on black. Pure canvas
 * drawing (no state), shared by the live preview and the exporter through
 * paintSlideFrame. 'none' keeps the original full-bleed look.
 */

export interface MemoryFrame {
  id: string;
  label: string;
  icon: string;
  /** Background painted behind the photo (the card / matte colour). */
  bg: string;
  note?: string;
}

export const MEMORY_FRAMES: MemoryFrame[] = [
  { id: 'none', label: 'Full bleed', icon: '⬛', bg: '#000000', note: 'Photo fills the frame' },
  { id: 'rounded', label: 'Rounded card', icon: '▢', bg: '#0f172a', note: 'Soft rounded corners on a dark mat' },
  { id: 'polaroid', label: 'Polaroid', icon: '🖼️', bg: '#f7f3e8', note: 'Classic instant-photo card' },
  { id: 'film', label: 'Film strip', icon: '🎞️', bg: '#0a0a0a', note: 'Cinematic strip with sprockets' },
  { id: 'vignette', label: 'Soft vignette', icon: '🌫️', bg: '#000000', note: 'Full photo with a moody edge fade' },
];

export function memoryFrameById(id: string): MemoryFrame {
  return MEMORY_FRAMES.find((f) => f.id === id) ?? MEMORY_FRAMES[0]!;
}

export interface PhotoRect { x: number; y: number; rw: number; rh: number; radius: number }

/** The rectangle the photo is drawn into for a given frame + canvas size. */
export function photoRectFor(frameId: string, w: number, h: number): PhotoRect {
  const m = Math.min(w, h);
  switch (frameId) {
    case 'rounded': {
      const pad = Math.round(m * 0.045);
      return { x: pad, y: pad, rw: w - pad * 2, rh: h - pad * 2, radius: Math.round(m * 0.05) };
    }
    case 'polaroid': {
      const pad = Math.round(m * 0.06);
      const bottom = Math.round(m * 0.14); // the iconic wide bottom lip
      return { x: pad, y: pad, rw: w - pad * 2, rh: h - pad - bottom, radius: Math.round(m * 0.01) };
    }
    case 'film': {
      const side = Math.round(w * 0.09);
      const band = Math.round(h * 0.05);
      return { x: side, y: band, rw: w - side * 2, rh: h - band * 2, radius: 0 };
    }
    case 'vignette':
    case 'none':
    default:
      return { x: 0, y: 0, rw: w, rh: h, radius: 0 };
  }
}

/** Trace a rounded-rect path (no fill/stroke). r=0 → a plain rect. */
export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (rr === 0) { ctx.rect(x, y, w, h); return; }
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Decorative elements drawn BEHIND the photo (card shadow, sprocket base). */
export function paintFrameBack(ctx: CanvasRenderingContext2D, frameId: string, rect: PhotoRect, w: number, h: number): void {
  if (frameId === 'rounded' || frameId === 'polaroid') {
    // Soft drop shadow so the card lifts off the mat.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = Math.round(Math.min(w, h) * 0.03);
    ctx.shadowOffsetY = Math.round(Math.min(w, h) * 0.012);
    ctx.fillStyle = frameId === 'polaroid' ? '#ffffff' : '#1e293b';
    if (frameId === 'polaroid') {
      // The whole card (photo area + bottom lip) casts one shadow.
      const pad = rect.x;
      roundRectPath(ctx, pad, pad, w - pad * 2, h - pad * 2, rect.radius);
    } else {
      roundRectPath(ctx, rect.x, rect.y, rect.rw, rect.rh, rect.radius);
    }
    ctx.fill();
    ctx.restore();
  }
}

/** Decorative elements drawn ON TOP of the photo (borders, sprockets, vignette). */
export function paintFrameFront(ctx: CanvasRenderingContext2D, frameId: string, rect: PhotoRect, w: number, h: number): void {
  const m = Math.min(w, h);
  if (frameId === 'rounded') {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(2, Math.round(m * 0.006));
    roundRectPath(ctx, rect.x, rect.y, rect.rw, rect.rh, rect.radius);
    ctx.stroke();
    ctx.restore();
  } else if (frameId === 'polaroid') {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = Math.max(1, Math.round(m * 0.003));
    roundRectPath(ctx, rect.x, rect.y, rect.rw, rect.rh, rect.radius);
    ctx.stroke();
    ctx.restore();
  } else if (frameId === 'film') {
    // Sprocket holes down both side margins.
    ctx.save();
    ctx.fillStyle = '#e5e7eb';
    const holeW = Math.round(w * 0.035), holeH = Math.round(h * 0.028);
    const gap = Math.round(h * 0.018);
    const leftX = Math.round((rect.x - holeW) / 2);
    const rightX = w - leftX - holeW;
    for (let y = gap; y + holeH <= h - gap; y += holeH + gap) {
      roundRectPath(ctx, leftX, y, holeW, holeH, Math.round(holeW * 0.25)); ctx.fill();
      roundRectPath(ctx, rightX, y, holeW, holeH, Math.round(holeW * 0.25)); ctx.fill();
    }
    ctx.restore();
  } else if (frameId === 'vignette') {
    const cx = w / 2, cy = h / 2;
    const g = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.3, cx, cy, Math.max(w, h) * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.restore();
  }
}
