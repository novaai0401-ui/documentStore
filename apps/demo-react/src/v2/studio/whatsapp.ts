/**
 * Share to WhatsApp — India's #1 way to send a card or wish. On phones the Web
 * Share sheet puts WhatsApp right at the top (and it accepts image/video files);
 * for a live link we open WhatsApp directly with the message pre-filled; on a
 * desktop with no file-share we save the file so it can be attached manually.
 */
export type WaResult = 'shared' | 'link' | 'downloaded' | 'failed';

/** WhatsApp is installed / relevant almost everywhere in India, but we only show
 *  the button when SOME share path exists (Web Share with files, or a link). */
export function canShareFiles(): boolean {
  try { return typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [new File([], 'x.png', { type: 'image/png' })] }); }
  catch { return false; }
}

export async function shareToWhatsApp(opts: { file?: File; text?: string; url?: string }): Promise<WaResult> {
  const { file, text, url } = opts;
  const msg = [text, url].filter(Boolean).join(' ').trim();
  // 1) Best path on phones: share the actual file (WhatsApp appears in the sheet).
  if (file) {
    try {
      if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: text || undefined });
        return 'shared';
      }
    } catch (e) { if (e instanceof Error && e.name === 'AbortError') return 'shared'; /* else fall through */ }
  }
  // 2) A live link (or plain text) opens WhatsApp directly with it pre-filled.
  if (url || (text && !file)) {
    try { window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank', 'noopener'); return 'link'; } catch { /* */ }
  }
  // 3) No file-share (desktop): save it so the user can attach it in WhatsApp.
  if (file) {
    try { const { saveBlob } = await import('../smart/util.js'); await saveBlob(file.name, file); return 'downloaded'; } catch { /* */ }
  }
  return 'failed';
}
