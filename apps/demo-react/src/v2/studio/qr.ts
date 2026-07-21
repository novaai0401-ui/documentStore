/**
 * QR codes via the vetted, zero-transitive-dependency `qrcode-generator` library
 * (it does the Reed–Solomon/masking correctly so the codes actually scan — which
 * is exactly why we don't hand-roll it). We turn its module matrix into a crisp
 * SVG (and a data URL) so a QR can be dropped onto a design or downloaded. The
 * payload text is never interpolated into markup, so there's no injection risk.
 */
import qrcode from 'qrcode-generator';

export type QrEcLevel = 'L' | 'M' | 'Q' | 'H';

/** The dark/light module grid for `text` (auto-sized version). */
export function qrMatrix(text: string, ec: QrEcLevel = 'M'): boolean[][] {
  const qr = qrcode(0, ec);
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const rows: boolean[][] = [];
  for (let r = 0; r < n; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
    rows.push(row);
  }
  return rows;
}

export interface QrOptions { fg?: string; bg?: string; margin?: number; size?: number; ec?: QrEcLevel }

/** Render a QR to an SVG document string. */
export function qrToSvg(text: string, opts: QrOptions = {}): string {
  const m = qrMatrix(text || ' ', opts.ec ?? 'M');
  const n = m.length;
  const margin = opts.margin ?? 4;
  const dim = n + margin * 2;
  const fg = opts.fg ?? '#000000';
  const bg = opts.bg ?? '#ffffff';
  const size = opts.size ?? 512;
  let rects = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (m[r]![c]) rects += `<rect x="${c + margin}" y="${r + margin}" width="1" height="1"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges"><rect width="${dim}" height="${dim}" fill="${bg}"/><g fill="${fg}">${rects}</g></svg>`;
}

/** An `image/svg+xml` data URL for the QR (drop straight onto a design or img). */
export function qrToDataUrl(text: string, opts: QrOptions = {}): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qrToSvg(text, opts));
}
