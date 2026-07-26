import { useTheme } from '@/shared/theme/useTheme';
import { Text } from './Text';

export function SectionLabel({ children }: { children: string }) {
  const { c } = useTheme();
  return (
    <Text size={11.5} weight="semi" color={c.tm} style={{ paddingHorizontal: 4 }}>
      {children}
    </Text>
  );
}
