import { toArabicIndic } from '@/shared/lib/arabic';
import type { Qibla } from './useQibla';

export interface Hint {
  /** What to do next, as shown under the dial. */
  line: string;
  /** The same, for a screen reader: «°» spelled out with the right number agreement. */
  spoken: string;
  /** The bearing from north, as shown; null without coordinates. */
  sub: string | null;
  subSpoken: string | null;
  /** On the Qibla, on a compass that can be believed: the line takes the accent. */
  locked: boolean;
}

/**
 * "n degrees" in Arabic, as a screen reader should say it: one and two take
 * the singular and dual, three to ten the plural, eleven and up the singular.
 */
export function degreesSpoken(n: number): string {
  if (n === 1) return 'درجة واحدة';
  if (n === 2) return 'درجتان';
  if (n >= 3 && n <= 10) return `${toArabicIndic(n)} درجات`;
  return `${toArabicIndic(n)} درجة`;
}

/** The hint under the dial, first match wins: why the compass cannot help yet, else which way to turn. */
export function hintFor(q: Pick<Qibla, 'band' | 'turnDeg' | 'turnRight' | 'confidence' | 'raised' | 'bearing' | 'ready'>): Hint {
  const { band, turnDeg, turnRight, confidence, raised, bearing, ready } = q;
  const same = (line: string) => ({ line, spoken: line });
  const { line, spoken } = (() => {
    if (confidence === 'no-location') return same('حدّد موقعك أولًا');
    if (confidence === 'unavailable') return same('لا توجد بوصلة في هذا الجهاز');
    if (raised) return same('ضع الهاتف مستويًا');
    if (confidence === 'calibrate') return same('المعايرة مطلوبة أولًا');
    if (confidence === 'interference') return same('الاتجاه غير موثوق الآن');
    // No heading yet: the turn numbers would be made up.
    if (!ready) return same('جارٍ تحديد الاتجاه…');
    if (band === 'locked') return same('أنت في اتجاه القبلة');
    const side = turnRight ? 'يمينًا' : 'يسارًا';
    return { line: `أدر ${side} ${toArabicIndic(turnDeg)}°`, spoken: `أدر ${side} ${degreesSpoken(turnDeg)}` };
  })();
  const deg = bearing === null ? null : Math.round(bearing);
  return {
    line,
    spoken,
    sub: deg === null ? null : `${toArabicIndic(deg)}° من الشمال`,
    subSpoken: deg === null ? null : `القبلة على ${degreesSpoken(deg)} من الشمال`,
    locked: ready && band === 'locked' && confidence === 'good' && !raised,
  };
}
