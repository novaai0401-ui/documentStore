/**
 * Debounced autosave. When an editor is given a document id, it builds its
 * current state into a DocRecord and persists it shortly after each change, so a
 * refresh or closed tab never loses work. The builder may be async (e.g. a
 * spreadsheet serializing to xlsx bytes).
 */
import { useEffect, type DependencyList } from 'react';
import { saveDoc, type DocRecord } from './docStore.js';

export function useAutosave(
  docId: string | undefined,
  build: () => DocRecord | Promise<DocRecord | null> | null,
  deps: DependencyList,
  delay = 800,
): void {
  useEffect(() => {
    if (!docId) return;
    let cancelled = false;
    const t = setTimeout(() => {
      void Promise.resolve(build()).then((rec) => { if (rec && !cancelled) return saveDoc(rec); });
    }, delay);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
