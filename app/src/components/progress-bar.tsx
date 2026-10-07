import { View } from 'react-native';

import { RideColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function ProgressBar({ fraction, done }: { fraction: number; done?: boolean }) {
  const theme = useTheme();
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
      style={{ height: 10, borderRadius: 5, backgroundColor: theme.backgroundSelected, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: done ? RideColors.green : theme.accent }} />
    </View>
  );
}
