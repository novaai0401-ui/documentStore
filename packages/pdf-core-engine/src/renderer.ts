import * as pdfjs from 'pdfjs-dist';
import { getInternalState } from './loader.js';
import type { PdfDocumentHandle, RenderPageOptions, RenderResult } from './types.js';

/**
 * Render a page into a fresh canvas, optionally with a pdf.js-managed
 * AnnotationLayer for editable form widgets. Caller is responsible for
 * inserting both DOM nodes into the document; stack the annotation layer
 * absolutely on top of the canvas at the same CSS dimensions.
 */
export async function renderPage(
  handle: PdfDocumentHandle,
  opts: RenderPageOptions,
): Promise<RenderResult> {
  const { pdfjsDoc } = getInternalState(handle);
  const page = await pdfjsDoc.getPage(opts.pageNumber);
  const viewport = page.getViewport({
    scale: opts.scale,
    rotation: opts.rotation ?? 0,
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context');

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  canvas.width = Math.floor(viewport.width * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  ctx.scale(dpr, dpr);

  // When the form layer is on, exclude form widgets from the canvas paint —
  // pdf.js will render them as DOM elements instead. Otherwise let widgets
  // bake into the canvas (read-only view).
  const annotationMode = opts.withFormLayer
    ? // AnnotationMode.DISABLE = no widget paint on canvas
      (pdfjs as unknown as { AnnotationMode: { DISABLE: number } }).AnnotationMode.DISABLE
    : undefined;

  await page.render({
    canvasContext: ctx,
    viewport,
    ...(annotationMode !== undefined ? { annotationMode } : {}),
  }).promise;

  let annotationLayerDiv: HTMLDivElement | undefined;
  if (opts.withFormLayer) {
    annotationLayerDiv = document.createElement('div');
    // pdf.js's AnnotationLayer emits <section> children that rely on its
    // own stylesheet (pdfjs-dist/web/pdf_viewer.css) for absolute
    // positioning. Use the conventional class so that stylesheet matches.
    annotationLayerDiv.className = 'annotationLayer';
    annotationLayerDiv.style.position = 'absolute';
    annotationLayerDiv.style.top = '0';
    annotationLayerDiv.style.left = '0';
    annotationLayerDiv.style.width = `${viewport.width}px`;
    annotationLayerDiv.style.height = `${viewport.height}px`;
    annotationLayerDiv.style.transformOrigin = '0 0';
    annotationLayerDiv.setAttribute('data-main-rotation', String(viewport.rotation ?? 0));
    // Widget content (font sizes) scales off this CSS variable.
    annotationLayerDiv.style.setProperty('--scale-factor', String(opts.scale));

    const annotations = await page.getAnnotations({ intent: 'display' });
    // pdf.js's AnnotationLayer class signature varies across minor versions.
    // We construct defensively — extra-keys are tolerated.
    const AnnotationLayerCtor = (
      pdfjs as unknown as { AnnotationLayer: new (params: Record<string, unknown>) => unknown }
    ).AnnotationLayer;
    const layer = new AnnotationLayerCtor({
      div: annotationLayerDiv,
      page,
      viewport,
      accessibilityManager: null,
      annotationCanvasMap: null,
      structTreeLayer: null,
    }) as {
      render: (params: Record<string, unknown>) => Promise<void> | void;
    };
    await layer.render({
      annotations,
      viewport,
      page,
      linkService: {
        externalLinkTarget: 0,
        externalLinkRel: 'noopener noreferrer nofollow',
        externalLinkEnabled: false,
        getDestinationHash: () => '#',
        getAnchorUrl: () => '#',
        addLinkAttributes: () => {},
      },
      annotationStorage: pdfjsDoc.annotationStorage,
      renderForms: true,
      enableScripting: false,
      hasJSActions: false,
      fieldObjects: null,
      imageResourcesPath: '',
    });
  }

  return {
    canvas,
    width: viewport.width,
    height: viewport.height,
    annotationLayerDiv,
  };
}
