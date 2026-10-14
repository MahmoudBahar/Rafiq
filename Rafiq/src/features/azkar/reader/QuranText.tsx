import { StyleSheet } from 'react-native';
import { useTheme } from '@/shared/theme/useTheme';
import { Display } from '@/shared/ui/Text';

/** ۝ followed by Arabic-Indic digits: the end-of-ayah mark the generator writes. */
const AYAH_MARK = /(۝[٠-٩]+)/;

/**
 * The one size every reader page is set in: a short zekr, a Qur'an passage and
 * a whole surah alike. A passage that does not fit scrolls rather than shrink,
 * so the text never changes size from one page to the next.
 */
export const READER_TEXT_SIZE = 26;
export const READER_LINE_HEIGHT = Math.round(READER_TEXT_SIZE * 1.85);

interface QuranTextProps {
  text: string;
}

/** A Qur'an passage with its ayah marks in the accent, so the eye finds the ayah ends. */
export function QuranText({ text }: QuranTextProps) {
  const { c } = useTheme();
  const parts = text.split(AYAH_MARK);
  return (
    <Display size={READER_TEXT_SIZE} lineHeight={READER_LINE_HEIGHT} align="center" style={styles.wide}>
      {parts.map((p, i) =>
        AYAH_MARK.test(p) ? (
          <Display key={i} size={READER_TEXT_SIZE} lineHeight={READER_LINE_HEIGHT} color={c.accent}>
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
