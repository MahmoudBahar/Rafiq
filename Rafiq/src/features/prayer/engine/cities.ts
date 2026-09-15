import type { Coords } from './types';

export interface City extends Coords {
  name: string;
  /** Governorate, shown under the name in the wheel. */
  gov: string;
}

/**
 * The localities the Egyptian General Authority of Survey publishes tables
 * for (esa.gov.eg/praytimes.aspx), in the authority's own order. Names are
 * the authority's, normalised (no tatweel, hamza spelling). Coordinates are
 * static seeds (OpenStreetMap, checked by hand for the new cities).
 */
export const CITIES: readonly City[] = [
  { name: 'القاهرة', gov: 'القاهرة', latitude: 30.0444, longitude: 31.2357 },
  { name: 'الإسكندرية', gov: 'الإسكندرية', latitude: 31.1992, longitude: 29.8952 },
  { name: 'طنطا', gov: 'الغربية', latitude: 30.7834, longitude: 30.9983 },
  { name: 'المنصورة', gov: 'الدقهلية', latitude: 31.0376, longitude: 31.3865 },
  { name: 'الزقازيق', gov: 'الشرقية', latitude: 30.5853, longitude: 31.5035 },
  { name: 'أسيوط', gov: 'أسيوط', latitude: 27.1999, longitude: 31.1627 },
  { name: 'سوهاج', gov: 'سوهاج', latitude: 26.7625, longitude: 32.091 },
  { name: 'بني سويف', gov: 'بني سويف', latitude: 29.073, longitude: 31.0983 },
  { name: 'المنيا', gov: 'المنيا', latitude: 28.2125, longitude: 30.9124 },
  { name: 'قنا', gov: 'قنا', latitude: 26.2408, longitude: 32.9084 },
  { name: 'أسوان', gov: 'أسوان', latitude: 24.0911, longitude: 32.8973 },
  { name: 'مطروح', gov: 'مطروح', latitude: 31.3529, longitude: 27.2395 },
  { name: 'الغردقة', gov: 'البحر الأحمر', latitude: 27.2226, longitude: 33.8307 },
  { name: 'الخارجة', gov: 'الوادي الجديد', latitude: 25.4419, longitude: 30.5581 },
  { name: 'الإسماعيلية', gov: 'الإسماعيلية', latitude: 30.6044, longitude: 32.2771 },
  { name: 'دمياط', gov: 'دمياط', latitude: 31.4167, longitude: 31.8214 },
  { name: 'السلوم', gov: 'مطروح', latitude: 31.5516, longitude: 25.1542 },
  { name: 'نويبع', gov: 'جنوب سيناء', latitude: 29.035, longitude: 34.6617 },
  { name: 'حلايب', gov: 'البحر الأحمر', latitude: 22.2238, longitude: 36.6476 },
  { name: 'شرم الشيخ', gov: 'جنوب سيناء', latitude: 27.8644, longitude: 34.2954 },
  { name: 'الفيوم', gov: 'الفيوم', latitude: 29.3074, longitude: 30.84 },
  { name: '٦ أكتوبر', gov: 'الجيزة', latitude: 29.9723, longitude: 30.9409 },
  { name: 'كفر الشيخ', gov: 'كفر الشيخ', latitude: 31.3815, longitude: 30.8514 },
  { name: 'الحامول', gov: 'كفر الشيخ', latitude: 31.3305, longitude: 31.1749 },
  { name: 'بلطيم', gov: 'كفر الشيخ', latitude: 31.5544, longitude: 31.0903 },
  { name: 'طابا', gov: 'جنوب سيناء', latitude: 29.4928, longitude: 34.8924 },
  { name: 'رأس سدر', gov: 'جنوب سيناء', latitude: 29.5935, longitude: 32.7185 },
  { name: 'الطور', gov: 'جنوب سيناء', latitude: 28.2417, longitude: 33.6236 },
  { name: 'دهب', gov: 'جنوب سيناء', latitude: 28.4964, longitude: 34.5146 },
  { name: 'أبو زنيمة', gov: 'جنوب سيناء', latitude: 29.0512, longitude: 33.1041 },
  { name: 'رأس غارب', gov: 'البحر الأحمر', latitude: 28.3594, longitude: 33.0778 },
  { name: 'القصير', gov: 'البحر الأحمر', latitude: 26.1048, longitude: 34.2798 },
  { name: 'برنيس', gov: 'البحر الأحمر', latitude: 23.93, longitude: 35.48 },
  { name: 'سفاجا', gov: 'البحر الأحمر', latitude: 26.7633, longitude: 33.9384 },
  { name: 'مرسى علم', gov: 'البحر الأحمر', latitude: 25.07, longitude: 34.8938 },
  { name: 'شلاتين', gov: 'البحر الأحمر', latitude: 23.13, longitude: 35.59 },
  { name: 'سيدي براني', gov: 'مطروح', latitude: 31.6113, longitude: 25.9258 },
  { name: 'الضبعة', gov: 'مطروح', latitude: 31.0289, longitude: 28.4444 },
  { name: 'العلمين', gov: 'مطروح', latitude: 30.8339, longitude: 28.9493 },
  { name: 'واحة سيوة', gov: 'مطروح', latitude: 29.2035, longitude: 25.5192 },
  { name: 'موط (الداخلة)', gov: 'الوادي الجديد', latitude: 25.4895, longitude: 28.9866 },
  { name: 'الفرافرة', gov: 'الوادي الجديد', latitude: 27.0642, longitude: 27.9684 },
  { name: 'الباويطي', gov: 'الجيزة', latitude: 28.3518, longitude: 28.863 },
  { name: 'باريس', gov: 'الوادي الجديد', latitude: 24.6737, longitude: 30.6051 },
  { name: 'المحلة الكبرى', gov: 'الغربية', latitude: 30.9724, longitude: 31.1683 },
  { name: 'الحمام', gov: 'مطروح', latitude: 30.83, longitude: 29.38 },
  { name: 'نجع حمادي', gov: 'قنا', latitude: 26.049, longitude: 32.2416 },
  { name: 'بورسعيد', gov: 'بورسعيد', latitude: 31.2632, longitude: 32.3055 },
  { name: 'السويس', gov: 'السويس', latitude: 29.9745, longitude: 32.5371 },
  { name: 'العريش', gov: 'شمال سيناء', latitude: 31.13, longitude: 33.8 },
  { name: 'دمنهور', gov: 'البحيرة', latitude: 31.0375, longitude: 30.4711 },
  { name: 'إدفو', gov: 'أسوان', latitude: 24.9803, longitude: 32.8747 },
  { name: 'إسنا', gov: 'الأقصر', latitude: 25.2937, longitude: 32.5532 },
  { name: 'الأقصر', gov: 'الأقصر', latitude: 25.7021, longitude: 32.6472 },
  { name: 'القاهرة الجديدة', gov: 'القاهرة', latitude: 30.0278, longitude: 31.4757 },
  { name: 'توشكى', gov: 'أسوان', latitude: 22.62, longitude: 31.29 },
  { name: 'الدلنجات', gov: 'البحيرة', latitude: 30.8281, longitude: 30.5342 },
  { name: 'سانت كاترين', gov: 'جنوب سيناء', latitude: 28.5675, longitude: 33.9536 },
  { name: 'مدينة السادات', gov: 'المنوفية', latitude: 30.3669, longitude: 30.6025 },
  { name: '١٥ مايو', gov: 'القاهرة', latitude: 29.832, longitude: 31.3648 },
  { name: 'الصالحية الجديدة', gov: 'الشرقية', latitude: 30.6317, longitude: 31.9393 },
  { name: 'العاشر من رمضان', gov: 'الشرقية', latitude: 30.29, longitude: 31.7493 },
  { name: 'العاصمة الإدارية الجديدة', gov: 'القاهرة', latitude: 30.0238, longitude: 31.7549 },
  { name: 'العبور', gov: 'القليوبية', latitude: 30.1914, longitude: 31.4505 },
  { name: 'الفشن الجديدة', gov: 'بني سويف', latitude: 28.82, longitude: 30.9 },
  { name: 'المنصورة الجديدة', gov: 'الدقهلية', latitude: 31.42, longitude: 31.55 },
  { name: 'النوبارية الجديدة', gov: 'البحيرة', latitude: 30.6664, longitude: 30.0766 },
  { name: 'بدر', gov: 'القاهرة', latitude: 30.1428, longitude: 31.7428 },
  { name: 'بني مزار الجديدة', gov: 'المنيا', latitude: 28.5, longitude: 30.8 },
  { name: 'بورسعيد الجديدة (سلام)', gov: 'بورسعيد', latitude: 31.2, longitude: 32.38 },
  { name: 'بئر العبد الجديدة', gov: 'شمال سيناء', latitude: 31.02, longitude: 33.01 },
  { name: 'توشكى الجديدة', gov: 'أسوان', latitude: 22.5, longitude: 31.42 },
  { name: 'حدائق العاصمة', gov: 'القاهرة', latitude: 30.1, longitude: 31.72 },
  { name: 'رشيد الجديدة', gov: 'البحيرة', latitude: 31.4, longitude: 30.42 },
  { name: 'رفح الجديدة', gov: 'شمال سيناء', latitude: 31.27, longitude: 34.15 },
  { name: 'سفنكس الجديدة', gov: 'الجيزة', latitude: 30.11, longitude: 30.9 },
  { name: 'شرق العوينات', gov: 'الوادي الجديد', latitude: 22.5732, longitude: 28.5232 },
  { name: 'غرب النوبارية', gov: 'البحيرة', latitude: 30.55, longitude: 29.95 },
  { name: 'منوف', gov: 'المنوفية', latitude: 30.4665, longitude: 30.934 },
  { name: 'ديرب نجم', gov: 'الشرقية', latitude: 30.7514, longitude: 31.4585 },
  { name: 'أبو تشت', gov: 'قنا', latitude: 26.0614, longitude: 32.2129 },
  { name: 'سمالوط', gov: 'المنيا', latitude: 28.311, longitude: 30.7104 },
];

export const DEFAULT_CITY = CITIES[0].name;
export const COUNTRY = 'مصر';

/** Falls back to the default city so the engine always has coordinates. */
export function cityByName(name: string | null): City {
  return CITIES.find((c) => c.name === name) ?? CITIES[0];
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function distanceKm(a: Coords, b: Coords): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export interface NearCity {
  city: City;
  km: number;
}

/** Closest listed city within `maxKm` and how far it is, or null. */
export function nearestCity(coords: Coords, maxKm = 40): NearCity | null {
  let best: NearCity | null = null;
  for (const city of CITIES) {
    const km = distanceKm(coords, city);
    if (km <= maxKm && (!best || km < best.km)) best = { city, km };
  }
  return best;
}
