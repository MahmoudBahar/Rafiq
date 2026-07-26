import type { Method } from '@/shared/storage/settings';

export const CITIES = ['القاهرة', 'الإسكندرية', 'الجيزة', 'المنصورة', 'طنطا', 'أسوان'] as const;
export const DEFAULT_CITY = CITIES[0];
export const COUNTRY = 'مصر';

export interface MethodDef {
  id: Method;
  name: string;
  sub: string;
}

export const METHODS: MethodDef[] = [
  { id: 'egypt', name: 'الهيئة المصرية العامة للمساحة', sub: 'الافتراضي في مصر' },
  { id: 'mwl', name: 'رابطة العالم الإسلامي', sub: 'أوروبا والشرق الأقصى' },
  { id: 'ummalqura', name: 'أم القرى', sub: 'السعودية والخليج' },
  { id: 'karachi', name: 'جامعة العلوم الإسلامية بكراتشي', sub: 'باكستان وبنغلاديش والهند' },
];
