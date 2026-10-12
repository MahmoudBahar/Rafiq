import { StepperRow } from '@/features/prayer/StepperRow';
import { TunerSection } from '@/features/prayer/TunerSection';
import { toArabicIndic } from '@/shared/lib/arabic';
import { PRAYER_AZKAR_DEFAULT, PRAYER_AZKAR_MAX, PRAYER_AZKAR_MIN, clampPrayerAzkar } from '@/shared/lib/prayerAzkar';
import { useSettings } from '@/shared/storage/settings';

/**
 * How long after each adhan the after-prayer azkar lead the azkar page. One
 * stepper, in minutes, counted from the adhan.
 */
export function PrayerAzkarTune() {
  const { settings, update } = useSettings();
  const value = settings.prayerAzkarMinutes;
  const tuned = value !== PRAYER_AZKAR_DEFAULT;
  return (
    <TunerSection
      title="أذكار بعد الصلاة"
      summary={`${toArabicIndic(value)} دقيقة بعد الأذان`}
      tuned={tuned}
      hint="تُعرض أذكار ما بعد الصلاة في صفحة الأذكار لهذه المدة بعد كل أذان."
      resetLabel="إعادة الافتراضي"
      onReset={() => update({ prayerAzkarMinutes: PRAYER_AZKAR_DEFAULT })}
    >
      <StepperRow
        label="المدة"
        value={`${toArabicIndic(value)} د`}
        neutral={!tuned}
        atMin={value <= PRAYER_AZKAR_MIN}
        atMax={value >= PRAYER_AZKAR_MAX}
        onStep={(d) => update({ prayerAzkarMinutes: clampPrayerAzkar(value + d) })}
      />
    </TunerSection>
  );
}
