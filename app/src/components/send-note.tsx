import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, font, Radius, RideColors, Spacing } from '@/constants/theme';
import type { SendState } from '@/core/chat';

export type SendNoteValue = { key: number; what: string; state: Exclude<SendState, 'failed'> };

const COLOR = { sending: Colors.textSecondary, sent: RideColors.green, queued: RideColors.yellow } as const;

/**
 * Ride Mode's big, glanceable proof that a tap went out: Sending, then Sent, or Waiting for
 * Signal (it sends by itself once there is service, or the rider taps Retry Now).
 */
export function SendNote({ note, onRetry, onDismiss }: { note: SendNoteValue; onRetry: () => void; onDismiss: () => void }) {
  const color = COLOR[note.state];
  const line =
    note.state === 'sending' ? `Sending ${note.what}…`
      : note.state === 'sent' ? `${note.what} Sent`
        : `${note.what} is waiting for signal. It sends by itself.`;
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.wrap, { borderLeftColor: color }]}>
      {note.state === 'sending' ? <ActivityIndicator color={color} /> : (
        <Text style={[styles.icon, { color }]}>{note.state === 'sent' ? '✓' : '!'}</Text>
      )}
      <Text style={styles.text} numberOfLines={3}>{line}</Text>
      {note.state === 'queued' ? (
        <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={8} style={({ pressed }) => [styles.retry, { opacity: pressed ? 0.75 : 1 }]}>
          <Text style={styles.retryText}>Retry Now</Text>
        </Pressable>
      ) : null}
      {note.state !== 'sending' ? (
        <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={12} style={styles.close}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Colors.backgroundSelected,
    borderRadius: Radius.control,
    borderLeftWidth: 5,
    paddingVertical: 10,
    paddingHorizontal: Spacing.three,
    minHeight: 48,
  },
  icon: { fontFamily: font(800), fontSize: 20, width: 20, textAlign: 'center' },
  text: { flex: 1, color: Colors.text, fontFamily: font(700, 'display'), fontSize: 18, lineHeight: 22 },
  retry: { minHeight: 40, paddingHorizontal: 12, borderRadius: Radius.control, justifyContent: 'center', backgroundColor: RideColors.yellow },
  retryText: { color: '#1A1100', fontFamily: font(700, 'display'), fontSize: 16 },
  close: { paddingHorizontal: 2 },
  closeText: { color: Colors.textSecondary, fontSize: 18 },
});
