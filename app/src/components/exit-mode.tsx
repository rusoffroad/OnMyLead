import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { BackHandler, Platform, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui';
import { Colors, font, Glass, Radius, Spacing, themedStyles } from '@/constants/theme';
import { EXIT_LABEL, exitTarget, rideExitPrompt } from '@/core/mode-exit';
import { t } from '@/lib/i18n';

/**
 * Out of Ride Mode or Map Mode: back to the screen the rider came from, or Home when there's
 * nothing to go back to (opened from a notification, a link or the car screen).
 */
export function leaveModeScreen() {
  if (exitTarget(router.canGoBack()) === 'back') router.back();
  else router.replace('/');
}

/**
 * The Exit button at the top left of Ride Mode and Map Mode: a chevron and the word Exit, big
 * enough to hit with a glove. `bare` is the icon-only square for the Full Map bar.
 */
export function ExitModeButton({
  onPress, label, bare, style,
}: {
  onPress: () => void;
  /** What a screen reader says ("Exit Ride Mode"). */
  label: string;
  bare?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [bare ? styles.bare : styles.pill, pressed && { opacity: 0.75 }, style]}>
      <Icon name="back" size={bare ? 20 : 17} color={Colors.text} strokeWidth={2.6} />
      {bare ? null : <Text style={styles.text}>{t(EXIT_LABEL)}</Text>}
    </Pressable>
  );
}

/** Room the corner Exit takes, so Map Settings sits just right of it in Full Map. */
export const CORNER_EXIT_ROOM = 46 + 10;

/**
 * Exit in Full Map: a round button in the top-left corner of the map, where riders look for a way
 * out (Chris, 3.1 build 16). Map Settings moves right of it (CORNER_EXIT_ROOM).
 */
export function CornerExitButton({ onPress, label, top, left }: { onPress: () => void; label: string; top: number; left: number }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.corner, { top, left }, pressed && { opacity: 0.85, transform: [{ scale: 0.94 }] }]}>
      <Icon name="back" size={20} color={Colors.text} strokeWidth={2.6} />
    </Pressable>
  );
}

/**
 * The Android back button on a map screen: `onBack` decides what it does (core/mode-exit
 * backPress) and the screen keeps it. Only while the screen is in front, so a screen pushed on top
 * gets its own back.
 */
export function useModeBackButton(onBack: () => void) {
  const latest = useRef(onBack);
  useEffect(() => {
    latest.current = onBack;
  });
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        latest.current();
        return true;
      });
      return () => sub.remove();
    }, []),
  );
}

/**
 * Exit Ride Mode: the rider stays on the ride, and while sharing picks whether the group keeps
 * seeing them. `leave` is the Leave Ride button, under the choices, for a rider who's done.
 */
export function ExitRideSheet({
  visible, onClose, rideName, sharing = true, onKeepSharing, onStopSharing, leave,
}: {
  visible: boolean;
  onClose: () => void;
  rideName: string;
  sharing?: boolean;
  onKeepSharing: () => void;
  onStopSharing: () => Promise<void>;
  leave?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const p = rideExitPrompt(rideName, sharing);
  const stop = async () => {
    setBusy(true);
    try {
      await onStopSharing();
    } finally {
      setBusy(false);
    }
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} title={p.title}>
      <Text style={styles.message}>{p.message}</Text>
      <View style={styles.choices}>
        <Button title={p.keep} big onPress={onKeepSharing} />
        {p.stop ? <Button title={p.stop} kind="secondary" loading={busy} onPress={stop} /> : null}
        <Button title={p.stay} kind="ghost" onPress={onClose} />
      </View>
      {leave ? (
        <View style={styles.leave}>
          <Text style={styles.done}>{p.done}</Text>
          {leave}
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = themedStyles(() => ({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingLeft: 8, paddingRight: 12,
    borderRadius: Radius.pill, backgroundColor: Glass.tile, borderWidth: 1, borderColor: Glass.edge,
  },
  bare: {
    width: 48, height: 48, borderRadius: Radius.control + 2, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.backgroundSelected,
  },
  corner: {
    position: 'absolute', zIndex: 21, width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Glass.panel, borderWidth: 1, borderColor: Glass.edge,
    shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  text: { color: Colors.text, fontFamily: font(700), fontSize: 15 },
  message: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 16, lineHeight: 22 },
  choices: { gap: Spacing.two },
  leave: { gap: Spacing.two, paddingTop: Spacing.three, borderTopWidth: 1, borderTopColor: Colors.border },
  done: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 14, lineHeight: 19 },
}));
