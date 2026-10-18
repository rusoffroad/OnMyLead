import * as Haptics from 'expo-haptics';
import { ReactNode, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { font } from '@/constants/theme';
import { ACTION_WIDTH, isHorizontalSwipe, ROW_ACTION_LABEL, rowSwipeResult, type RowAction } from '@/core/row-swipe';
import { useTheme } from '@/hooks/use-theme';
import { Icon } from './icon';

/** The line over a list of swipe rows saying what a swipe does. */
export const ROW_ACTION_HINT: string | null = 'Swipe Left to Delete or Leave';

/**
 * A list row you can swipe left to show one action behind it: Delete (red) for your own ride,
 * Leave or Decline (blue) for anyone else's. A long swipe runs it straight away. Either way
 * `onAction` asks first and resolves true only when the ride is gone from the list.
 * The row's own tap still opens it; while the action is showing, a tap just closes it.
 */
export function SwipeRow({ action, onAction, children }: { action: RowAction; onAction: () => Promise<boolean>; children: ReactNode }) {
  const theme = useTheme();
  const [x] = useState(() => new Animated.Value(0));
  const [width, setWidth] = useState(360);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const color = action === 'delete' ? theme.accent : theme.sky;
  const label = ROW_ACTION_LABEL[action];

  const settle = useCallback(
    (to: number) => Animated.spring(x, { toValue: to, useNativeDriver: true, bounciness: 0, speed: 18 }).start(),
    [x],
  );
  const close = useCallback(() => {
    setOpen(false);
    settle(0);
  }, [settle]);

  const run = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setOpen(true);
    let gone = false;
    try {
      gone = await onAction();
    } finally {
      setBusy(false);
      // When it worked the list drops the row; otherwise it slides back.
      if (!gone) close();
    }
  }, [busy, onAction, close]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Capture so a sideways drag wins over the row's own tap, but only leftward (or back, when open).
        onMoveShouldSetPanResponderCapture: (_e, g) => !busy && isHorizontalSwipe(g.dx, g.dy) && (g.dx < 0 || open),
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_e, g) => x.setValue(Math.min(0, Math.max(-width, (open ? -ACTION_WIDTH : 0) + g.dx))),
        onPanResponderRelease: (_e, g) => {
          const result = rowSwipeResult(g.dx, g.vx, open, width);
          if (result === 'run') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            settle(-width);
            run();
          } else if (result === 'open') {
            Haptics.selectionAsync().catch(() => {});
            setOpen(true);
            settle(-ACTION_WIDTH);
          } else {
            close();
          }
        },
        onPanResponderTerminate: close,
      }),
    [busy, open, width, x, settle, close, run],
  );

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityActions={[{ name: action, label }]}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === action && run()}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.behind,
          { backgroundColor: color, opacity: x.interpolate({ inputRange: [-12, 0], outputRange: [1, 0], extrapolate: 'clamp' }) },
        ]}>
        <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => { settle(-ACTION_WIDTH); run(); }} style={styles.action}>
          {busy ? <ActivityIndicator color="#fff" /> : <Icon name={action === 'delete' ? 'trash' : 'leave'} size={24} color="#fff" strokeWidth={2.3} />}
          <Text style={styles.label}>{label}</Text>
        </Pressable>
      </Animated.View>
      <Animated.View {...pan.panHandlers} style={{ backgroundColor: theme.backgroundElement, transform: [{ translateX: x }] }}>
        {children}
        {open ? <Pressable accessibilityLabel="Close" onPress={close} style={StyleSheet.absoluteFill} /> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  behind: { alignItems: 'flex-end', justifyContent: 'center' },
  action: { width: ACTION_WIDTH, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 4 },
  label: { color: '#fff', fontSize: 14, lineHeight: 16, fontFamily: font(700) },
});
