/**
 * Persistence hooks for v2. localStorage is wired by default; the optional
 * `onPersist` callback gives consumers a single seam to POST the saved
 * payload to their own server / DB without modifying this app.
 */

const LS_PREFIX = 'pdf-v2:';

export interface PersistPayload {
  /** Stable id (e.g. file name without extension). */
  docId: string;
  /** Saved PDF bytes. */
  pdfBytes: Uint8Array;
  /** Field-value map matching the saved bytes. */
  values: Record<string, string | boolean | string[]>;
  /** ISO timestamp. */
  savedAt: string;
}

export type ServerPersistHook = (payload: PersistPayload) => Promise<void>;

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

/**
 * Always-on local persistence. The PDF bytes go in as base64; the field
 * values go in as JSON. Both are keyed by docId so a session can be
 * restored later.
 */
export function persistToLocalStorage(payload: PersistPayload): void {
  try {
    localStorage.setItem(`${LS_PREFIX}${payload.docId}:pdf`, bytesToBase64(payload.pdfBytes));
    localStorage.setItem(
      `${LS_PREFIX}${payload.docId}:values`,
      JSON.stringify({ values: payload.values, savedAt: payload.savedAt }),
    );
  } catch (e) {
    // localStorage can throw on quota — surface but don't block the save.
    console.warn('localStorage persist failed:', e);
  }
}

/**
 * Optional bridge to a backend. Caller provides this function; we just
 * call it. Example:
 *   const serverPersist: ServerPersistHook = async (p) => {
 *     const form = new FormData();
 *     form.append('pdf', new Blob([p.pdfBytes], { type: 'application/pdf' }));
 *     form.append('values', JSON.stringify(p.values));
 *     await fetch(`/api/documents/${p.docId}`, { method: 'POST', body: form });
 *   };
 */
export async function persistToServer(
  payload: PersistPayload,
  hook?: ServerPersistHook,
): Promise<void> {
  if (!hook) return;
  await hook(payload);
}
