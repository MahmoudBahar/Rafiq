import { describe, expect, it } from 'vitest';
import { FARD_KEYS } from '@/shared/lib/adjustments';
import { AZKAR_SETS, itemsForPrayer } from '../data';

const AYAH_MARK = '۝';

describe('generated azkar data', () => {
  it('keeps the shipped sets index-aligned with saved progress', () => {
    expect(AZKAR_SETS.morning.items).toHaveLength(31);
    expect(AZKAR_SETS.evening.items).toHaveLength(30);
    expect(AZKAR_SETS.waking.items).toHaveLength(4);
    expect(AZKAR_SETS.prayer.items).toHaveLength(8);
    expect(AZKAR_SETS.sleep.items).toHaveLength(13);
  });

  it('numbers ids in order with the set prefix', () => {
    for (const set of Object.values(AZKAR_SETS)) {
      set.items.forEach((z, i) => {
        expect(z.id).toBe(`${set.id[0]}${String(i + 1).padStart(2, '0')}`);
      });
    }
  });

  it('sums each staged entry to its count', () => {
    for (const set of Object.values(AZKAR_SETS)) {
      for (const z of set.items) {
        if (!z.stages) continue;
        expect(z.stages.reduce((n, s) => n + s.count, 0)).toBe(z.count);
        expect(z.stages.length).toBeGreaterThan(1);
      }
    }
  });

  it('limits after-prayer entries to real prayers only', () => {
    for (const set of Object.values(AZKAR_SETS)) {
      for (const z of set.items) {
        if (set.id !== 'prayer') expect(z.prayers).toBeUndefined();
        for (const p of z.prayers ?? []) expect(FARD_KEYS).toContain(p);
      }
    }
    expect(itemsForPrayer('fajr')).toHaveLength(8);
    expect(itemsForPrayer('maghrib')).toHaveLength(7);
    expect(itemsForPrayer('dhuhr')).toHaveLength(6);
    expect(itemsForPrayer('maghrib').map((x) => x.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('ships clean text: no stray marks, ayah marks on every Qur\'an entry', () => {
    for (const set of Object.values(AZKAR_SETS)) {
      for (const z of set.items) {
        const texts = [z.text, ...(z.surahs ?? []).map((s) => s.text), ...(z.stages ?? []).map((s) => s.text)];
        for (const t of texts) {
          expect(t.length).toBeGreaterThan(0);
          expect(t).not.toMatch(/[﻿۞]/);
          expect(t).not.toMatch(/\(\(|\)\)/);
        }
        if (z.kind === 'quran') expect(z.text).toContain(AYAH_MARK);
        if (z.kind === 'surahs') {
          expect(z.surahs).toHaveLength(2);
          for (const s of z.surahs ?? []) expect(s.text.split(AYAH_MARK)).toHaveLength(31);
        }
      }
    }
  });

  it('keeps the hamza seats on tatweel in the mushaf text', () => {
    // 2:255 has «يَــُٔودُهُ»: the hamza above a tatweel; stripping it would break the word.
    expect(AZKAR_SETS.sleep.items[1].text).toMatch(/ـ+ٔ/);
  });
});
