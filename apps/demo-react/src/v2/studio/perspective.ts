/**
 * Perspective (projective) transform — the math behind true 4-corner document
 * dewarping, 100% in the browser and dependency-free. Solves the homography that
 * maps four corners to four corners (8×8 linear system via Gaussian elimination),
 * then warps an RGBA image by inverse-sampling each output pixel (bilinear).
 * Pure: takes/returns pixel arrays, no Canvas/DOM.
 */

export interface Pt { x: number; y: number }

/** Solve A·x = b for an n×n system (Gaussian elimination w/ partial pivoting). */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
    [M[col], M[piv]] = [M[piv]!, M[col]!];
    const d = M[col]![col]!;
    if (Math.abs(d) < 1e-12) continue;
    for (let c = col; c <= n; c++) M[col]![c]! /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]!;
      if (!f) continue;
      for (let c = col; c <= n; c++) M[r]![c]! -= f * M[col]![c]!;
    }
  }
  return M.map((row) => row[n]!);
}

/** Homography (3×3 as 9 numbers) mapping the four `from` points to the four `to` points. */
export function homography(from: Pt[], to: Pt[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i]!;
    const { x: u, y: v } = to[i]!;
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]); b.push(v);
  }
  const h = solve(A, b);
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
}

/** Apply a homography to a point. */
export function applyH(H: number[], x: number, y: number): Pt {
  const d = H[6]! * x + H[7]! * y + H[8]!;
  return { x: (H[0]! * x + H[1]! * y + H[2]!) / d, y: (H[3]! * x + H[4]! * y + H[5]!) / d };
}

/** Suggested output size from a source quad (TL,TR,BR,BL): average opposite edge lengths. */
export function outputSize(corners: Pt[]): { w: number; h: number } {
  const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  const [tl, tr, br, bl] = corners as [Pt, Pt, Pt, Pt];
  const w = Math.round((dist(tl, tr) + dist(bl, br)) / 2);
  const h = Math.round((dist(tl, bl) + dist(tr, br)) / 2);
  return { w: Math.max(1, w), h: Math.max(1, h) };
}

/** The corner quad for a 3D-style tilt of a w×h image (TL,TR,BR,BL order).
 *  `amount` 0…1 controls how strongly the receding edge shrinks. */
export function tiltQuad(w: number, h: number, dir: 'left' | 'right' | 'up' | 'down', amount = 0.18): Pt[] {
  const t = Math.max(0, Math.min(0.35, amount));
  switch (dir) {
    case 'right': return [{ x: 0, y: 0 }, { x: w, y: h * t }, { x: w, y: h * (1 - t) }, { x: 0, y: h }];
    case 'left': return [{ x: 0, y: h * t }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h * (1 - t) }];
    case 'up': return [{ x: w * t, y: 0 }, { x: w * (1 - t), y: 0 }, { x: w, y: h }, { x: 0, y: h }];
    case 'down': default: return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w * (1 - t), y: h }, { x: w * t, y: h }];
  }
}

/**
 * The inverse of warpToRect: draw the FULL source rectangle INTO a quad — the
 * "tilt in 3D" illusion. Output pixels outside the quad land outside the source
 * bounds under the homography and stay transparent, so the result composites
 * cleanly as an image layer.
 */
export function warpRectToQuad(src: Uint8ClampedArray | number[], sw: number, sh: number, quad: Pt[], outW: number, outH: number): Uint8ClampedArray {
  const rect: Pt[] = [{ x: 0, y: 0 }, { x: sw, y: 0 }, { x: sw, y: sh }, { x: 0, y: sh }];
  const H = homography(quad, rect); // output coords → source coords
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let v = 0; v < outH; v++) {
    for (let u = 0; u < outW; u++) {
      const p = applyH(H, u + 0.5, v + 0.5);
      const oi = (v * outW + u) * 4;
      if (p.x < 0 || p.y < 0 || p.x > sw - 1 || p.y > sh - 1) continue; // stays transparent
      const x0 = Math.floor(p.x), y0 = Math.floor(p.y);
      const x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
      const fx = p.x - x0, fy = p.y - y0;
      for (let c = 0; c < 4; c++) {
        const a = src[(y0 * sw + x0) * 4 + c]!, b = src[(y0 * sw + x1) * 4 + c]!;
        const cc = src[(y1 * sw + x0) * 4 + c]!, d = src[(y1 * sw + x1) * 4 + c]!;
        out[oi + c] = (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy;
      }
    }
  }
  return out;
}

/**
 * Warp the source quad (4 points in TL,TR,BR,BL order) to an outW×outH rectangle.
 * Returns RGBA pixels. Out-of-bounds samples become white (paper).
 */
export function warpToRect(src: Uint8ClampedArray | number[], sw: number, sh: number, corners: Pt[], outW: number, outH: number): Uint8ClampedArray {
  const dst: Pt[] = [{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }];
  const H = homography(dst, corners); // output coords → source coords
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let v = 0; v < outH; v++) {
    for (let u = 0; u < outW; u++) {
      const p = applyH(H, u + 0.5, v + 0.5);
      const oi = (v * outW + u) * 4;
      if (p.x < 0 || p.y < 0 || p.x > sw - 1 || p.y > sh - 1) { out[oi] = out[oi + 1] = out[oi + 2] = 255; out[oi + 3] = 255; continue; }
      const x0 = Math.floor(p.x), y0 = Math.floor(p.y);
      const x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
      const fx = p.x - x0, fy = p.y - y0;
      for (let c = 0; c < 3; c++) {
        const a = src[(y0 * sw + x0) * 4 + c]!, b = src[(y0 * sw + x1) * 4 + c]!;
        const cc = src[(y1 * sw + x0) * 4 + c]!, d = src[(y1 * sw + x1) * 4 + c]!;
        out[oi + c] = (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy;
      }
      out[oi + 3] = 255;
    }
  }
  return out;
}
