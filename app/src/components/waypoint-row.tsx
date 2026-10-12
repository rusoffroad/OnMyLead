import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { StopSign, WaypointBlaze } from '@/components/waypoint-blaze';
import { Colors, font } from '@/constants/theme';
import { kindLabel, stopTimeLabel, waypointAudience, type Waypoint } from '@/core/waypoints';

/** One waypoint in a list: its blaze, name, kind and who sees it. A planned stop shows its number and time. */
export function WaypointRow({
  waypoint: w, me, ownerName, onPress, first, stop,
}: {
  /** Its number, for a planned stop (stopNumber). */
  stop?: number | null;
  waypoint: Waypoint;
  me: string | null | undefined;
  ownerName: (userId: string) => string;
  onPress: () => void;
  first?: boolean;
}) {
  const time = stopTimeLabel(w.stop_time);
  const audience = w.planned_stop
    ? [`Stop ${stop ?? ''}`.trim(), time, kindLabel(w.kind)].filter(Boolean).join(', ')
    : `${kindLabel(w.kind)}, ${waypointAudience(w, me, ownerName(w.user_id))}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${w.name}, ${audience}`}
      style={({ pressed }) => [styles.row, !first && styles.divider, pressed && { opacity: 0.7 }]}>
      {w.planned_stop ? <StopSign n={stop ?? null} size={32} /> : <WaypointBlaze kind={w.kind} shared={w.shared} size={30} />}
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{w.name}</Text>
        <Text style={[styles.meta, w.shared && { color: Colors.sky }, w.planned_stop && styles.stopMeta]} numberOfLines={1}>
          {audience}
        </Text>
        {w.planned_stop && w.note ? <Text style={styles.note} numberOfLines={2}>{w.note}</Text> : null}
      </View>
      <Icon name="chevron" size={18} color={Colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  name: { color: Colors.text, fontFamily: font(700), fontSize: 17 },
  meta: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 13 },
  stopMeta: { color: Colors.text, fontVariant: ['tabular-nums'] },
  note: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13, lineHeight: 17, marginTop: 2 },
});
