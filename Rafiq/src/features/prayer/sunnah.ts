/**
 * What to pray around each fard: the rawatib and the other sunnah attached
 * to a prayer's time. Pure data; counts and emphasis only.
 */
import type { PrayerKey } from './engine';

export type Emphasis = 'muakkadah' | 'mustahabb' | 'none';

/** Sky treatment of the page band. */
export type Mood = 'dawn' | 'morning' | 'day' | 'afternoon' | 'dusk' | 'night';

export interface Station {
  id: string;
  title: string;
  /** Rak'ah drawn as beads; 0 for a "nothing here" station. */
  rakaat: number;
  /** Open count: the minimum is drawn solid, the rest faint, up to the maximum. */
  range?: [number, number];
  emphasis: Emphasis;
  tag: string;
  /** One line of guidance. */
  line: string;
}

export interface PrayerGuide {
  key: PrayerKey;
  title: string;
  /** 0 on the Duha page, which has no fard. */
  fardRakaat: number;
  before: Station | null;
  after: Station | null;
  /** Witr, Duha: prayers of the time that are not rawatib. */
  extras: Station[];
  /** Which of the twelve daily rawatib beads (0–11) belong here. */
  rawatib: number[];
  mood: Mood;
}

const TAG: Record<Emphasis, string> = { muakkadah: 'سنة مؤكدة', mustahabb: 'سنة مستحبة', none: 'لا سنة راتبة' };

const station = (
  id: string,
  title: string,
  rakaat: number,
  emphasis: Emphasis,
  line: string,
  range?: [number, number],
): Station => ({ id, title, rakaat, emphasis, tag: TAG[emphasis], line, range });

const BEFORE = 'قبل الفريضة';
const AFTER = 'بعد الفريضة';

/** Order of the twelve daily rawatib beads: Fajr 2 · Dhuhr 4 · Dhuhr 2 · Maghrib 2 · Isha 2. */
export const RAWATIB_GROUPS: readonly number[] = [2, 4, 2, 2, 2];
export const RAWATIB_TOTAL = 12;

const range = (from: number, count: number) => Array.from({ length: count }, (_, i) => from + i);

const GUIDES: Record<PrayerKey, PrayerGuide> = {
  fajr: {
    key: 'fajr',
    title: 'الفجر',
    fardRakaat: 2,
    before: station('fajr-before', BEFORE, 2, 'muakkadah', 'ركعتان خفيفتان، وهما أوكد الرواتب'),
    after: station('fajr-after', AFTER, 0, 'none', 'لا نافلة بعد الفجر حتى تطلع الشمس'),
    extras: [],
    rawatib: range(0, 2),
    mood: 'dawn',
  },
  sunrise: {
    key: 'sunrise',
    title: 'الضحى',
    fardRakaat: 0,
    before: null,
    after: null,
    extras: [
      station('duha', 'صلاة الضحى', 2, 'mustahabb', 'ركعتان فأكثر بعد ارتفاع الشمس، وأفضلها حين يشتد الحر', [2, 8]),
    ],
    rawatib: [],
    mood: 'morning',
  },
  dhuhr: {
    key: 'dhuhr',
    title: 'الظهر',
    fardRakaat: 4,
    before: station('dhuhr-before', BEFORE, 4, 'muakkadah', 'أربع بتسليمتين، وأقلّها ركعتان'),
    after: station('dhuhr-after', AFTER, 2, 'muakkadah', 'ركعتان، ويُستحب أربع'),
    extras: [],
    rawatib: range(2, 6),
    mood: 'day',
  },
  asr: {
    key: 'asr',
    title: 'العصر',
    fardRakaat: 4,
    before: station('asr-before', BEFORE, 4, 'mustahabb', 'أربع ركعات غير مؤكدة، بتسليمتين'),
    after: station('asr-after', AFTER, 0, 'none', 'لا نافلة بعد العصر حتى تغرب الشمس'),
    extras: [],
    rawatib: [],
    mood: 'afternoon',
  },
  maghrib: {
    key: 'maghrib',
    title: 'المغرب',
    fardRakaat: 3,
    before: station('maghrib-before', BEFORE, 2, 'mustahabb', 'ركعتان خفيفتان بين الأذان والإقامة'),
    after: station('maghrib-after', AFTER, 2, 'muakkadah', 'ركعتان مؤكدتان، والأفضل في البيت'),
    extras: [],
    rawatib: range(8, 2),
    mood: 'dusk',
  },
  isha: {
    key: 'isha',
    title: 'العشاء',
    fardRakaat: 4,
    before: station('isha-before', BEFORE, 2, 'mustahabb', 'ركعتان بين الأذان والإقامة'),
    after: station('isha-after', AFTER, 2, 'muakkadah', 'ركعتان مؤكدتان'),
    extras: [
      station('witr', 'الوتر', 1, 'muakkadah', 'أقلّه ركعة وأكثره إحدى عشرة، وهو ختام صلاة الليل', [1, 11]),
    ],
    rawatib: range(10, 2),
    mood: 'night',
  },
};

/** Friday's Dhuhr is Jumu'ah, with its own sunnah. */
const JUMUAH: PrayerGuide = {
  key: 'dhuhr',
  title: 'الجمعة',
  fardRakaat: 2,
  before: station('jumuah-before', BEFORE, 2, 'mustahabb', 'نافلة مطلقة حتى يصعد الإمام المنبر', [2, 4]),
  after: station('jumuah-after', AFTER, 4, 'muakkadah', 'أربع في المسجد، أو ركعتان في البيت'),
  extras: [],
  rawatib: [],
  mood: 'day',
};

const FRIDAY = 5;

export function guideFor(key: PrayerKey, date: Date): PrayerGuide {
  if (key === 'dhuhr' && date.getDay() === FRIDAY) return JUMUAH;
  return GUIDES[key];
}

/** Stations in reading order: before, the fard (as `null`), after, extras. */
export function stationsOf(g: PrayerGuide): (Station | 'fard')[] {
  const out: (Station | 'fard')[] = [];
  if (g.before) out.push(g.before);
  if (g.fardRakaat > 0) out.push('fard');
  if (g.after) out.push(g.after);
  out.push(...g.extras);
  return out;
}

const RAKAAT_WORDS: Record<number, string> = {
  1: 'ركعة',
  2: 'ركعتان',
  3: 'ثلاث ركعات',
  4: 'أربع ركعات',
};

/** `ركعتان`, `أربع ركعات`, `٢–٨ ركعات`. */
export function rakaatLabel(n: number, r?: [number, number]): string {
  if (r) return `${toIndic(r[0])}–${toIndic(r[1])} ركعات`;
  return RAKAAT_WORDS[n] ?? `${toIndic(n)} ركعة`;
}

const INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const toIndic = (n: number) => String(n).replace(/\d/g, (d) => INDIC[Number(d)]);
