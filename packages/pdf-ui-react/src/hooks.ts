import { useEffect, useState, useCallback, useRef } from 'react';
import {
  loadDocument,
  renderPage,
  writeFormFields,
  saveDocument,
  EncryptedPdfError,
  type PdfDocumentHandle,
  type LoadDocumentOptions,
} from '@pdfcraft/engine';
import { extractFormSchema, type FormSchema, type SchemaField } from '@pdfcraft/form-schema';

export { EncryptedPdfError } from '@pdfcraft/engine';

export interface UsePdfDocumentResult {
  doc: PdfDocumentHandle | null;
  schema: FormSchema | null;
  /**
   * Load a PDF. For encrypted documents, supply `password` — if omitted (or
   * wrong), the call rejects with an `EncryptedPdfError`. Catch it in the UI
   * to prompt the user, then call `load(bytes, { password })` again.
   */
  load: (bytes: Uint8Array, opts?: LoadDocumentOptions) => Promise<void>;
  setFieldValue: (id: string, value: string | boolean | string[]) => void;
  save: (opts?: Parameters<typeof saveDocument>[1]) => Promise<Uint8Array>;
  state: 'idle' | 'loading' | 'ready' | 'error' | 'needs-password';
  error: Error | null;
  /** Present when state === 'needs-password'; pass back to load(). */
  encryptedError: EncryptedPdfError | null;
}

/**
 * Load a PDF and expose its form schema as React state.
 * Field edits are buffered in memory; call `save()` to materialize them.
 */
export function usePdfDocument(): UsePdfDocumentResult {
  const [doc, setDoc] = useState<PdfDocumentHandle | null>(null);
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error' | 'needs-password'>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [encryptedError, setEncryptedError] = useState<EncryptedPdfError | null>(null);
  const pending = useRef<Record<string, string | boolean | string[]>>({});

  const load = useCallback(async (bytes: Uint8Array, opts?: LoadDocumentOptions) => {
    setState('loading');
    setError(null);
    setEncryptedError(null);
    try {
      const handle = await loadDocument(bytes, opts);
      const s = await extractFormSchema(handle);
      pending.current = {};
      setDoc(handle);
      setSchema(s);
      setState('ready');
    } catch (e) {
      if (e instanceof EncryptedPdfError) {
        setEncryptedError(e);
        setState('needs-password');
        return;
      }
      // pdf.js raises its own PasswordException — recognize by name.
      if (e && typeof e === 'object' && 'name' in e &&
          (e as { name?: string }).name === 'PasswordException') {
        // Synthesize an EncryptedPdfError so the UI has one consistent path.
        const synthesized = new EncryptedPdfError(
          // Dummy context; the UI only checks .code === 'NEEDS_PASSWORD'.
          { V: 0, R: 0, keyLength: 0, P: 0, O: new Uint8Array(), U: new Uint8Array(),
            fileId: new Uint8Array(), encryptMetadata: true,
            stmCipher: 'RC4' as const, strCipher: 'RC4' as const },
          opts?.password !== undefined,
        );
        setEncryptedError(synthesized);
        setState('needs-password');
        return;
      }
      setError(e instanceof Error ? e : new Error(String(e)));
      setState('error');
    }
  }, []);

  const setFieldValue = useCallback((id: string, value: string | boolean | string[]) => {
    pending.current[id] = value;
    setSchema((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        fields: prev.fields.map((f): SchemaField => (f.id === id ? { ...f, value } : f)),
      };
    });
  }, []);

  const save = useCallback(async (opts?: Parameters<typeof saveDocument>[1]): Promise<Uint8Array> => {
    if (!doc) throw new Error('No document loaded');
    await writeFormFields(doc, pending.current);
    return saveDocument(doc, opts);
  }, [doc]);

  return { doc, schema, load, setFieldValue, save, state, error, encryptedError };
}

export interface UsePageRendererArgs {
  doc: PdfDocumentHandle | null;
  pageNumber: number;
  scale: number;
  /** Page rotation in degrees (multiples of 90). Default 0. */
  rotation?: number;
  container: HTMLElement | null;
  /** When true, render an editable AnnotationLayer on top of the canvas. */
  withFormLayer?: boolean;
}

/**
 * Render a single page into the given container. Re-renders when scale,
 * page, or doc change. Caller owns the container element.
 *
 * When `withFormLayer` is true, form widgets render as a separate pdf.js
 * AnnotationLayer stacked over the canvas — edits go straight to pdf.js's
 * annotationStorage and are picked up by `saveDocument`.
 */
export function usePageRenderer({
  doc,
  pageNumber,
  scale,
  rotation,
  container,
  withFormLayer,
}: UsePageRendererArgs): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!doc || !container) return;
    let cancelled = false;
    renderPage(doc, { pageNumber, scale, rotation: rotation as 0 | 90 | 180 | 270 | undefined, withFormLayer })
      .then(({ canvas, width, height, annotationLayerDiv }) => {
        if (cancelled) return;
        container.innerHTML = '';
        // Wrap in a positioned shell so the annotation layer can absolutely
        // stack on top of the canvas at matching dimensions.
        const shell = document.createElement('div');
        shell.style.position = 'relative';
        shell.style.width = `${width}px`;
        shell.style.height = `${height}px`;
        shell.appendChild(canvas);
        if (annotationLayerDiv) shell.appendChild(annotationLayerDiv);
        container.appendChild(shell);
        setSize({ width, height });
      })
      .catch((e) => console.error('renderPage failed:', e));
    return () => {
      cancelled = true;
    };
  }, [doc, pageNumber, scale, rotation, container, withFormLayer]);

  return size;
}
