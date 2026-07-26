const memory = new Map<string, string>();

function store(): Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    // access denied (private mode) → fall back to memory
  }
  return null;
}

export const kv = {
  get: (key: string): string | null => {
    const s = store();
    return s ? s.getItem(key) : (memory.get(key) ?? null);
  },
  set: (key: string, value: string): void => {
    const s = store();
    if (s) s.setItem(key, value);
    else memory.set(key, value);
  },
  remove: (key: string): void => {
    const s = store();
    if (s) s.removeItem(key);
    else memory.delete(key);
  },
};
