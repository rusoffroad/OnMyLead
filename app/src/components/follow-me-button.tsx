import * as Haptics from 'expo-haptics';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Colors, font, GlassSurface } from '@/constants/theme';
import { FOLLOW_ME_LABEL, type FollowMeStatus } from '@/core/follow-camera';
import { Icon } from './icon';

export const FOLLOW_ME_H = 48;

const HINT: Record<FollowMeStatus, string> = {
  off: 'Turns Follow Me on: the map keeps moving with you',
  following: 'The map is moving with you. Tap to turn Follow Me off',
  paused: 'You moved the map, so it stopped following. Tap to follow you again',
};

/**
 * Follow Me on a live map, next to Center on Me. Lit blue while the map is moving with the rider,
 * a blue outline once they drag the map (paused, one tap picks it back up), and plain when they
 * turned it off. In Full Map it is the icon alone, so the map stays as big as it can be.
 */
export function FollowMeButton({
  status, onPress, compact, style,
}: {
  status: FollowMeStatus;
  onPress: () => void;
  /** Icon only (Full Map, or no room for the label). */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const following = status === 'following';
  const ink = following ? '#FFFFFF' : status === 'paused' ? Colors.sky : Colors.textSecondary;
  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      accessibilityRole="switch"
      accessibilityLabel="Follow Me"
      accessibilityHint={HINT[status]}
      accessibilityState={{ checked: status !== 'off' }}
      accessibilityValue={{ text: FOLLOW_ME_LABEL[status] }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.btn,
        compact ? styles.round : styles.pill,
        following && styles.on,
        status === 'paused' && styles.paused,
        pressed && { opacity: 0.8 },
        style,
      ]}>
      <View style={status === 'off' ? styles.offIcon : undefined}>
        <Icon name="follow" size={compact ? 22 : 20} color={ink} strokeWidth={2.3} />
      </View>
      {compact ? null : <Text style={[styles.label, { color: following ? '#FFFFFF' : status === 'paused' ? Colors.sky : Colors.text }]}>{FOLLOW_ME_LABEL[status]}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: 'absolute', zIndex: 15, height: FOLLOW_ME_H, borderRadius: FOLLOW_ME_H / 2, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 7, ...GlassSurface,
  },
  pill: { paddingLeft: 13, paddingRight: 16 },
  round: { width: FOLLOW_ME_H },
  on: { backgroundColor: Colors.sky, borderColor: '#FFFFFF' },
  paused: { borderColor: Colors.sky, borderWidth: 2 },
  // Turned off: the arrow tips over a little, so it reads as resting rather than on the move.
  offIcon: { transform: [{ rotate: '-35deg' }] },
  label: { fontFamily: font(700, 'display'), fontSize: 16 },
});
