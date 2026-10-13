import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, font } from '@/constants/theme';

/**
 * The grab bar at the top of a foldable map panel (see usePanelFold): tap it to fold or open, and
 * it says which. `what` names what comes back ("Tools", "Waypoints"). `fromTop` is a panel hanging
 * from the top of the screen (beside the map on a wide website), so the arrows point the other way.
 */
export function PanelHandle({ open, onToggle, what, fromTop = false }: { open: boolean; onToggle: () => void; what: string; fromTop?: boolean }) {
  const down = open !== fromTop;
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={open ? `Hide the ${what.toLowerCase()}` : `Show the ${what.toLowerCase()}`}
      accessibilityHint={fromTop ? undefined : 'You can also swipe the panel down to hide it or up to show it'}
      hitSlop={8}
      style={styles.handle}>
      <View style={styles.bar} />
      <Text style={styles.text}>{open ? 'Hide' : `Show ${what}`} {down ? '▼' : '▲'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  handle: { alignItems: 'center', gap: 4, minHeight: 40, justifyContent: 'center' },
  bar: { width: 44, height: 5, borderRadius: 3, backgroundColor: Colors.textSecondary, opacity: 0.6 },
  text: { color: Colors.textSecondary, fontFamily: font(700), fontSize: 13 },
});
