import { StyleSheet, View } from 'react-native';

import { Colors, RideColors } from '@/constants/theme';
import { Icon } from './icon';

/**
 * The small amber wrench on a rider's dot and list row while they have a Mechanical Issue.
 * Amber, not red: red stays for help calls and EMERGENCY.
 */
export function BreakdownBadge({ size = 20 }: { size?: number }) {
  return (
    <View
      accessible
      accessibilityLabel="Mechanical Issue"
      style={[styles.badge, { width: size, height: size, borderRadius: size / 2 }]}>
      <Icon name="wrench" size={size * 0.62} color={Colors.background} strokeWidth={2.6} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center', backgroundColor: RideColors.yellow, borderWidth: 2, borderColor: Colors.background },
});
