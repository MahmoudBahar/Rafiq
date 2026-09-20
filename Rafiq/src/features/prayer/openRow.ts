import { useSyncExternalStore } from 'react';
import type { PrayerKey } from './engine';

/**
 * The home row that is currently open as a prayer page. While it is, the home
 * leaves that row's place empty: the page's hero card is that row, lifted off,
 * and on the way back it lands in the empty place instead of on a second copy
 * of itself. A module-level store, since the two screens share no parent.
 */
export interface OpenRow {
  key: PrayerKey;
  /** `YYYY-MM-DD` of the column the row belongs to. */
  day: string;
}

let current: OpenRow | null = null;
const listeners = new Set<() => void>();

export function setOpenRow(next: OpenRow | null) {
  if (current?.key === next?.key && current?.day === next?.day) return;
  current = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => current;

export function useOpenRow(): OpenRow | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
