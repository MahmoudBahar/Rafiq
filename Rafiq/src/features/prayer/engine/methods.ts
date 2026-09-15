import { CalculationMethod, type CalculationParameters } from 'adhan';
import type { Method } from './types';

export interface MethodDef {
  id: Method;
  name: string;
  sub: string;
  /** Fresh parameters each call; callers mutate madhab / high-latitude rule. */
  params: () => CalculationParameters;
}

/**
 * adhan adds a one-minute Dhuhr precaution to its Egyptian preset that the
 * Egyptian General Authority of Survey does not apply. Checked against Dar
 * al-Ifta's Cairo table for September 2026: without it Dhuhr matches on 28 of
 * 30 days (0 of 30 with it); the other prayers differ only by ±1 min rounding.
 */
function egyptian(): CalculationParameters {
  const p = CalculationMethod.Egyptian();
  p.methodAdjustments.dhuhr = 0;
  return p;
}

/** Shia Ithna-Ashari (Leva Institute, Qum): not an adhan preset, same angles Aladhan uses. */
function jafari(): CalculationParameters {
  const p = CalculationMethod.Other();
  p.fajrAngle = 16;
  p.maghribAngle = 4;
  p.ishaAngle = 14;
  return p;
}

/** Insertion order is display order; Egypt stays first because it is the default. */
export const METHOD_BY_ID: Record<Method, MethodDef> = {
  egypt: {
    id: 'egypt',
    name: 'الهيئة المصرية العامة للمساحة',
    sub: 'الافتراضي في مصر',
    params: egyptian,
  },
  mwl: {
    id: 'mwl',
    name: 'رابطة العالم الإسلامي',
    sub: 'أوروبا والشرق الأقصى',
    params: CalculationMethod.MuslimWorldLeague,
  },
  ummalqura: {
    id: 'ummalqura',
    name: 'أم القرى',
    sub: 'السعودية',
    params: CalculationMethod.UmmAlQura,
  },
  karachi: {
    id: 'karachi',
    name: 'جامعة العلوم الإسلامية بكراتشي',
    sub: 'باكستان وبنغلاديش والهند',
    params: CalculationMethod.Karachi,
  },
  isna: {
    id: 'isna',
    name: 'الجمعية الإسلامية لأمريكا الشمالية',
    sub: 'الولايات المتحدة وكندا',
    params: CalculationMethod.NorthAmerica,
  },
  moonsighting: {
    id: 'moonsighting',
    name: 'لجنة رؤية الهلال',
    sub: 'بريطانيا وأمريكا الشمالية',
    params: CalculationMethod.MoonsightingCommittee,
  },
  dubai: {
    id: 'dubai',
    name: 'الهيئة العامة للشؤون الإسلامية والأوقاف',
    sub: 'الإمارات',
    params: CalculationMethod.Dubai,
  },
  kuwait: {
    id: 'kuwait',
    name: 'وزارة الأوقاف الكويتية',
    sub: 'الكويت',
    params: CalculationMethod.Kuwait,
  },
  qatar: {
    id: 'qatar',
    name: 'وزارة الأوقاف القطرية',
    sub: 'قطر',
    params: CalculationMethod.Qatar,
  },
  turkey: {
    id: 'turkey',
    name: 'رئاسة الشؤون الدينية التركية',
    sub: 'تركيا',
    params: CalculationMethod.Turkey,
  },
  singapore: {
    id: 'singapore',
    name: 'المجلس الإسلامي في سنغافورة',
    sub: 'سنغافورة وماليزيا',
    params: CalculationMethod.Singapore,
  },
  tehran: {
    id: 'tehran',
    name: 'معهد الجيوفيزياء – جامعة طهران',
    sub: 'إيران',
    params: CalculationMethod.Tehran,
  },
  jafari: {
    id: 'jafari',
    name: 'المذهب الجعفري – معهد ليوا، قم',
    sub: 'الشيعة الإثنا عشرية',
    params: jafari,
  },
};

export const METHODS: readonly MethodDef[] = Object.values(METHOD_BY_ID);
