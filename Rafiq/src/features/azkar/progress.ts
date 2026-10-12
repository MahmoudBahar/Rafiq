import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { kv } from '@/shared/storage/kv';
import { AZKAR_DATA_VERSION, AZKAR_SETS, type AzkarSetId } from './data';

/**
 * A session's repetition counts per set. They live beside the settings blob,
 * not in it: that blob is rewritten whole on every change, and a hundred-count
 * tasbih would rewrite it a hundred times. Here taps only touch memory and
 * the write trails behind them.
 *
 * A session is named by an opaque key: the azkar day for most sets, the
 * calendar day for waking, and `day|prayer` for the after-prayer set, whose
 * counts always cover all eight entries even when a prayer shows six.
 */

interface Saved {
  v: number;
  day: string;
  counts: number[];
}

/**
 * One slot per set, except the after-prayer set, which keeps one per prayer:
 * its session key is `day|prayer`, and reading Asr's azkar must not discard
 * Dhuhr's counts from an hour earlier.
 */
const KEY = (set: AzkarSetId, day: string) =>
  set === 'prayer' ? `rafiq.azkar.progress.v1.${set}.${day.split('|')[1] ?? ''}` : `rafiq.azkar.progress.v1.${set}`;
const WRITE_DELAY_MS = 600;

// Keyed by set and day: around Fajr the tab (still on yesterday's key) and a freshly
// opened reader (today's) are mounted together, and one entry per set had each
// evicting the other: a new snapshot object on every read, and a blank could be
// the value that reached the delayed write.
const cache = new Map<string, Saved>();
const slot = (set: AzkarSetId, day: string) => `${set}|${day}`;
/** The latest value owed to storage, per storage key. */
const dirty = new Map<string, Saved>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let watching = false;

const blank = (set: AzkarSetId, day: string): Saved => ({
  v: AZKAR_DATA_VERSION,
  day,
  counts: AZKAR_SETS[set].items.map(() => 0),
});

function read(set: AzkarSetId, day: string): Saved {
  const hit = cache.get(slot(set, day));
  if (hit) return hit;
  let next = blank(set, day);
  try {
    const raw = kv.get(KEY(set, day));
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
  cache.set(slot(set, day), next);
  return next;
}

/** Write pending counts now: a zekr completed, the reader closing, the app leaving the foreground. */
export function flushAzkarProgress() {
  if (timer) clearTimeout(timer);
  timer = null;
  for (const [key, value] of dirty) {
    try {
      kv.set(key, JSON.stringify(value));
    } catch {
      // persistence is best-effort
    }
  }
  dirty.clear();
}

function commit(set: AzkarSetId, next: Saved) {
  cache.set(slot(set, next.day), next);
  dirty.set(KEY(set, next.day), next);
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
  /** One count per entry of the set, whatever `indices` shows. */
  counts: readonly number[];
  /** Pages whose count is complete. */
  done: number;
  /** Pages shown. */
  total: number;
  /** First page still owed, or `total` when every page is complete. */
  firstIncomplete: number;
  complete: boolean;
  /** `index` is the entry's position in the set, not the page. */
  setCount: (index: number, count: number) => void;
  reset: () => void;
}

const allOf = (set: AzkarSetId) => AZKAR_SETS[set].items.map((_, i) => i);

/** What is saved right now for a session, without subscribing: for seeding when the session changes under the reader. */
export function countsOf(set: AzkarSetId, dayKey: string): readonly number[] {
  return read(set, dayKey).counts;
}

/** First page still owed, from what is saved right now: for jumping when the session changes under the reader. */
export function firstIncompleteOf(set: AzkarSetId, dayKey: string, indices: readonly number[] = allOf(set)): number {
  const { counts } = read(set, dayKey);
  const items = AZKAR_SETS[set].items;
  const at = indices.findIndex((i) => counts[i] < items[i].count);
  return at < 0 ? indices.length : at;
}

/**
 * The session's counts, with the totals taken over `indices`: the entries the
 * session shows, in page order (the after-prayer set shows a different subset
 * per prayer). Defaults to every entry.
 */
export function useAzkarProgress(set: AzkarSetId, dayKey: string, indices?: readonly number[]): AzkarProgress {
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
    const shown = indices ?? items.map((_, i) => i);
    const total = shown.length;
    let done = 0;
    let firstIncomplete = total;
    shown.forEach((i, page) => {
      if (saved.counts[i] >= items[i].count) done++;
      else if (firstIncomplete === total) firstIncomplete = page;
    });
    return { counts: saved.counts, done, total, firstIncomplete, complete: done === total, setCount, reset };
  }, [set, saved, indices, setCount, reset]);
}
