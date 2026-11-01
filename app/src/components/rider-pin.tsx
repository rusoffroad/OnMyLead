import { StyleSheet, Text, View } from 'react-native';

import { Colors, font, RideColors } from '@/constants/theme';
import type { MapRider } from './group-map-types';
import { MarkerBody } from './marker-body';
import { RIDER_DOT, RiderDot } from './rider-dot';
import { BreakdownBadge } from './rider-status-badge';

/** Wide enough for a 24-character name or "No Signal, 25 Min Ago"; the dot sits dead centre so the anchor stays on it. */
const PIN_W = 300;

/**
 * A rider on the live map: their dot (white-ringed only while live) with a dark name pill beside
 * it (blue for the leader), and the age on the pill once the position is only where they were last
 * seen. The dot is the exact centre of the marker, which MarkerBody keeps on the coordinate.
 */
export function RiderPin({ rider: r }: { rider: MapRider }) {
  const leader = r.role === 'leader';
  const size = leader ? RIDER_DOT.leader : RIDER_DOT.rider;
  const trouble = r.status === 'red' || r.status === 'yellow';
  const ring = size + 12;
  const f = r.freshness;
  const live = f?.state === 'live';
  return (
    <MarkerBody style={styles.pin}>
      {trouble ? (
        <View style={[styles.ring, { width: ring, height: ring, borderRadius: ring / 2, borderColor: RideColors[r.status] }]} />
      ) : null}
      <RiderDot role={r.role} freshness={f?.state ?? null} size={size} />
      {r.breakdown ? (
        <View style={[styles.badge, { left: PIN_W / 2 + size / 2 - 6, top: 22 - size / 2 - 8 }]}>
          <BreakdownBadge size={18} />
        </View>
      ) : null}
      <View
        style={[
          styles.label,
          { left: PIN_W / 2 + (trouble ? ring : size) / 2 + (r.breakdown ? 14 : 4) },
          leader && live && styles.leaderLabel,
          !live && styles.staleLabel,
        ]}>
        <Text style={[styles.name, leader && styles.leaderName, !live && styles.staleName]} numberOfLines={1}>
          {r.name}
        </Text>
        {f && !live ? (
          <Text style={[styles.age, f.state === 'lost' && styles.lostAge]} numberOfLines={1}>
            {f.state === 'lost' ? f.label : `Last Seen ${f.ago}`}
          </Text>
        ) : null}
      </View>
    </MarkerBody>
  );
}

const styles = StyleSheet.create({
  pin: { width: PIN_W, height: 44, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute' },
  ring: { position: 'absolute', borderWidth: 3, backgroundColor: 'rgba(10,22,38,0.35)' },
  label: {
    position: 'absolute', maxWidth: PIN_W / 2 - 24, paddingHorizontal: 5, paddingVertical: 1,
    borderRadius: 7, backgroundColor: 'rgba(10,22,38,0.88)',
  },
  leaderLabel: { backgroundColor: RideColors.leader },
  // A last-seen tag is outlined, not filled, so it never reads like a live one.
  staleLabel: { backgroundColor: 'rgba(10,22,38,0.9)', borderWidth: 1, borderColor: Colors.border },
  name: { color: Colors.text, fontFamily: font(700), fontSize: 12, lineHeight: 15 },
  leaderName: { color: '#fff', fontFamily: font(800), fontSize: 13, lineHeight: 16 },
  staleName: { color: Colors.textSecondary },
  age: { color: Colors.textSecondary, fontFamily: font(700), fontSize: 10, lineHeight: 13 },
  lostAge: { color: Colors.text, fontFamily: font(800) },
});
