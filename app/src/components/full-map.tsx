import { useMemo, type ReactNode } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Colors, font, Radius, RideColors } from '@/constants/theme';
import { FULL_MAP_BAR_H, RESTORE_LABEL, restoreA11yLabel, swipeRestores } from '@/core/full-map';
import { isVerticalSwipe } from '@/core/panel-swipe';

const glass = { backgroundColor: 'rgba(10,22,38,0.92)', borderWidth: 1, borderColor: Colors.border } as const;

/**
 * The small "Full Map" button that tucks a screen's bars and panels away (see useFullMap). It sits
 * in the same place on every map screen: the right end of the panel's grab bar.
 */
export function FullMapButton({ onPress, style }: { onPress: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Full Map"
      accessibilityHint="Hides the bars and panels so the map fills the screen. Tap Controls to bring them back"
      hitSlop={8}
      style={({ pressed }) => [styles.fullBtn, pressed && { opacity: 0.75 }, style]}>
      <Icon name="expand" size={16} color={Colors.text} strokeWidth={2.4} />
      <Text style={styles.fullText}>Full Map</Text>
    </Pressable>
  );
}

/**
 * What stays on screen in Full Map: one slim bar at the bottom with Controls (tap it, or swipe the
 * bar up, to bring everything back) and whatever that screen must never hide, passed as children
 * (the miles and Undo while drawing a route, speed in Navigate). `waiting` counts alerts tucked
 * away. `wide` floats it in the bottom-left corner on a tablet or a wide website instead of across
 * the bottom.
 */
export function FullMapBar({
  onRestore, waiting = 0, children, wide = false, credit,
}: {
  onRestore: () => void;
  waiting?: number;
  children?: ReactNode;
  wide?: boolean;
  /** Map data credit that must stay visible (OpenStreetMap when its trails are drawn). */
  credit?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => isVerticalSwipe(g.dx, g.dy),
        onPanResponderRelease: (_e, g) => {
          if (swipeRestores(g.dy, g.vy)) onRestore();
        },
      }),
    [onRestore],
  );
  return (
    <View
      {...swipe.panHandlers}
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) }, wide ? styles.wrapWide : { left: Math.max(insets.left, 12), right: Math.max(insets.right, 12) }]}>
      <View style={styles.bar}>
        <Pressable
          onPress={onRestore}
          accessibilityRole="button"
          accessibilityLabel={restoreA11yLabel(waiting)}
          accessibilityHint="You can also swipe the bar up"
          hitSlop={6}
          style={({ pressed }) => [styles.restore, pressed && { opacity: 0.8 }]}>
          <Icon name="collapse" size={18} color={Colors.text} strokeWidth={2.4} />
          <Text style={styles.restoreText}>{RESTORE_LABEL}</Text>
          {waiting ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{waiting}</Text>
            </View>
          ) : null}
        </Pressable>
        {children ? <View style={styles.extra}>{children}</View> : null}
      </View>
      {credit && Platform.OS !== 'web' ? <Text style={styles.credit} numberOfLines={1}>{credit}</Text> : null}
    </View>
  );
}

/** A big number with a small unit for the Full Map bar ("12.4 mi", "23 mph"). */
export function BarReadout({ value, unit, label }: { value: string; unit?: string; label?: string }) {
  return (
    <Text style={styles.readout} numberOfLines={1} accessibilityLabel={label ?? `${value} ${unit ?? ''}`.trim()}>
      {value}
      {unit ? <Text style={styles.readoutUnit}> {unit}</Text> : null}
    </Text>
  );
}

/** A small round-ended button for the Full Map bar (Undo). */
export function BarChip({ title, onPress, disabled, label }: { title: string; onPress: () => void; disabled?: boolean; label?: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label ?? title}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={6}
      style={({ pressed }) => [styles.chip, disabled && { opacity: 0.4 }, pressed && { opacity: 0.75 }]}>
      <Text style={styles.chipText}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fullBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34, paddingHorizontal: 12,
    borderRadius: 17, backgroundColor: Colors.backgroundSelected,
  },
  fullText: { color: Colors.text, fontFamily: font(700), fontSize: 14 },
  wrap: { position: 'absolute', zIndex: 40 },
  wrapWide: { left: 20, width: 400 },
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: FULL_MAP_BAR_H, padding: 4, paddingRight: 8,
    borderRadius: Radius.control + 6, ...glass,
  },
  restore: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 16,
    borderRadius: Radius.control + 2, backgroundColor: Colors.backgroundSelected,
  },
  restoreText: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 18 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: RideColors.yellow },
  badgeText: { color: '#1A1100', fontFamily: font(800), fontSize: 13 },
  extra: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
  credit: { marginTop: 4, color: Colors.text, fontFamily: font(500), fontSize: 10, textAlign: 'center', opacity: 0.75, textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3 },
  readout: { flexShrink: 1, color: Colors.text, fontFamily: font(800, 'display'), fontSize: 24 },
  readoutUnit: { color: Colors.textSecondary, fontFamily: font(700, 'display'), fontSize: 15 },
  chip: {
    minHeight: 40, paddingHorizontal: 14, borderRadius: Radius.pill, justifyContent: 'center',
    backgroundColor: Colors.backgroundSelected, borderWidth: 1, borderColor: Colors.border,
  },
  chipText: { color: Colors.text, fontFamily: font(700), fontSize: 15 },
});
