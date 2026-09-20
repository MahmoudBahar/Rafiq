import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { kv } from '@/shared/storage/kv';
import { AZKAR_DATA_VERSION, AZKAR_SETS, type AzkarSetId } from './data';

/**
 * Today's repetition counts per set. They live beside the settings blob, not
 * in it: that blob is rewritten whole on every change, and a hundred-count
 * tasbih would rewrite it a hundred times. Here taps only touch memory and
 * the write trails behind them.
 */

interface Saved {
  v: number;
  day: string;
  counts: number[];
}

const KEY = (set: AzkarSetId) => `rafiq.azkar.progress.v1.${set}`;
const WRITE_DELAY_MS = 600;

const cache: Partial<Record<AzkarSetId, Saved>> = {};
const dirty = new Set<AzkarSetId>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let watching = false;

const blank = (set: AzkarSetId, day: string): Saved => ({
  v: AZKAR_DATA_VERSION,
  day,
  counts: AZKAR_SETS[set].items.map(() => 0),
});

function read(set: AzkarSetId, day: string): Saved {
  const hit = cache[set];
  if (hit && hit.day === day) return hit;
  let next = blank(set, day);
  try {
    const raw = kv.get(KEY(set));
    const parsed = raw ? (JSON.parse(raw) as Partial<Saved>) : null;
    const n = next.counts.length;
    if (
      parsed &&
      parsed.v === AZKAR_DATA_VERSION &&
      parsed.day === day &&
      Array.isArray(parsed.counts) &&
      parsed.counts.length === n
    ) {
      next = { v: parsed.v, day, counts: parsed.counts.map((c) => (Number.isFinite(c) ? Math.max(0, Math.floor(c)) : 0)) };
    }
  } catch {
    // unreadable progress is simply a fresh day
  }
  cache[set] = next;
  return next;
}

/** Write pending counts now: a zekr completed, the reader closing, the app leaving the foreground. */
export function flushAzkarProgress() {
  if (timer) clearTimeout(timer);
  timer = null;
  for (const set of dirty) {
    const value = cache[set];
    if (!value) continue;
    try {
      kv.set(KEY(set), JSON.stringify(value));
    } catch {
      // persistence is best-effort
    }
  }
  dirty.clear();
}

function commit(set: AzkarSetId, next: Saved) {
  cache[set] = next;
  dirty.add(set);
  listeners.forEach((l) => l());
  if (timer) clearTimeout(timer);
  timer = setTimeout(flushAzkarProgress, WRITE_DELAY_MS);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!watching) {
    watching = true;
    AppState.addEventListener('change', (state) => {
      if (state !== 'active') flushAzkarProgress();
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

export interface AzkarProgress {
  counts: readonly number[];
  /** Azkar whose count is complete. */
  done: number;
  total: number;
  /** First zekr still owed, or `total` when the set is complete. */
  firstIncomplete: number;
  complete: boolean;
  setCount: (index: number, count: number) => void;
  reset: () => void;
}

export function useAzkarProgress(set: AzkarSetId, dayKey: string): AzkarProgress {
  const snapshot = useCallback(() => read(set, dayKey), [set, dayKey]);
  const saved = useSyncExternalStore(subscribe, snapshot, snapshot);

  const setCount = useCallback(
    (index: number, count: number) => {
      const cur = read(set, dayKey);
      if (cur.counts[index] === count) return;
      const counts = cur.counts.slice();
      counts[index] = count;
      commit(set, { ...cur, counts });
    },
    [set, dayKey],
  );
  const reset = useCallback(() => {
    commit(set, blank(set, dayKey));
    flushAzkarProgress();
  }, [set, dayKey]);

  return useMemo(() => {
    const items = AZKAR_SETS[set].items;
    const total = items.length;
    let done = 0;
    let firstIncomplete = total;
    items.forEach((z, i) => {
      if (saved.counts[i] >= z.count) done++;
      else if (firstIncomplete === total) firstIncomplete = i;
    });
    return { counts: saved.counts, done, total, firstIncomplete, complete: done === total, setCount, reset };
  }, [set, saved, setCount, reset]);
}
