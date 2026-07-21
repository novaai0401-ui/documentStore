/**
 * High-quality background removal via a local ML matting model (@imgly/
 * background-removal, ISNet). This is the opt-in upgrade over the dependency-free
 * flood-fill: it handles busy/gradient photo backgrounds. It is lazily imported
 * (kept out of the main bundle) and only loads when invoked. Inference runs
 * entirely in the browser — your image never leaves the device; the only network
 * use is a one-time model download (~20 MB) from the library's CDN.
 */

const blobToDataUrl = (b: Blob): Promise<string> => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = () => rej(new Error('read failed'));
  r.readAsDataURL(b);
});

/**
 * Cut out the foreground of `src` (data URL / object URL) and return a PNG data
 * URL with a transparent background. `onProgress` reports 0..1 while the model
 * downloads/runs (so the UI can show a meaningful state on first use).
 */
export async function matteBackground(src: string, onProgress?: (fraction: number) => void): Promise<string> {
  const { removeBackground } = await import('@imgly/background-removal');
  const blob = await removeBackground(src, {
    model: 'isnet_fp16',
    output: { format: 'image/png' },
    progress: (_key: string, current: number, total: number) => { if (onProgress && total) onProgress(current / total); },
  });
  return blobToDataUrl(blob);
}
