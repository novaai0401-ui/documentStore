import type { Overlay, NewFieldDescriptor } from '@pdfcraft/engine';
import type { Annotation } from './Annotations.js';

/**
 * Convert in-app overlay annotations into the parser's Overlay shape.
 * Image / signature annotations carry data URLs; we decode them to
 * JPEG bytes here (PNG inputs are re-encoded to JPEG via OffscreenCanvas
 * so the parser can embed them as DCTDecode XObjects).
 */
export async function annotationsToOverlays(annotations: Annotation[]): Promise<Overlay[]> {
  const out: Overlay[] = [];
  for (const a of annotations) {
    const common = {
      page: a.page,
      pageCssWidth: a.pageCssWidth,
      pageCssHeight: a.pageCssHeight,
    };
    if (a.kind === 'text') {
      out.push({
        kind: 'text', ...common,
        x: a.x, y: a.y, width: a.width, height: a.height,
        text: a.text, fontSize: a.fontSize, color: a.color,
        invisible: a.invisible, rotate: a.rotate, opacity: a.opacity,
      });
    } else if (a.kind === 'highlight') {
      out.push({
        kind: 'highlight', ...common,
        x: a.x, y: a.y, width: a.width, height: a.height,
        color: '#ffdc3c', alpha: 0.35,
      });
    } else if (a.kind === 'eraser') {
      out.push({
        kind: 'eraser', ...common,
        x: a.x, y: a.y, width: a.width, height: a.height,
      });
    } else if (a.kind === 'redact') {
      out.push({
        kind: 'redact', ...common,
        x: a.x, y: a.y, width: a.width, height: a.height,
      });
    } else if (a.kind === 'crop') {
      out.push({
        kind: 'crop', ...common,
        x: a.x, y: a.y, width: a.width, height: a.height,
      });
    } else if (a.kind === 'hyperlink') {
      out.push({
        kind: 'hyperlink', ...common,
        x: a.x, y: a.y, width: a.width, height: a.height,
        url: a.url, label: a.label,
      });
    } else if (a.kind === 'stamp') {
      out.push({
        kind: 'stamp', ...common,
        x: a.x, y: a.y, width: a.width, height: a.height,
        text: a.preset, color: a.color,
      });
    } else if (a.kind === 'shape') {
      out.push({
        kind: 'shape', ...common,
        x: a.x, y: a.y, width: a.width, height: a.height,
        shape: a.shape, stroke: a.stroke, strokeWidth: a.strokeWidth,
      });
    } else if (a.kind === 'draw') {
      out.push({
        kind: 'draw', ...common,
        // BoxBase requires x/y/w/h — placeholder; the writer uses
        // points instead for draw.
        x: 0, y: 0, width: 0, height: 0,
        points: a.points, stroke: a.stroke, strokeWidth: a.strokeWidth,
      } as Overlay);
    } else if (a.kind === 'sign' || a.kind === 'image') {
      const jpeg = await dataUrlToJpeg(a.dataUrl);
      if (!jpeg) continue;
      out.push({
        kind: a.kind, ...common,
        x: a.x, y: a.y, width: a.width, height: a.height,
        jpegBytes: jpeg.bytes,
        imgWidth: jpeg.width, imgHeight: jpeg.height,
      });
    }
  }
  return out;
}

/**
 * Re-encode any image data URL to JPEG bytes via OffscreenCanvas.
 * JPEG is the easiest format for inline PDF image embedding — we just
 * declare /Filter /DCTDecode and drop in the bytes verbatim.
 *
 * A consequence: transparency on PNGs gets flattened onto white. For
 * signatures on white form backgrounds this is fine; for arbitrary
 * images with alpha, the PNG-with-/SMask path would be a follow-up.
 */
async function dataUrlToJpeg(
  dataUrl: string,
): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  try {
    const img = await loadImage(dataUrl);
    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(img.naturalWidth, img.naturalHeight)
        : Object.assign(document.createElement('canvas'), {
            width: img.naturalWidth,
            height: img.naturalHeight,
          });
    const ctx = (canvas as HTMLCanvasElement).getContext('2d')!;
    // Paint white background so transparent regions stay readable.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, 0, 0);
    const blob = await (canvas as OffscreenCanvas | HTMLCanvasElement & {
      convertToBlob?: (opts: { type: string; quality: number }) => Promise<Blob>;
    } extends infer C ? C : never).convertToBlob
      ? await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/jpeg', quality: 0.9 })
      : await new Promise<Blob>((resolve) =>
          (canvas as HTMLCanvasElement).toBlob(
            (b) => resolve(b!),
            'image/jpeg',
            0.9,
          ),
        );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { bytes, width: img.naturalWidth, height: img.naturalHeight };
  } catch (e) {
    console.warn('dataUrlToJpeg failed:', e);
    return null;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/**
 * Convert Add-Field annotations into the parser's NewFieldDescriptor.
 * Other annotation kinds are filtered out — they're handled by
 * `annotationsToOverlays`. Skipped if a field has no name (modal would
 * never have committed without one, but defensive).
 */
export function annotationsToNewFields(annotations: Annotation[]): NewFieldDescriptor[] {
  const out: NewFieldDescriptor[] = [];
  for (const a of annotations) {
    if (a.kind !== 'new-field' || !a.fieldName) continue;
    out.push({
      type: a.fieldType,
      name: a.fieldName,
      page: a.page,
      x: a.x,
      y: a.y,
      width: a.width,
      height: a.height,
      pageCssWidth: a.pageCssWidth,
      pageCssHeight: a.pageCssHeight,
      defaultValue: a.defaultValue,
      options: a.options,
      required: a.required,
      readOnly: a.readOnly,
    });
  }
  return out;
}
