import { Pressable, Text, View } from 'react-native';

import { FullMapButton } from '@/components/full-map';
import { Colors, font, themedStyles } from '@/constants/theme';

/**
 * The grab bar at the top of a foldable map panel (see usePanelFold): tap it to fold or open, and
 * it says which. `what` names what comes back ("Tools", "Waypoints"). `fromTop` is a panel hanging
 * from the top of the screen (beside the map on a tablet or a wide website), so the arrows and the
 * swipe point the other way. `onFullMap` adds the Full Map button at the right end of the bar.
 */
export function PanelHandle({ open, onToggle, what, fromTop = false, onFullMap }: { open: boolean; onToggle: () => void; what: string; fromTop?: boolean; onFullMap?: () => void }) {
  if (!onFullMap) return <Handle open={open} onToggle={onToggle} what={what} fromTop={fromTop} />;
  return (
    <View>
      <Handle open={open} onToggle={onToggle} what={what} fromTop={fromTop} />
      <FullMapButton onPress={onFullMap} style={styles.full} />
    </View>
  );
}

function Handle({ open, onToggle, what, fromTop }: { open: boolean; onToggle: () => void; what: string; fromTop: boolean }) {
  const down = open !== fromTop;
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={open ? `Hide the ${what.toLowerCase()}` : `Show the ${what.toLowerCase()}`}
      accessibilityHint={fromTop ? 'You can also swipe the panel up to hide it or down to show it' : 'You can also swipe the panel down to hide it or up to show it'}
      hitSlop={8}
      style={styles.handle}>
      <View style={styles.bar} />
      <Text style={styles.text}>{open ? 'Hide' : `Show ${what}`} {down ? '▼' : '▲'}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  full: { position: 'absolute', right: 0, top: 3 },
  handle: { alignItems: 'center', gap: 4, minHeight: 40, justifyContent: 'center' },
  bar: { width: 44, height: 5, borderRadius: 3, backgroundColor: Colors.textSecondary, opacity: 0.6 },
  text: { color: Colors.textSecondary, fontFamily: font(700), fontSize: 13 },
}));
