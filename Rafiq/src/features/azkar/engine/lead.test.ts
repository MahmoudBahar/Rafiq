import { describe, expect, it } from 'vitest';
import { drawerAction, drawerStatus, drawerTitle, leadSet, zekrCount, type SetStanding } from './lead';

const st = (done: number, total: number): SetStanding => ({ done, total, complete: done >= total, started: done > 0 });

describe('drawer copy', () => {
  it('names the after-prayer set by its prayer', () => {
    expect(drawerTitle('prayer', 'أذكار بعد الصلاة', 'dhuhr')).toBe('بعد الظهر');
    expect(drawerTitle('sleep', 'أذكار النوم', 'dhuhr')).toBe('النوم');
  });
  it('reads the standing, with the minutes left while leading', () => {
    expect(drawerStatus(st(0, 4), null)).toBe('٤ أذكار');
    expect(drawerStatus(st(0, 13), null)).toBe('١٣ ذكرًا');
    expect(drawerStatus(st(2, 6), null)).toBe('٢ من ٦');
    expect(drawerStatus(st(2, 6), 29)).toBe('بقي ٢٩ دقيقة · ٢ من ٦');
    expect(drawerStatus(st(6, 6), 29)).toBe('أتممتها، تقبّل اللّٰه');
    expect(drawerAction(st(0, 4))).toBe('ابدأ');
    expect(drawerAction(st(1, 4))).toBe('تابع');
    expect(drawerAction(st(4, 4))).toBe('أعد القراءة');
  });
});

describe('leadSet', () => {
  const order = ['waking', 'prayer', 'sleep'] as const;
  it('is the after-prayer set while its window is open', () => {
    expect(leadSet(true, order, () => st(4, 4))).toBe('prayer');
  });
  it('is otherwise the first set still owed', () => {
    expect(leadSet(false, order, (s) => (s === 'waking' ? st(4, 4) : st(0, 6)))).toBe('prayer');
    expect(leadSet(false, order, (s) => (s === 'sleep' ? st(0, 13) : st(1, 1)))).toBe('sleep');
    expect(leadSet(false, order, () => st(1, 1))).toBe('waking');
  });
});

describe('zekrCount', () => {
  it('gives the noun the form the number takes', () => {
    expect(zekrCount(1)).toBe('ذكر واحد');
    expect(zekrCount(2)).toBe('ذكران');
    expect(zekrCount(4)).toBe('٤ أذكار');
    expect(zekrCount(10)).toBe('١٠ أذكار');
    expect(zekrCount(11)).toBe('١١ ذكرًا');
    expect(zekrCount(31)).toBe('٣١ ذكرًا');
    expect(zekrCount(100)).toBe('١٠٠ ذكر');
    expect(zekrCount(103)).toBe('١٠٣ أذكار');
  });
});
