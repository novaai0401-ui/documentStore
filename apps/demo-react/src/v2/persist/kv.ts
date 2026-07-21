/**
 * A tiny promise-based key-value store. IndexedDB in the browser (handles large
 * binary values like PDF bytes via structured clone), with an in-memory fallback
 * for SSR/tests. No dependencies — the foundation for document autosave and the
 * offline document library.
 */
export interface Kv {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, val: T): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/** In-memory KV — used when IndexedDB is unavailable (Node, private mode) and in tests. */
export function memKv(): Kv {
  const m = new Map<string, unknown>();
  return {
    async get<T>(k: string) { return m.get(k) as T | undefined; },
    async set<T>(k: string, v: T) { m.set(k, v); },
    async del(k: string) { m.delete(k); },
    async keys() { return [...m.keys()]; },
  };
}

function idbKv(dbName = 'pdfcraft', store = 'kv'): Kv {
  const dbp = new Promise<IDBDatabase>((res, rej) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store); };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  const run = <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> =>
    dbp.then((db) => new Promise<T>((res, rej) => {
      const t = db.transaction(store, mode);
      const r = fn(t.objectStore(store));
      r.onsuccess = () => res(r.result as T);
      r.onerror = () => rej(r.error);
    }));
  return {
    get: <T>(k: string) => run<T>('readonly', (s) => s.get(k)),
    set: async (k, v) => { await run('readwrite', (s) => s.put(v, k)); },
    del: async (k) => { await run('readwrite', (s) => s.delete(k)); },
    keys: () => run<IDBValidKey[]>('readonly', (s) => s.getAllKeys()).then((ks) => ks.map(String)),
  };
}

/** Open the best available KV: IndexedDB when present, else in-memory. */
export function openKv(): Kv {
  try { if (typeof indexedDB !== 'undefined') return idbKv(); } catch { /* fall through */ }
  return memKv();
}
