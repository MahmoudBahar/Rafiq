import { toArabicIndic } from '@/shared/lib/arabic';
import { ADJUST_LIMIT, clampAdjust, useSettings, type Adjustments, type FardKey } from '@/shared/storage/settings';
import { FARD_PRAYERS } from './engine';
import { StepperRow } from './StepperRow';
import { TunerSection } from './TunerSection';

/** `+٢ د`, `−٣ د`, or `٠`. */
function formatAdjust(n: number): string {
  if (n === 0) return '٠';
  return `${n > 0 ? '+' : '−'}${toArabicIndic(Math.abs(n))} د`;
}

function summary(adj: Adjustments): string {
  const count = Object.values(adj).filter((v) => v).length;
  if (count === 0) return 'معطّل';
  if (count === 1) return 'صلاة واحدة';
  if (count === 2) return 'صلاتان';
  return `${toArabicIndic(count)} صلوات`;
}

/**
 * Per-prayer minute offsets on the adhan, for matching a local mosque table.
 * Writes straight to settings; everything downstream recomputes.
 */
export function FineTune() {
  const { settings, update } = useSettings();
  const adj = settings.adjustments;
  const anyTuned = Object.values(adj).some((v) => v);

  const setAdj = (key: FardKey, delta: number) => {
    const next = clampAdjust((adj[key] ?? 0) + delta);
    const merged: Adjustments = { ...adj };
    if (next === 0) delete merged[key];
    else merged[key] = next;
    update({ adjustments: merged });
  };

  return (
    <TunerSection
      title="ضبط وقت الأذان"
      summary={summary(adj)}
      tuned={anyTuned}
      hint="أضف أو اطرح دقائق من وقت الأذان لكل صلاة لمطابقة جدول مسجدك."
      resetLabel="إعادة الضبط"
      onReset={() => update({ adjustments: {} })}
    >
      {FARD_PRAYERS.map((p) => {
        const value = adj[p.key] ?? 0;
        return (
          <StepperRow
            key={p.key}
            label={p.name}
            value={formatAdjust(value)}
            neutral={value === 0}
            atMin={value <= -ADJUST_LIMIT}
            atMax={value >= ADJUST_LIMIT}
            onStep={(d) => setAdj(p.key, d)}
          />
        );
      })}
    </TunerSection>
  );
}
