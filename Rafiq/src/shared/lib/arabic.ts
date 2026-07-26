const ARABIC_INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/** Replace every ASCII digit with its Arabic-Indic equivalent. */
export function toArabicIndic(value: string | number): string {
  return String(value).replace(/\d/g, (d) => ARABIC_INDIC[Number(d)]);
}

export const pad2 = (n: number): string => String(n).padStart(2, '0');

/** 12-hour clock with Arabic am/pm marker, e.g. `٤:٣٢ ص`. */
export function formatTime12(hours: number, minutes: number): string {
  const h12 = ((hours + 11) % 12) + 1;
  return `${toArabicIndic(`${h12}:${pad2(minutes)}`)} ${hours < 12 ? 'ص' : 'م'}`;
}

/** `H:MM` without the am/pm marker, used for the arc end labels. */
export function formatTimeShort(hours: number, minutes: number): string {
  const h12 = ((hours + 11) % 12) + 1;
  return toArabicIndic(`${h12}:${pad2(minutes)}`);
}

export function formatCountdown(h: number, m: number, s: number): string {
  return toArabicIndic(`${h}:${pad2(m)}:${pad2(s)}`);
}
