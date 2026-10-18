import { ReactNode, useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { font, Spacing } from '@/constants/theme';
import { ROW_ACTION_LABEL, type RowAction } from '@/core/row-swipe';
import { useTheme } from '@/hooks/use-theme';
import { Icon } from './icon';

/** On the website there's nothing to swipe, so the action is a button on the row and the list needs no hint. */
export const ROW_ACTION_HINT: string | null = null;

/**
 * The website's version of the swipe row: the same Delete (red), Leave or Decline (blue) action,
 * as a button at the end of the row that works with a mouse or the keyboard. `onAction` asks first.
 * Wide windows show the word next to the icon; narrow ones just the icon.
 */
export function SwipeRow({ action, onAction, children }: { action: RowAction; onAction: () => Promise<boolean>; children: ReactNode }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  const color = action === 'delete' ? theme.accent : theme.sky;
  const label = ROW_ACTION_LABEL[action];
  const wide = width >= 600;

  const run = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onAction();
    } finally {
      setBusy(false);
    }
  }, [busy, onAction]);

  return (
    <View style={styles.row}>
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={busy}
        onPress={run}
        style={({ hovered, pressed }) => [
          styles.action,
          { borderColor: hovered ? color : theme.backgroundSelected },
          (hovered || pressed) && { backgroundColor: theme.backgroundSelected },
        ]}>
        {({ hovered }) => (
          <>
            {busy ? (
              <ActivityIndicator size="small" color={color} />
            ) : (
              <Icon name={action === 'delete' ? 'trash' : 'leave'} size={18} color={hovered ? color : theme.textSecondary} strokeWidth={2.2} />
            )}
            {wide ? <Text style={[styles.label, { color: hovered ? color : theme.textSecondary }]}>{label}</Text> : null}
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingRight: Spacing.three },
  action: {
    minWidth: 44,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    cursor: 'pointer',
  } as object,
  label: { fontSize: 14, lineHeight: 18, fontFamily: font(600) },
});
