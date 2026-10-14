import { StyleSheet } from 'react-native';
import { useTheme } from '@/shared/theme/useTheme';
import { Display } from '@/shared/ui/Text';

/** ۝ followed by Arabic-Indic digits: the end-of-ayah mark the generator writes. */
const AYAH_MARK = /(۝[٠-٩]+)/;

interface QuranTextProps {
  text: string;
  size: number;
}

/** A Qur'an passage with its ayah marks in the accent, so the eye finds the ayah ends. */
export function QuranText({ text, size }: QuranTextProps) {
  const { c } = useTheme();
  const lineHeight = Math.round(size * 1.85);
  const parts = text.split(AYAH_MARK);
  return (
    <Display size={size} lineHeight={lineHeight} align="center" style={styles.wide}>
      {parts.map((p, i) =>
        AYAH_MARK.test(p) ? (
          <Display key={i} size={size} lineHeight={lineHeight} color={c.accent}>
            {p}
          </Display>
        ) : (
          p
        ),
      )}
    </Display>
  );
}

const styles = StyleSheet.create({ wide: { alignSelf: 'stretch' } });
