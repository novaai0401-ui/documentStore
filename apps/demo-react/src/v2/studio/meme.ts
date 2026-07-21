/**
 * Meme generator core — classic top/bottom caption over an image, rendered on a
 * Canvas in the browser. Pure helpers here (font sizing, line wrapping by a
 * measurer); compositing + UI live in MemeModal.
 */

/** Caption font size as a fraction of image width, clamped to sane bounds. */
export function memeFontSize(imageWidth: number, scale = 0.1): number {
  return Math.max(18, Math.min(160, Math.round(imageWidth * scale)));
}

/**
 * Greedily wrap `text` into lines no wider than maxWidth, using an injected
 * width measurer (so it's testable without a Canvas).
 */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let cur = words[0]!;
  for (let i = 1; i < words.length; i++) {
    const next = `${cur} ${words[i]}`;
    if (measure(next) <= maxWidth) cur = next;
    else { lines.push(cur); cur = words[i]!; }
  }
  lines.push(cur);
  return lines;
}
