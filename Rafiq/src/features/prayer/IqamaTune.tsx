import { toArabicIndic } from '@/shared/lib/arabic';
import {
  FARD_KEYS,
  IQAMA_DEFAULTS,
  IQAMA_LIMIT,
  clampIqama,
  isDefaultIqama,
  useSettings,
  type FardKey,
  type IqamaOffsets,
} from '@/shared/storage/settings';
import { FARD_PRAYERS } from './engine';
import { StepperRow } from './StepperRow';
import { TunerSection } from './TunerSection';

/** `١٥ د`, or `بدون` when the iqama is off. */
const formatDelay = (n: number): string => (n === 0 ? 'بدون' : `${toArabicIndic(n)} د`);

function summary(iq: IqamaOffsets): string {
  const values = FARD_KEYS.map((k) => iq[k]);
  if (isDefaultIqama(iq)) return 'الافتراضي';
  if (values.every((v) => v === 0)) return 'معطّلة';
  if (values.every((v) => v === values[0])) return `بعد الأذان بـ ${toArabicIndic(values[0])} د`;
  return 'مخصّصة لكل صلاة';
}

/**
 * Minutes from adhan to iqama, per prayer. Drives the iqama times on the
 * timetable and the second leg of the home countdown.
 */
export function IqamaTune() {
  const { settings, update } = useSettings();
  const iq = settings.iqama;

  const setDelay = (key: FardKey, delta: number) => {
    update({ iqama: { ...iq, [key]: clampIqama(iq[key] + delta) } });
  };

  return (
    <TunerSection
      title="الإقامة"
      summary={summary(iq)}
      tuned={!isDefaultIqama(iq)}
      hint="الدقائق بين الأذان والإقامة لكل صلاة كما في مسجدك. صفر يعطّل الإقامة."
      resetLabel="إعادة الافتراضي"
      onReset={() => update({ iqama: IQAMA_DEFAULTS })}
    >
      {FARD_PRAYERS.map((p) => {
        const value = iq[p.key];
        return (
          <StepperRow
            key={p.key}
            label={p.name}
            value={formatDelay(value)}
            neutral={value === IQAMA_DEFAULTS[p.key]}
            atMin={value <= 0}
            atMax={value >= IQAMA_LIMIT}
            onStep={(d) => setDelay(p.key, d)}
          />
        );
      })}
    </TunerSection>
  );
}
