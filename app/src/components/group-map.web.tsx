import { StyleSheet, Text, View } from 'react-native';

import { Colors, font, RideColors } from '@/constants/theme';
import type { TrailMap } from '@/hooks/use-trail-map';
import type { MapRider } from './group-map-types';
import { BreakdownBadge } from './rider-status-badge';
import { RouteSketch } from './route-sketch';

export type { MapRider } from './group-map-types';

/**
 * The web build has no native map. With a route, draw it with the riders on it; without one,
 * show the group as a list so the screen still works.
 */
export function GroupMap({
  riders, regroup, route,
}: {
  riders: MapRider[];
  route?: { lat: number; lng: number }[] | null;
  regroup: { lat: number; lng: number; label: string | null } | null;
  onPressRider?: (id: string) => void;
  trail?: TrailMap;
}) {
  if (route && route.length > 1) {
    const dots = riders
      .filter((r) => r.lat != null && r.lng != null)
      .map((r) => ({
        id: r.id,
        lat: r.lat!,
        lng: r.lng!,
        color: r.role === 'leader' ? RideColors.leader : RideColors.rider,
        big: r.role === 'leader',
        name: r.name,
      }));
    return (
      <View style={[StyleSheet.absoluteFill, styles.sketchWrap]}>
        <RouteSketch points={route} dots={dots} width={360} height={300} style={{ borderRadius: 0 }} label="The route with the group on it" />
      </View>
    );
  }
  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap]}>
      {regroup ? <Text style={styles.regroup}>Regroup point: {regroup.lat.toFixed(4)}, {regroup.lng.toFixed(4)}</Text> : null}
      {riders.map((r) => (
        <View key={r.id} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: r.role === 'leader' ? RideColors.leader : RideColors.rider }]} />
          <Text style={[styles.name, r.role === 'leader' && { color: RideColors.leader }]}>{r.name}{r.role === 'leader' ? ', leader' : ''}</Text>
          {r.breakdown ? <BreakdownBadge /> : null}
          <Text style={styles.detail}>{r.detail}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingTop: 140, gap: 10, backgroundColor: Colors.background },
  sketchWrap: { paddingTop: 120, backgroundColor: '#0D1C31' },
  regroup: { color: RideColors.yellow, fontFamily: font(700), fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  name: { color: Colors.text, fontFamily: font(700), fontSize: 16 },
  detail: { color: Colors.textSecondary, fontFamily: font(500), flex: 1 },
});
