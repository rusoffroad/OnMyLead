import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, font, Radius, RideColors, Spacing } from '@/constants/theme';
import { headline, stateDetail, tallyLine, type Broadcast, type BroadcastState, type Tally } from '@/core/broadcast';

const TINT: Record<BroadcastState, string> = {
  sending: Colors.sky,
  sent: RideColors.green,
  queued: RideColors.yellow,
  cancelling: Colors.textSecondary,
  cancelled: Colors.textSecondary,
};

/** Most dots the card shows before it just counts. */
const MAX_DOTS = 10;

type Props = {
  card: Broadcast;
  tally: Tally;
  receiptsOn: boolean;
  nameOf: (id: string) => string;
  onCancel: () => void;
  onRetry: () => void;
  onDismiss: () => void;
};

/**
 * Ride Mode's answer to a status tap or quick reply: what went out, a light per rider that comes
 * on as the tap reaches them (solid once their app has it, a ring once a push went to them), and
 * a big Cancel. Built to be read at a glance from a moving vehicle.
 */
export function BroadcastCard({ card, tally, receiptsOn, nameOf, onCancel, onRetry, onDismiss }: Props) {
  const tint = card.urgent && card.state === 'sent' ? Colors.danger : TINT[card.state];
  const out = card.state === 'sent' || card.state === 'cancelling';
  const riders = [...tally.seen.map((id) => ({ id, s: 'seen' as const })), ...tally.notified.map((id) => ({ id, s: 'pushed' as const })),
    ...tally.waiting.map((id) => ({ id, s: 'waiting' as const }))];
  const detail = out && card.state === 'sent'
    ? receiptsOn ? tallyLine(tally, nameOf) : 'Sent. Seen receipts aren’t switched on yet.'
    : stateDetail(card.state);
  const canCancel = card.state === 'sent' || card.state === 'queued' || card.state === 'sending';

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${headline(card)}. ${detail ?? ''}`}
      style={[styles.wrap, { borderColor: tint }]}>
      <View style={styles.top}>
        <View style={[styles.mark, { backgroundColor: card.state === 'sent' ? tint : 'transparent', borderColor: tint }]}>
          {card.state === 'sending' || card.state === 'cancelling' ? (
            <ActivityIndicator color={tint} size="small" />
          ) : (
            <Text style={[styles.markText, { color: card.state === 'sent' ? Colors.background : tint }]}>
              {card.state === 'sent' ? '✓' : card.state === 'queued' ? '!' : '↺'}
            </Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headline, card.state === 'cancelled' && styles.struck]} numberOfLines={2}>{headline(card)}</Text>
          {detail ? <Text style={styles.detail} numberOfLines={2}>{detail}</Text> : null}
        </View>
        {card.state === 'sent' || card.state === 'queued' ? (
          <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Hide" hitSlop={12} style={styles.close}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {out && receiptsOn && riders.length ? (
        <View style={styles.lights} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {riders.slice(0, MAX_DOTS).map(({ id, s }) => (
            <View
              key={id}
              style={[
                styles.light,
                s === 'seen' && { backgroundColor: RideColors.green, borderColor: RideColors.green },
                s === 'pushed' && { borderColor: Colors.sky },
              ]}>
              <Text style={[styles.initial, s === 'seen' && { color: Colors.background }]}>{nameOf(id).trim().charAt(0).toUpperCase() || '?'}</Text>
            </View>
          ))}
          {riders.length > MAX_DOTS ? <Text style={styles.more}>+{riders.length - MAX_DOTS}</Text> : null}
        </View>
      ) : null}

      {canCancel ? (
        <View style={styles.actions}>
          {card.state === 'queued' ? (
            <Pressable onPress={onRetry} accessibilityRole="button" style={({ pressed }) => [styles.retry, { opacity: pressed ? 0.75 : 1 }]}>
              <Text style={styles.retryText}>Retry Now</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel={`Cancel ${card.label}`}
            accessibilityHint="Takes it back and tells the group to ignore it"
            style={({ pressed }) => [styles.cancel, { opacity: pressed ? 0.7 : 1 }]}>
            <Text style={styles.cancelText}>Cancel {card.label}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.backgroundElement,
    borderRadius: Radius.control,
    borderWidth: 2,
    padding: Spacing.three - 4,
    gap: 10,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  markText: { fontFamily: font(800), fontSize: 19, lineHeight: 22 },
  headline: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 21, lineHeight: 24 },
  struck: { color: Colors.textSecondary, textDecorationLine: 'line-through' },
  detail: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 15, lineHeight: 19, marginTop: 2 },
  close: { alignSelf: 'flex-start', paddingHorizontal: 2 },
  closeText: { color: Colors.textSecondary, fontSize: 18 },
  lights: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingLeft: 48 },
  light: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: Colors.border,
    backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center',
  },
  initial: { color: Colors.textSecondary, fontFamily: font(700, 'display'), fontSize: 13 },
  more: { color: Colors.textSecondary, fontFamily: font(700, 'display'), fontSize: 15 },
  actions: { flexDirection: 'row', gap: Spacing.two },
  retry: {
    flex: 1, minHeight: 48, borderRadius: Radius.control, backgroundColor: RideColors.yellow, alignItems: 'center', justifyContent: 'center',
  },
  retryText: { color: '#1A1100', fontFamily: font(700, 'display'), fontSize: 18 },
  cancel: {
    flex: 1, minHeight: 48, borderRadius: Radius.control, borderWidth: 2, borderColor: Colors.border,
    backgroundColor: Colors.backgroundSelected, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.two,
  },
  cancelText: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 18 },
});
