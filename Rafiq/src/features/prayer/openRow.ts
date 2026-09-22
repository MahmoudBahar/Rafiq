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

/** Window-relative top and height of the open row's place on the home, in dp. */
export interface RowPlace {
  y: number;
  h: number;
}
type Measurer = (done: (place: RowPlace | null) => void) => void;
let measurer: Measurer | null = null;

/** The home row whose place is being kept registers how to measure it. */
export function setOpenRowMeasurer(next: Measurer | null) {
  measurer = next;
}

/**
 * Where the open row's place is right now. The page was given the row's
 * rectangle when it opened, but the home lives on underneath (the next prayer
 * changing resizes two rows), so the return asks again before it sets off.
 */
export function measureOpenRow(done: (place: RowPlace | null) => void) {
  if (measurer) measurer(done);
  else done(null);
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
