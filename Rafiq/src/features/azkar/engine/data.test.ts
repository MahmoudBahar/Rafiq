import { describe, expect, it } from 'vitest';
import { FARD_KEYS } from '@/shared/lib/adjustments';
import { AZKAR_SETS, itemsForPrayer } from '../data';

const AYAH_MARK = '۝';

describe('generated azkar data', () => {
  it('keeps the shipped sets index-aligned with saved progress', () => {
    expect(AZKAR_SETS.morning.items).toHaveLength(31);
    expect(AZKAR_SETS.evening.items).toHaveLength(30);
    expect(AZKAR_SETS.waking.items).toHaveLength(4);
    expect(AZKAR_SETS.prayer.items).toHaveLength(15);
    expect(AZKAR_SETS.sleep.items).toHaveLength(18);
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
    expect(itemsForPrayer('fajr')).toHaveLength(15);
    expect(itemsForPrayer('maghrib')).toHaveLength(14);
    expect(itemsForPrayer('dhuhr')).toHaveLength(13);
    expect(itemsForPrayer('maghrib').map((x) => x.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14]);
    expect(itemsForPrayer('dhuhr').map((x) => x.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14]);
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
          expect(z.surahs).toHaveLength(1);
          for (const s of z.surahs ?? []) expect(s.text.split(AYAH_MARK)).toHaveLength(31);
        }
      }
    }
  });

  it('gives each of the three Quls its own page, as the morning set does', () => {
    expect(AZKAR_SETS.sleep.items.slice(0, 3).map((z) => z.reference)).toEqual(['سورة الإخلاص', 'سورة الفلق', 'سورة الناس']);
    expect(AZKAR_SETS.sleep.items.slice(0, 3).map((z) => z.count)).toEqual([3, 3, 3]);
    expect(AZKAR_SETS.prayer.items.slice(8, 11).map((z) => z.count)).toEqual([1, 1, 1]);
  });

  it('gives every counted phrase after a prayer its own page', () => {
    expect(AZKAR_SETS.prayer.items.slice(0, 8).map((z) => z.count)).toEqual([3, 1, 1, 1, 33, 33, 33, 1]);
    expect(AZKAR_SETS.prayer.items.every((z) => !z.stages)).toBe(true);
    // The second entry has no count in the source: the tahlil and اللَّهُمَّ لاَ مَانِعَ are one zekr, said once.
    expect(AZKAR_SETS.prayer.items[2].text).toMatch(/^لاَ إِلَهَ إِلاَّ اللَّهُ.*قَدِيرٌ، اللَّهُمَّ لاَ مَانِعَ.*الجَدُّ$/s);
  });

  it('splits the sleep tasbih into three pages, the last said thirty-four times', () => {
    expect(AZKAR_SETS.sleep.items.slice(9, 12).map((z) => z.count)).toEqual([33, 33, 34]);
    expect(AZKAR_SETS.sleep.items.slice(9, 12).every((z) => !z.stages)).toBe(true);
    expect(AZKAR_SETS.sleep.items.filter((z) => z.kind === 'surahs').map((z) => z.text)).toEqual(['سورة السجدة', 'سورة الملك']);
  });

  it('ships the mushaf text in proper Unicode, not the KFGQPC legacy codepoints', () => {
    // The Quranpedia text uses U+0657 / U+065E / U+0656 for the open tanween and U+0652 for the
    // silent-letter zero; Scheherazade draws those by their real names (inverted damma, fatha with
    // two dots, subscript alef, sukun). The generator remaps them to U+08F0–U+08F2 and U+06DF.
    const quran: string[] = [];
    for (const set of Object.values(AZKAR_SETS)) {
      for (const z of set.items) {
        const texts = [z.text, ...(z.surahs ?? []).map((s) => s.text), ...(z.stages ?? []).map((s) => s.text)];
        for (const t of texts) expect(t).not.toMatch(/[ٖٗٞ]/);
        // The isti'adha lead line is plain spelling with a standard sukun: only the mushaf part counts.
        if (z.kind === 'quran') quran.push(z.text.includes('\n') ? z.text.slice(z.text.indexOf('\n') + 1) : z.text);
        for (const s of z.surahs ?? []) quran.push(s.text);
      }
    }
    expect(quran.length).toBeGreaterThan(0);
    for (const t of quran) expect(t).not.toMatch(/ْ/);
    expect(quran.some((t) => /[ࣰ-ࣲ]/.test(t))).toBe(true);
    expect(quran.some((t) => /۟/.test(t))).toBe(true);
  });

  it('strips the condition tails from the after-prayer entries', () => {
    for (const z of AZKAR_SETS.prayer.items) expect(z.text).not.toMatch(/بَعْدَ (صَلاةِ|السّلامِ)/);
    expect(AZKAR_SETS.prayer.items[12].text).toMatch(/قَدِيرٌ$/);
    expect(AZKAR_SETS.prayer.items[12].prayers).toEqual(['fajr', 'maghrib']);
  });

  it('carries the after-prayer sources, the virtue of آية الكرسي, and the closing dua', () => {
    const p = AZKAR_SETS.prayer.items;
    expect(p[0].reference).toBe('مُسْلِم');
    expect(p[2].reference).toBe('الْبُخَارِيِّ وَمُسْلِم');
    expect(p.slice(8, 11).map((z) => z.reference)).toEqual(['سورة الإخلاص · التِّرْمِذِيِّ', 'سورة الفلق · التِّرْمِذِيِّ', 'سورة الناس · التِّرْمِذِيِّ']);
    expect(p[11].reference).toBe('آية الكرسى - سورة البقرة 255');
    expect(p[11].virtue).toMatch(/^مَنْ قَرَأَ آيَةَ الكُرْسِيِّ/);
    expect(p[14].text).toBe('اللَّهُمَّ أَعِنِّي عَلَى ذِكْرِكَ، وَشُكْرِكَ، وَحُسْنِ عِبَادَتِكَ');
    expect(p[14].count).toBe(1);
    expect(p[14].reference).toBe('أَبُو دَاوُد');
    expect(p[14].prayers).toBeUndefined();
  });

  it('keeps the hamza seats on tatweel in the mushaf text', () => {
    // 2:255 has «يَــُٔودُهُ»: the hamza above a tatweel; stripping it would break the word.
    expect(AZKAR_SETS.sleep.items[3].text).toMatch(/ـ+ٔ/);
  });
});
