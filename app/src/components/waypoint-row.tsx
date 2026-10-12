import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { WaypointBlaze } from '@/components/waypoint-blaze';
import { Colors, font } from '@/constants/theme';
import { kindLabel, waypointAudience, type Waypoint } from '@/core/waypoints';

/** One waypoint in a list: its blaze, name, kind and who sees it. */
export function WaypointRow({
  waypoint: w, me, ownerName, onPress, first,
}: {
  waypoint: Waypoint;
  me: string | null | undefined;
  ownerName: (userId: string) => string;
  onPress: () => void;
  first?: boolean;
}) {
  const audience = waypointAudience(w, me, ownerName(w.user_id));
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${w.name}, ${kindLabel(w.kind)}, ${audience}`}
      style={({ pressed }) => [styles.row, !first && styles.divider, pressed && { opacity: 0.7 }]}>
      <WaypointBlaze kind={w.kind} shared={w.shared} size={30} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{w.name}</Text>
        <Text style={[styles.meta, w.shared && { color: Colors.sky }]} numberOfLines={1}>
          {kindLabel(w.kind)}, {audience}
        </Text>
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
});
