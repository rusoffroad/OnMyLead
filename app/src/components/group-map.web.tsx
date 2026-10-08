import { StyleSheet, Text, View } from 'react-native';

import { Colors, font, RideColors } from '@/constants/theme';
import type { MapRider } from './group-map-types';

export type { MapRider } from './group-map-types';

/** The web build has no native map; show the group as a list so the screen still works. */
export function GroupMap({
  riders, regroup,
}: {
  riders: MapRider[];
  regroup: { lat: number; lng: number; label: string | null } | null;
  onPressRider?: (id: string) => void;
}) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap]}>
      {regroup ? <Text style={styles.regroup}>Regroup point: {regroup.lat.toFixed(4)}, {regroup.lng.toFixed(4)}</Text> : null}
      {riders.map((r) => (
        <View key={r.id} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: RideColors[r.status] }]} />
          <Text style={styles.name}>{r.name}{r.role !== 'rider' ? ` (${r.role})` : ''}</Text>
          <Text style={styles.detail}>{r.detail}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingTop: 140, gap: 10, backgroundColor: Colors.background },
  regroup: { color: RideColors.yellow, fontFamily: font(700), fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  name: { color: Colors.text, fontFamily: font(700), fontSize: 16 },
  detail: { color: Colors.textSecondary, fontFamily: font(500), flex: 1 },
});
