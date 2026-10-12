import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius } from '@/constants/theme';
import { togetherLabel, type RideMate } from '@/core/groups';
import { RiderDot } from './convoy';
import { Icon } from './icon';
import { ThemedText } from './themed-text';

/** Tick the people you've ridden with to add them to a group. */
export function RiderPicker({ mates, picked, onChange }: { mates: RideMate[]; picked: string[]; onChange: (ids: string[]) => void }) {
  return (
    <View style={styles.list}>
      {mates.map((m, i) => {
        const on = picked.includes(m.id);
        return (
          <Pressable
            key={m.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${m.name}, ${togetherLabel(m.ridesTogether)}`}
            onPress={() => onChange(on ? picked.filter((id) => id !== m.id) : [...picked, m.id])}
            style={({ pressed }) => [styles.row, i > 0 && styles.rule, pressed && { backgroundColor: Colors.backgroundSelected }]}>
            <RiderDot name={m.name} size={36} />
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontWeight: 700 }} numberOfLines={1}>{m.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{togetherLabel(m.ridesTogether)}</ThemedText>
            </View>
            <View style={[styles.box, on && styles.boxOn]}>
              {on ? <Icon name="check" color="#fff" size={18} strokeWidth={2.8} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: Colors.backgroundElement, borderRadius: Radius.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, minHeight: 60 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  box: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
});
