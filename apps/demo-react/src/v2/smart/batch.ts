/**
 * Batch automation primitive — run an async operation over many items with
 * per-item error isolation and progress, entirely locally. Chaining several
 * tools into a "recipe" is just composing their steps into one op via chain().
 * Pure (the operation is injected), so it's fully unit-testable.
 */
export interface BatchResult<O> {
  name: string;
  ok: boolean;
  output?: O;
  error?: string;
}

/** Apply `op` to every item; a failure on one item never aborts the rest. */
export async function runBatch<I, O>(
  items: I[],
  op: (item: I) => Promise<O>,
  nameOf: (item: I) => string,
  onProgress?: (done: number, total: number) => void,
): Promise<BatchResult<O>[]> {
  const out: BatchResult<O>[] = [];
  for (let i = 0; i < items.length; i++) {
    const name = nameOf(items[i]!);
    try {
      out.push({ name, ok: true, output: await op(items[i]!) });
    } catch (e) {
      out.push({ name, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    onProgress?.(i + 1, items.length);
  }
  return out;
}

/** Compose async steps left-to-right into one op — the basis for chained recipes. */
export function chain<T>(...steps: Array<(x: T) => Promise<T>>): (x: T) => Promise<T> {
  return async (x: T) => {
    let v = x;
    for (const step of steps) v = await step(v);
    return v;
  };
}

/** Summarize a batch run, e.g. "3 of 4 succeeded". */
export function summarize(results: BatchResult<unknown>[]): { ok: number; failed: number; total: number; text: string } {
  const ok = results.filter((r) => r.ok).length;
  const total = results.length;
  return { ok, failed: total - ok, total, text: `${ok} of ${total} succeeded${total - ok ? `, ${total - ok} failed` : ''}` };
}
